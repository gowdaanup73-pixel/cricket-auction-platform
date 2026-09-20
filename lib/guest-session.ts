import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { GuestSessionPayload } from "./types";
import { prisma as defaultPrisma } from "./prisma";

const JWT_SECRET = process.env.JWT_SECRET || "production-hardened-jwt-secret-auction-platform-2026";

/**
 * Creates a signed JWT representing an authenticated guest session.
 */
export function createGuestToken(payload: GuestSessionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * Verifies a guest JWT token.
 */
export function verifyGuestToken(token: string): GuestSessionPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded && decoded.isGuest === true && decoded.auctionId && decoded.role) {
      return decoded as GuestSessionPayload;
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Extracts a guest session from an HTTP Request or NextRequest.
 * Inspects `guest_token` cookie, fallback `token` cookie, or Authorization header.
 */
export function extractGuestSession(req: Request | NextRequest): GuestSessionPayload | null {
  // 1. Check Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const guest = verifyGuestToken(token);
    if (guest) return guest;
  }

  // 2. Check Cookie header
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
    // Check guest_token cookie
    const guestMatch = cookieHeader.match(/guest_token=([^;]+)/);
    if (guestMatch && guestMatch[1]) {
      const guest = verifyGuestToken(guestMatch[1]);
      if (guest) return guest;
    }

    // Check token cookie (in case client stored it in token)
    const tokenMatch = cookieHeader.match(/token=([^;]+)/);
    if (tokenMatch && tokenMatch[1]) {
      const guest = verifyGuestToken(tokenMatch[1]);
      if (guest) return guest;
    }
  }

  return null;
}

/**
 * Authoritatively validates the guest session against MongoDB.
 * Checks that the underlying invite token in the database has not been revoked or regenerated.
 */
export async function validateGuestSessionWithDB(
  session: GuestSessionPayload,
  dbClient: any = defaultPrisma
): Promise<{ valid: boolean; auction?: any; participant?: any; reason?: string }> {
  try {
    const auction = await dbClient.auction.findUnique({
      where: { id: session.auctionId },
      include: {
        participants: true,
      },
    });

    if (!auction) {
      return { valid: false, reason: "AUCTION_NOT_FOUND" };
    }

    if (session.role === "BIDDER") {
      let currentToken: string | null = null;
      let parsedTokens: string[] = [];
      if (auction.bidderInvites) {
        try {
          parsedTokens = JSON.parse(auction.bidderInvites);
        } catch (e) {}
      }

      if (session.teamSlot === "A") currentToken = auction.bidderInviteA || parsedTokens[0] || null;
      else if (session.teamSlot === "B") currentToken = auction.bidderInviteB || parsedTokens[1] || null;
      else if (session.teamSlot) {
        const slotIdx = session.teamSlot.charCodeAt(0) - 65;
        if (slotIdx >= 0 && slotIdx < parsedTokens.length) {
          currentToken = parsedTokens[slotIdx];
        }
      }

      // Ensure the tokenVersion in the JWT matches the current database invite token
      if (!currentToken || currentToken !== session.tokenVersion) {
        return { valid: false, reason: "INVITE_REVOKED" };
      }

      // Ensure the participant document exists and belongs to this auction
      const participant = auction.participants.find((p: any) => p.id === session.participantId);
      if (!participant) {
        return { valid: false, reason: "PARTICIPANT_NOT_FOUND" };
      }

      return { valid: true, auction, participant };
    }

    if (session.role === "SPECTATOR") {
      if (!auction.spectatorInvite || auction.spectatorInvite !== session.tokenVersion) {
        return { valid: false, reason: "INVITE_REVOKED" };
      }
      return { valid: true, auction };
    }

    return { valid: false, reason: "INVALID_ROLE" };
  } catch (err: any) {
    return { valid: false, reason: err.message || "VALIDATION_ERROR" };
  }
}
