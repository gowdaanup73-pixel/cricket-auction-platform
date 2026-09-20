import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractAuthUser, requireAuctioneerOwnership } from "@/lib/auth";
import { createGuestToken, extractGuestSession, validateGuestSessionWithDB } from "@/lib/guest-session";
import { generateSecureToken } from "@/lib/invite-crypto";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { GuestSessionPayload } from "@/lib/types";

// Verify invite token & issue secure guest session cookie
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(`invite-check:${ip}`, 45, 60000);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const { id: auctionId } = params;
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    // 1. If a token is provided in the query string, validate it and issue a new guest session cookie
    if (token) {
      let parsedTokens: string[] = [];
      if (auction.bidderInvites) {
        try {
          parsedTokens = JSON.parse(auction.bidderInvites);
        } catch (e) {}
      }

      // Check Bidder A Invite
      if (token === auction.bidderInviteA || (parsedTokens.length > 0 && token === parsedTokens[0])) {
        const participant = auction.participants[0];
        if (!participant) {
          return NextResponse.json({ valid: false, error: "Team A participant slot not configured" }, { status: 400 });
        }

        const guestPayload: GuestSessionPayload = {
          isGuest: true,
          auctionId: auction.id,
          role: "BIDDER",
          participantId: participant.id,
          teamSlot: "A",
          tokenVersion: token,
          userId: participant.userId,
          name: `${participant.teamName} Bidder`,
        };

        const guestToken = createGuestToken(guestPayload);
        const response = NextResponse.json({
          valid: true,
          role: "BIDDER",
          teamSlot: "A",
          teamName: participant.teamName,
          participantId: participant.id,
          guestToken,
          auction: {
            id: auction.id,
            name: auction.name,
            roomCode: auction.roomCode,
            status: auction.status,
          },
        });

        response.cookies.set("guest_token", guestToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60, // 7 days
        });

        return response;
      }

      // Check Bidder B Invite
      if (token === auction.bidderInviteB || (parsedTokens.length > 1 && token === parsedTokens[1])) {
        const participant = auction.participants[1];
        if (!participant) {
          return NextResponse.json({ valid: false, error: "Team B participant slot not configured" }, { status: 400 });
        }

        const guestPayload: GuestSessionPayload = {
          isGuest: true,
          auctionId: auction.id,
          role: "BIDDER",
          participantId: participant.id,
          teamSlot: "B",
          tokenVersion: token,
          userId: participant.userId,
          name: `${participant.teamName} Bidder`,
        };

        const guestToken = createGuestToken(guestPayload);
        const response = NextResponse.json({
          valid: true,
          role: "BIDDER",
          teamSlot: "B",
          teamName: participant.teamName,
          participantId: participant.id,
          guestToken,
          auction: {
            id: auction.id,
            name: auction.name,
            roomCode: auction.roomCode,
            status: auction.status,
          },
        });

        response.cookies.set("guest_token", guestToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60,
        });

        return response;
      }

      // Check additional bidder invite slots (Team C, Team D, etc.)
      for (let i = 2; i < auction.participants.length; i++) {
        if (parsedTokens[i] && token === parsedTokens[i]) {
          const participant = auction.participants[i];
          const slotLetter = String.fromCharCode(65 + i);

          const guestPayload: GuestSessionPayload = {
            isGuest: true,
            auctionId: auction.id,
            role: "BIDDER",
            participantId: participant.id,
            teamSlot: slotLetter,
            tokenVersion: token,
            userId: participant.userId,
            name: `${participant.teamName} Bidder`,
          };

          const guestToken = createGuestToken(guestPayload);
          const response = NextResponse.json({
            valid: true,
            role: "BIDDER",
            teamSlot: slotLetter,
            teamName: participant.teamName,
            participantId: participant.id,
            guestToken,
            auction: {
              id: auction.id,
              name: auction.name,
              roomCode: auction.roomCode,
              status: auction.status,
            },
          });

          response.cookies.set("guest_token", guestToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60,
          });

          return response;
        }
      }

      // Check Spectator Invite
      if (token === auction.spectatorInvite) {
        const guestPayload: GuestSessionPayload = {
          isGuest: true,
          auctionId: auction.id,
          role: "SPECTATOR",
          tokenVersion: token,
          userId: `guest_spec_${auction.id.slice(-6)}`,
          name: "Guest Spectator",
        };

        const guestToken = createGuestToken(guestPayload);
        const response = NextResponse.json({
          valid: true,
          role: "SPECTATOR",
          guestToken,
          auction: {
            id: auction.id,
            name: auction.name,
            roomCode: auction.roomCode,
            status: auction.status,
          },
        });

        response.cookies.set("guest_token", guestToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 7 * 24 * 60 * 60,
        });

        return response;
      }

      // If token did not match any current invite token:
      return NextResponse.json({
        valid: false,
        error: "Invalid or expired invitation token",
      }, { status: 403 });
    }

    // 2. If no token provided in query, check for an existing valid guest session cookie
    const existingGuest = extractGuestSession(req);
    if (existingGuest && existingGuest.auctionId === auction.id) {
      const check = await validateGuestSessionWithDB(existingGuest);
      if (check.valid) {
        return NextResponse.json({
          valid: true,
          role: existingGuest.role,
          teamSlot: existingGuest.teamSlot,
          teamName: check.participant?.teamName,
          participantId: existingGuest.participantId,
          auction: {
            id: auction.id,
            name: auction.name,
            roomCode: auction.roomCode,
            status: auction.status,
          },
        });
      }
    }

    return NextResponse.json({
      valid: false,
      error: "Missing invite token",
    }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to verify invitation" }, { status: 500 });
  }
}

