import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuctioneerOwnership } from "@/lib/auth";
import { assertValidAuctionTransition, isAuctionConfigComplete } from "@/lib/auction-state";
import { getIO, startItemTimer, checkBidderReadiness } from "@/lib/socket-server";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: auctionId } = params;
    const { user } = await requireAuctioneerOwnership(req, auctionId);

    const fullAuction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        participants: true,
        items: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!fullAuction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    if (fullAuction.status === "LIVE") {
      return NextResponse.json(
        { error: "Auction has already started and is currently LIVE" },
        { status: 400 }
      );
    }

    if (fullAuction.status !== "DRAFT" && fullAuction.status !== "READY") {
      assertValidAuctionTransition(fullAuction.status as any, "READY");
    }

    // Comprehensive Pre-Flight Configuration Validations before READY / LIVE
    if (!isAuctionConfigComplete(fullAuction)) {
      return NextResponse.json(
        { error: "Auction configuration is incomplete. Verify auction details, participant purse budgets, lots base prices, and timers." },
        { status: 400 }
      );
    }

    // Verify bidder readiness if in DRAFT or if checking presence
    const requiredBidderCount = fullAuction.bidderCount || fullAuction.participants.length || 2;
    const { allBiddersReady, readyBidderCount } = checkBidderReadiness(
      auctionId,
      fullAuction.participants,
      requiredBidderCount
    );
    if (fullAuction.status === "DRAFT" && !allBiddersReady) {
      return NextResponse.json(
        {
          error:
            requiredBidderCount === 2
              ? "Cannot start auction: Both Bidder A and Bidder B must be connected and ready."
              : `Cannot start auction: All ${requiredBidderCount} bidders must be connected and ready (${readyBidderCount}/${requiredBidderCount} connected).`,
        },
        { status: 400 }
      );
    }

    // Enforce server-authoritative state machine transitions: DRAFT -> READY -> LIVE
    if (fullAuction.status === "DRAFT") {
      assertValidAuctionTransition("DRAFT", "READY");
      assertValidAuctionTransition("READY", "LIVE");
    } else if (fullAuction.status === "READY") {
      assertValidAuctionTransition("READY", "LIVE");
    }

    // Execute atomic start transaction: lock config, activate first item, update status to LIVE
    const { updatedAuction, activatedItem } = await prisma.$transaction(
      async (tx) => {
        // Re-read auction within transaction to guard against concurrent double-start race conditions
        const currentAuction = await tx.auction.findUnique({
          where: { id: auctionId },
          include: {
            items: { orderBy: { orderIndex: "asc" } },
          },
        });

        if (!currentAuction) {
          throw new Error("NOT_FOUND: Auction not found");
        }

        if (currentAuction.status === "LIVE") {
          throw new Error("AUCTION_ALREADY_LIVE: Auction has already started and is currently LIVE");
        }

        if (currentAuction.status !== "DRAFT" && currentAuction.status !== "READY") {
          assertValidAuctionTransition(currentAuction.status as any, "LIVE");
        }

        // Determine active item to activate
        let activeItemId = currentAuction.activeItemId;
        let newlyActivatedItem = null;

        if (!activeItemId) {
          const firstPending = currentAuction.items.find((i) => i.status === "PENDING");
          if (firstPending) {
            activeItemId = firstPending.id;
            newlyActivatedItem = await tx.item.update({
              where: { id: firstPending.id },
              data: { status: "ACTIVE" },
            });
          }
        }

        const updated = await tx.auction.update({
          where: { id: auctionId },
          data: {
            status: "LIVE",
            isConfigLocked: true, // 🔒 Configuration permanently locked upon entering LIVE
            startedAt: currentAuction.startedAt || new Date(),
            activeItemId,
          },
        });

        await tx.auditLog.create({
          data: {
            auctionId,
            userId: user.userId,
            action: "AUCTION_STARTED",
            metadata: JSON.stringify({
              previousStatus: currentAuction.status,
              transitionSequence:
                currentAuction.status === "DRAFT" ? ["DRAFT", "READY", "LIVE"] : ["READY", "LIVE"],
              activeItemId,
              isConfigLocked: true,
            }),
          },
        });

        return { updatedAuction: updated, activatedItem: newlyActivatedItem };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );

    // Broadcast live start and start countdown timer ONLY after the transaction is fully committed
    try {
      const io = getIO();
      io.to(`auction_${auctionId}`).emit("auction_started", {
        auctionId,
        status: "LIVE",
      });

      if (activatedItem) {
        startItemTimer(auctionId, activatedItem.id, 15);
        io.to(`auction_${auctionId}`).emit("player_started", {
          auctionId,
          item: activatedItem as any,
          secondsRemaining: 15,
          timerExpiry: new Date(Date.now() + 15 * 1000).toISOString(),
        });
      }
    } catch (e) {
      // Socket not ready
    }

    return NextResponse.json({ auction: updatedAuction });
  } catch (error: any) {
    const status = error.message?.startsWith("UNAUTHORIZED")
      ? 401
      : error.message?.startsWith("FORBIDDEN")
      ? 403
      : error.message?.startsWith("NOT_FOUND")
      ? 404
      : 400;
    return NextResponse.json({ error: error.message }, { status });
  }
}

