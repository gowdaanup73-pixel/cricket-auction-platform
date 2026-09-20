import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, extractCallerIdentity } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    let auction: any = null;
    try {
      if (process.env.DATABASE_URL) {
        auction = await prisma.auction.findUnique({
          where: { id },
          include: {
            auctioneer: {
              select: { id: true, name: true, email: true },
            },
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
            items: {
              orderBy: { orderIndex: "asc" },
              include: {
                winner: {
                  select: { id: true, name: true },
                },
                bids: {
                  orderBy: { amount: "desc" },
                  take: 10,
                  include: {
                    bidder: {
                      select: { id: true, name: true },
                    },
                  },
                },
              },
            },
            transactions: {
              include: {
                winner: {
                  select: { id: true, name: true },
                },
                item: true,
              },
              orderBy: { timestamp: "desc" },
            },
          },
        });
      }
    } catch (e) {
      // Prisma error
    }

    if (!auction) {
      const { inMemoryAuctions } = await import("@/lib/memory-store");
      auction = inMemoryAuctions.get(id);
    }

    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    // Role-based invite privacy sanitization
    const caller = extractCallerIdentity(req);
    let sanitizedBidderInviteA: string | null = null;
    let sanitizedBidderInviteB: string | null = null;

    const isOwnerAuctioneer = Boolean(
      caller && !caller.isGuest && caller.user.userId === auction.auctioneerId
    );

    if (isOwnerAuctioneer) {
      sanitizedBidderInviteA = auction.bidderInviteA;
      sanitizedBidderInviteB = auction.bidderInviteB;
    } else if (caller?.isGuest && caller.guest.auctionId === auction.id) {
      if (caller.guest.teamSlot === "A") {
        sanitizedBidderInviteA = auction.bidderInviteA;
      } else if (caller.guest.teamSlot === "B") {
        sanitizedBidderInviteB = auction.bidderInviteB;
      }
      // Spectator guests receive null for both bidder tokens
    } else if (caller && !caller.isGuest) {
      const pA = auction.participants[0];
      const pB = auction.participants[1];
      if (pA && pA.userId === caller.user.userId) {
        sanitizedBidderInviteA = auction.bidderInviteA;
      } else if (pB && pB.userId === caller.user.userId) {
        sanitizedBidderInviteB = auction.bidderInviteB;
      }
    }

    // Determine current active item
    const activeItem = auction.items.find((i) => i.id === auction.activeItemId) || null;

    return NextResponse.json({
      auction: {
        ...auction,
        bidderInviteA: sanitizedBidderInviteA,
        bidderInviteB: sanitizedBidderInviteB,
        activeItem,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = requireAuth(req, ["AUCTIONEER"]);
    const { id } = params;
    const body = await req.json();

    const auction = await prisma.auction.findUnique({ where: { id } });
    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    if (auction.auctioneerId !== user.userId) {
      return NextResponse.json({ error: "Only the auction owner can update this auction" }, { status: 403 });
    }

    // If auction has left DRAFT, restrict what can be updated
    if (auction.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Auction settings cannot be modified once it has left DRAFT" },
        { status: 400 }
      );
    }

    const updated = await prisma.auction.update({
      where: { id },
      data: {
        name: body.name ?? auction.name,
        description: body.description ?? auction.description,
        minimumBidIncrement: body.minimumBidIncrement ?? auction.minimumBidIncrement,
        timerDuration: body.timerDuration ?? auction.timerDuration,
        antiSnipeThreshold: body.antiSnipeThreshold ?? auction.antiSnipeThreshold,
        antiSnipeExtension: body.antiSnipeExtension ?? auction.antiSnipeExtension,
      },
    });

    return NextResponse.json({ auction: updated });
  } catch (error: any) {
    const status = error.message.startsWith("UNAUTHORIZED") ? 401 : error.message.startsWith("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