// Auctioneer regenerates/revokes an invite token
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id: auctionId } = params;
    const { user } = await requireAuctioneerOwnership(req, auctionId);

    const body = await req.json();
    const tokenType = body.tokenType as string;

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
    });

    if (!auction) {
      return NextResponse.json({ error: "Auction not found" }, { status: 404 });
    }

    let parsedTokens: string[] = [];
    if (auction.bidderInvites) {
      try {
        parsedTokens = JSON.parse(auction.bidderInvites);
      } catch (e) {}
    }

    const newToken = generateSecureToken(16);
    const updateData: any = {};

    if (tokenType === "spectatorInvite") {
      updateData.spectatorInvite = newToken;
    } else if (tokenType === "bidderInviteA" || tokenType === "bidderInvite_0") {
      updateData.bidderInviteA = newToken;
      if (parsedTokens.length > 0) {
        parsedTokens[0] = newToken;
        updateData.bidderInvites = JSON.stringify(parsedTokens);
      }
    } else if (tokenType === "bidderInviteB" || tokenType === "bidderInvite_1") {
      updateData.bidderInviteB = newToken;
      if (parsedTokens.length > 1) {
        parsedTokens[1] = newToken;
        updateData.bidderInvites = JSON.stringify(parsedTokens);
      }
    } else if (tokenType.startsWith("bidderInvite_")) {
      const idx = parseInt(tokenType.replace("bidderInvite_", ""), 10);
      if (!isNaN(idx) && idx >= 0 && idx < 20) {
        while (parsedTokens.length <= idx) {
          parsedTokens.push(generateSecureToken(16));
        }
        parsedTokens[idx] = newToken;
        updateData.bidderInvites = JSON.stringify(parsedTokens);
        if (idx === 0) updateData.bidderInviteA = newToken;
        if (idx === 1) updateData.bidderInviteB = newToken;
      } else {
        return NextResponse.json({ error: "Invalid token type specified" }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: "Invalid token type specified" }, { status: 400 });
    }

    await prisma.auction.update({
      where: { id: auctionId },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        auctionId,
        userId: user.userId,
        action: "INVITE_REVOKED",
        metadata: JSON.stringify({
          tokenType,
          revokedAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      tokenType,
      newToken,
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
