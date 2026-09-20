import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuctioneerOwnership } from "@/lib/auth";
import { checkBidderReadiness, getIO } from "@/lib/socket-server";

export interface ReadinessCheckItem {
  id: string;
  label: string;
  passed: boolean;
  details: string;
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: auctionId } = params;
    const { user } = await requireAuctioneerOwnership(req, auctionId);

    const fullAuction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        items: true,
      },
    });

    if (!fullAuction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    const requiredBidderCount = fullAuction.bidderCount || fullAuction.participants.length || 2;
    const { bidderAReady, bidderBReady, allBiddersReady, readyBidderCount, participantReadiness } = checkBidderReadiness(
      auctionId,
      fullAuction.participants,
      requiredBidderCount
    );

    const checks: ReadinessCheckItem[] = [
      {
        id: "details",
        label: "Auction details configured",
        passed: fullAuction.name.trim().length >= 3,
        details: `Name: "${fullAuction.name}" (${fullAuction.sport} ${fullAuction.season})`,
      },
      {
        id: "participants",
        label: `${requiredBidderCount} bidder teams registered`,
        passed: fullAuction.participants.length >= requiredBidderCount,
        details: `${fullAuction.participants.length}/${requiredBidderCount} teams present (${fullAuction.participants.map(p => p.teamName).join(", ") || "none"})`,
      },
      {
        id: "budgets",
        label: "Team purses funded",
        passed: fullAuction.participants.length >= requiredBidderCount && fullAuction.participants.every(p => p.initialBudget > 0),
        details: fullAuction.participants.map(p => `${p.teamName}: ₹${(p.initialBudget / 100000).toFixed(1)}L`).join(" | ") || "Budgets not set",
      },
      {
        id: "budget_invariant",
        label: "Budget invariants verified",
        passed: fullAuction.participants.every(p => p.remainingBudget === p.initialBudget - p.totalSpent),
        details: "All participant purses satisfy remaining = initial - totalSpent",
      },
      {
        id: "items",
        label: "Cricket lot catalog loaded",
        passed: fullAuction.items.length >= 1,
        details: `${fullAuction.items.length} player(s) in lot queue`,
      },
      {
        id: "base_prices",
        label: "Base prices valid",
        passed: fullAuction.items.length >= 1 && fullAuction.items.every(i => i.basePrice > 0),
        details: "All lot items have base prices > ₹0",
      },
      {
        id: "increment",
        label: "Minimum bid increment configured",
        passed: fullAuction.minimumBidIncrement > 0,
        details: `Increment: ₹${fullAuction.minimumBidIncrement.toLocaleString("en-IN")}`,
      },
      {
        id: "timer",
        label: "Authoritative clock configured",
        passed: fullAuction.timerDuration >= 5,
        details: `Lot timer: ${fullAuction.timerDuration}s, Anti-snipe: +${fullAuction.antiSnipeExtension}s within ${fullAuction.antiSnipeThreshold}s`,
      },
      {
        id: "auctioneer_auth",
        label: "Auctioneer ownership verified",
        passed: fullAuction.auctioneerId === user.userId,
        details: `Authenticated as owner (${user.name})`,
      },
      {
        id: "invites",
        label: "Cryptographic invite credentials generated",
        passed: !!(fullAuction.spectatorInvite && (fullAuction.bidderInvites || (fullAuction.bidderInviteA && fullAuction.bidderInviteB))),
        details: "Unguessable crypto invite keys ready for distribution",
      },
      {
        id: "bidders_ready",
        label: `All ${requiredBidderCount} bidder teams connected`,
        passed: allBiddersReady || fullAuction.status === "READY",
        details: allBiddersReady || fullAuction.status === "READY"
          ? `All ${requiredBidderCount} bidder teams connected and ready`
          : `${readyBidderCount}/${requiredBidderCount} bidders connected`,
      },
    ];

    const allPassed = checks.every(c => c.passed);

    let currentStatus = fullAuction.status;
    if (allPassed && currentStatus === "DRAFT") {
      const updated = await prisma.auction.update({
        where: { id: auctionId },
        data: { status: "READY" },
      });
      currentStatus = updated.status;
      try {
        const io = getIO();
        io.to(`auction_${auctionId}`).emit("auction_ready", {
          auctionId,
          status: "READY",
        });
      } catch (e) {}
    }

    return NextResponse.json({
      allPassed,
      readyToStart: allPassed && currentStatus === "READY",
      status: currentStatus,
      checks,
      bidderAReady,
      bidderBReady,
    });
  } catch (error: any) {
    const status = error.message.startsWith("UNAUTHORIZED")
      ? 401
      : error.message.startsWith("FORBIDDEN")
      ? 403
      : error.message.startsWith("NOT_FOUND")
      ? 404
      : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
