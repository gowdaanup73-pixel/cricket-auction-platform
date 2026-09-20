import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractCallerIdentity } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { getIO, handleBidTimer } from "@/lib/socket-server";

const placeBidSchema = z.object({
  amount: z.number().int().positive(),
  requestId: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const caller = extractCallerIdentity(req);
    if (!caller) {
      return NextResponse.json(
        { error: "UNAUTHORIZED: Valid bidder account or private guest session required" },
        { status: 401 }
      );
    }

    if (caller.isGuest) {
      if (caller.guest.role !== "BIDDER") {
        return NextResponse.json(
          { error: "FORBIDDEN: Spectators are not permitted to place bids" },
          { status: 403 }
        );
      }
    } else {
      if (caller.user.role !== "BIDDER") {
        return NextResponse.json(
          { error: "FORBIDDEN: Requires BIDDER role to place bids" },
          { status: 403 }
        );
      }
    }

    const callerIdentifier = caller.isGuest
      ? `guest:${caller.guest.participantId || caller.guest.userId}`
      : `user:${caller.user.userId}`;

    const { id: itemId } = params;

    // Rate limit: Max 4 bids per second per bidder on a lot
    const rateLimit = checkRateLimit(`bid:${callerIdentifier}:${itemId}`, 4, 1000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Bidding too fast. Please slow down.", retryAfterMs: rateLimit.resetMs },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { amount, requestId } = placeBidSchema.parse(body);

    // Execute atomic bidding transaction with full-snapshot retry on write conflicts
    const maxRetries = 5;
    let lastError: any = null;
    let result: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        result = await prisma.$transaction(async (tx) => {
          // 1. If client provided a requestId, check for duplicate idempotency
          if (requestId) {
            const existingBid = await tx.bid.findFirst({
              where: {
                auction: {
                  items: { some: { id: itemId } },
                },
                requestId,
              },
            });
            if (existingBid) {
              throw new Error("DUPLICATE_REQUEST: This bid has already been received and processed");
            }
          }

          // 2. Fetch Item with Auction
          const item = await tx.item.findUnique({
            where: { id: itemId },
            include: {
              auction: true,
            },
          });

          if (!item) {
            throw new Error("NOT_FOUND: Item not found");
          }

          const { auction } = item;

          // 3. Validate Auction & Item Status
          if (auction.status !== "LIVE") {
            throw new Error(`AUCTION_NOT_LIVE: Cannot bid when auction status is ${auction.status}`);
          }

          if (item.status !== "ACTIVE") {
            throw new Error(`ITEM_NOT_ACTIVE: Item is currently ${item.status}. Bidding is only allowed on ACTIVE items.`);
          }

          // 4. Validate and resolve Participant strictly on the server (cannot be forged by client)
          let participant: any = null;
          let bidderUserId: string = "";

          if (caller.isGuest) {
            // Enforce cross-auction protection
            if (caller.guest.auctionId !== auction.id) {
              throw new Error("FORBIDDEN: Guest session is not valid for this auction");
            }

            // Verify underlying invite token has not been revoked or regenerated
            let currentInviteToken: string | null = null;
            let parsedTokens: string[] = [];
            if (auction.bidderInvites) {
              try {
                parsedTokens = JSON.parse(auction.bidderInvites);
              } catch (e) {}
            }

            if (caller.guest.teamSlot === "A") currentInviteToken = auction.bidderInviteA || parsedTokens[0] || null;
            else if (caller.guest.teamSlot === "B") currentInviteToken = auction.bidderInviteB || parsedTokens[1] || null;
            else if (caller.guest.teamSlot) {
              const slotIdx = caller.guest.teamSlot.charCodeAt(0) - 65;
              if (slotIdx >= 0 && slotIdx < parsedTokens.length) {
                currentInviteToken = parsedTokens[slotIdx];
              }
            }

            if (!currentInviteToken || currentInviteToken !== caller.guest.tokenVersion) {
              throw new Error("FORBIDDEN: Your invitation has been regenerated or revoked");
            }

            // Retrieve the participant bound to this guest session
            if (!caller.guest.participantId) {
              throw new Error("FORBIDDEN: Invalid guest participant configuration");
            }

            participant = await tx.auctionParticipant.findUnique({
              where: { id: caller.guest.participantId },
            });

            if (!participant || participant.auctionId !== auction.id) {
              throw new Error("FORBIDDEN: Participant team not found for this auction");
            }

            bidderUserId = participant.userId;
          } else {
            // Logged-in user
            participant = await tx.auctionParticipant.findUnique({
              where: {
                auctionId_userId: {
                  auctionId: auction.id,
                  userId: caller.user.userId,
                },
              },
            });

            if (!participant) {
              throw new Error("FORBIDDEN: You are not a registered participant in this auction");
            }

            bidderUserId = caller.user.userId;
          }

          // 5. Validate Budget
          if (amount > participant.remainingBudget) {
            throw new Error(
              `INSUFFICIENT_BUDGET: Bid amount ₹${amount.toLocaleString("en-IN")} exceeds your remaining purse of ₹${participant.remainingBudget.toLocaleString("en-IN")}`
            );
          }

          // 6. Atomic Touch/Update on the active Item document to establish write serialization
          await tx.item.update({
            where: { id: item.id },
            data: { updatedAt: new Date() },
          });

          // 7. Re-read Current Highest Bid AFTER Item write-lock / serialization point
          const currentHighestBid = await tx.bid.findFirst({
            where: {
              itemId: item.id,
            },
            orderBy: { amount: "desc" },
          });

          const minRequired = currentHighestBid
            ? currentHighestBid.amount + auction.minimumBidIncrement
            : item.basePrice;

          if (amount < minRequired) {
            throw new Error(
              `BID_TOO_LOW: Bid must be at least ₹${minRequired.toLocaleString("en-IN")} (Current highest: ₹${(currentHighestBid?.amount || 0).toLocaleString("en-IN")}, min increment: ₹${auction.minimumBidIncrement.toLocaleString("en-IN")})`
            );
          }

          // 8. Record the Bid atomically
          const bid = await tx.bid.create({
            data: {
              auctionId: auction.id,
              itemId: item.id,
              bidderId: bidderUserId,
              amount,
              requestId: requestId || undefined,
            },
            include: {
              bidder: {
                select: { id: true, name: true, email: true },
              },
            },
          });

          return {
            bid,
            auction,
            item,
            participant,
          };
        });

        // Transaction completed successfully
        break;
      } catch (err: any) {
        lastError = err;
        const isWriteConflict =
          err.code === "P2034" ||
          err.message?.includes("WriteConflict") ||
          err.message?.includes("write conflict") ||
          err.message?.includes("deadlock");

        if (isWriteConflict && attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 10 * attempt));
          continue;
        }

        throw err;
      }
    }

    if (!result) {
      throw lastError || new Error("Failed to process bid transaction");
    }

    // Authoritatively reset countdown timer to 15 seconds on accepted bid
    const { secondsRemaining, timerExpiry } = handleBidTimer(
      result.auction.id,
      result.item.id,
      15
    );

    const formattedBid = {
      ...result.bid,
      timestamp: result.bid.timestamp.toISOString(),
      teamName: result.participant.teamName,
      bidder: {
        id: result.bid.bidder.id,
        name: result.bid.bidder.name,
        participant: {
          teamName: result.participant.teamName,
        },
      },
    };

    const currentHolder = {
      bidderId: result.bid.bidderId,
      bidderName: result.bid.bidder.name,
      teamName: result.participant.teamName,
    };

    // Broadcast Authoritative Real-Time Events
    try {
      const io = getIO();
      const payload = {
        auctionId: result.auction.id,
        itemId: result.item.id,
        bid: formattedBid,
        newHighestBid: result.bid.amount,
        currentHolder,
        secondsRemaining,
        timerExpiry,
      };

      io.to(`auction_${result.auction.id}`).emit("bid_placed", payload as any);
    } catch (e) {}

    return NextResponse.json({
      success: true,
      bid: formattedBid,
      newHighestBid: result.bid.amount,
      currentHolder,
      secondsRemaining,
      timerExpiry,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }

    const msg = error.message || "Failed to place bid";
    const status = msg.startsWith("UNAUTHORIZED")
      ? 401
      : msg.startsWith("FORBIDDEN")
      ? 403
      : msg.startsWith("NOT_FOUND")
      ? 404
      : msg.startsWith("DUPLICATE_REQUEST")
      ? 409
      : 400;

    return NextResponse.json({ error: msg }, { status });
  }
}
