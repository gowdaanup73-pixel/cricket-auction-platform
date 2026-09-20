import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, hashPassword } from "@/lib/auth";
import { generateRoomCode, generateSecureToken } from "@/lib/invite-crypto";
import { createAuctionSchema } from "@/lib/auction-state";
import { z } from "zod";

export async function GET() {
  try {
    let auctions: any[] = [];
    if (process.env.DATABASE_URL) {
      try {
        auctions = await prisma.auction.findMany({
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
            },
          },
          orderBy: { createdAt: "desc" },
        });
      } catch (dbErr) {
        console.warn("Prisma auction lookup failed, using in-memory auctions:", dbErr);
      }
    }

    const { inMemoryAuctions } = await import("@/lib/memory-store");
    const memAuctions = Array.from(inMemoryAuctions.values());
    const combined = [...memAuctions, ...auctions];

    return NextResponse.json({ auctions: combined });
  } catch (error: any) {
    return NextResponse.json({ auctions: [] });
  }
}

export async function POST(req: Request) {
  try {
    const authUser = requireAuth(req, ["AUCTIONEER"]);
    const body = await req.json();
    const data = createAuctionSchema.parse(body);

    // 1. Ensure authenticated auctioneer exists in the database or fallback store
    let dbAuctioneer: any = null;
    try {
      if (process.env.DATABASE_URL) {
        dbAuctioneer = await prisma.user.findUnique({
          where: { id: authUser.userId },
        });

        if (!dbAuctioneer && authUser.email) {
          dbAuctioneer = await prisma.user.findUnique({
            where: { email: authUser.email.toLowerCase() },
          });
        }
      }
    } catch (dbErr) {
      console.warn("Prisma user lookup unavailable, using auth context:", dbErr);
    }

    if (!dbAuctioneer) {
      dbAuctioneer = {
        id: authUser.userId,
        name: authUser.name || "Tournament Auctioneer",
        email: authUser.email,
        role: "AUCTIONEER",
      };
    }

    const roomCode = generateRoomCode();
    const spectatorInvite = generateSecureToken(16);
    const bidderCount = data.bidderCount || (data.teams ? data.teams.length : 2);

    const DEFAULT_TEAM_COLORS = [
      "#3E7CB1", "#B85C38", "#1D4ED8", "#7C3AED", "#EA580C",
      "#0284C7", "#DB2777", "#0D9488", "#2563EB", "#DC2626",
    ];

    const bidderTokens: string[] = [];
    for (let i = 0; i < bidderCount; i++) {
      bidderTokens.push(generateSecureToken(16));
    }
    const bidderInviteA = bidderTokens[0];
    const bidderInviteB = bidderTokens[1];
    const bidderInvites = JSON.stringify(bidderTokens);

    // Resolve or pre-create participant user accounts outside the interactive transaction
    const resolvedParticipants: Array<{
      userId: string;
      teamName: string;
      teamLogoUrl?: string | null;
      teamColor?: string;
      initialBudget: number;
    }> = [];

    if (data.teams && data.teams.length > 0) {
      for (let i = 0; i < data.teams.length; i++) {
        const team = data.teams[i];
        let teamUser: any = null;

        if (process.env.DATABASE_URL) {
          try {
            if (team.userId) {
              teamUser = await prisma.user.findUnique({ where: { id: team.userId } });
            }
            if (!teamUser && team.userEmail) {
              teamUser = await prisma.user.findUnique({ where: { email: team.userEmail.toLowerCase() } });
            }

            // If no specific user found, find or create default bidder accounts
            if (!teamUser) {
              const fallbackEmail = i === 0 ? "bidder1@rcb.com" : i === 1 ? "bidder2@csk.com" : `bidder${i + 1}@league.com`;
              teamUser = await prisma.user.findUnique({ where: { email: fallbackEmail } });

              if (!teamUser) {
                const defaultPasswordHash = await hashPassword("Password123!");
                teamUser = await prisma.user.create({
                  data: {
                    name: team.teamName,
                    email: fallbackEmail,
                    passwordHash: defaultPasswordHash,
                    role: "BIDDER",
                  },
                });
              }
            }
          } catch (e) {
            // DB not reachable
          }
        }

        resolvedParticipants.push({
          userId: teamUser?.id || `user_team_${i + 1}`,
          teamName: team.teamName,
          teamLogoUrl: team.teamLogoUrl || null,
          teamColor: team.teamColor || DEFAULT_TEAM_COLORS[i % DEFAULT_TEAM_COLORS.length],
          initialBudget: team.initialBudget,
        });
      }
    }

    let fullAuction: any = null;

    if (process.env.DATABASE_URL) {
      try {
        // Execute atomic creation transaction with configured timeout (15s) and bulk operations
        const createdAuction = await prisma.$transaction(
          async (tx) => {
            // 2. Create the Auction record with verified auctioneerId
            const auction = await tx.auction.create({
              data: {
                roomCode,
                bidderCount,
                bidderInviteA,
                bidderInviteB,
                bidderInvites,
                spectatorInvite,
                isConfigLocked: false,
                name: data.name,
                description: data.description,
                sport: data.sport,
                season: data.season,
                minimumBidIncrement: data.minimumBidIncrement,
                timerDuration: data.timerDuration,
                antiSnipeThreshold: data.antiSnipeThreshold,
                antiSnipeExtension: data.antiSnipeExtension,
                minSquadSize: data.minSquadSize,
                maxSquadSize: data.maxSquadSize,
                squadRequirements: data.squadRequirements,
                auctioneerId: dbAuctioneer.id,
                status: "DRAFT",
              },
            });

            // 3. Create initial participants in bulk
            if (resolvedParticipants.length > 0) {
              await tx.auctionParticipant.createMany({
                data: resolvedParticipants.map((p) => ({
                  auctionId: auction.id,
                  userId: p.userId,
                  teamName: p.teamName,
                  teamLogoUrl: p.teamLogoUrl || null,
                  teamColor: p.teamColor,
                  initialBudget: p.initialBudget,
                  remainingBudget: p.initialBudget,
                  totalSpent: 0,
                })),
              });
            }

            // 4. Create initial player items in bulk (single database write command)
            if (data.items && data.items.length > 0) {
              await tx.item.createMany({
                data: data.items.map((item, i) => ({
                  auctionId: auction.id,
                  name: item.name,
                  category: item.category,
                  basePrice: item.basePrice,
                  description: item.description || null,
                  imageUrl: item.imageUrl || null,
                  orderIndex: item.orderIndex ?? i + 1,
                  status: "PENDING",
                })),
              });
            }

            // 5. Record Audit Log
            await tx.auditLog.create({
              data: {
                auctionId: auction.id,
                userId: dbAuctioneer.id,
                action: "AUCTION_CREATED",
                metadata: JSON.stringify({ name: auction.name, roomCode: auction.roomCode }),
              },
            });

            return auction;
          },
          {
            maxWait: 5000,
            timeout: 15000,
          }
        );

        fullAuction = await prisma.auction.findUnique({
          where: { id: createdAuction.id },
          include: {
            auctioneer: { select: { id: true, name: true, email: true } },
            participants: { include: { user: { select: { id: true, name: true, email: true } } } },
            items: { orderBy: { orderIndex: "asc" } },
          },
        });
      } catch (txErr) {
        console.warn("Prisma transaction failed, using in-memory store:", txErr);
      }
    }

    if (!fullAuction) {
      const fallbackId = `auction_${Date.now()}`;
      fullAuction = {
        id: fallbackId,
        roomCode,
        bidderCount,
        bidderInviteA,
        bidderInviteB,
        bidderInvites,
        spectatorInvite,
        isConfigLocked: false,
        name: data.name,
        description: data.description || "",
        sport: data.sport,
        season: data.season,
        minimumBidIncrement: data.minimumBidIncrement,
        timerDuration: data.timerDuration,
        antiSnipeThreshold: data.antiSnipeThreshold,
        antiSnipeExtension: data.antiSnipeExtension,
        minSquadSize: data.minSquadSize,
        maxSquadSize: data.maxSquadSize,
        squadRequirements: data.squadRequirements || null,
        status: "DRAFT",
        auctioneerId: dbAuctioneer.id,
        auctioneer: { id: dbAuctioneer.id, name: dbAuctioneer.name, email: dbAuctioneer.email },
        participants: (data.teams || []).map((t, idx) => ({
          id: `participant_${idx + 1}`,
          auctionId: fallbackId,
          userId: `user_team_${idx + 1}`,
          teamName: t.teamName,
          teamLogoUrl: t.teamLogoUrl || null,
          teamColor: t.teamColor || DEFAULT_TEAM_COLORS[idx % DEFAULT_TEAM_COLORS.length],
          initialBudget: t.initialBudget,
          remainingBudget: t.initialBudget,
          totalSpent: 0,
          user: { id: `user_team_${idx + 1}`, name: t.teamName, email: t.userEmail || `bidder${idx + 1}@league.com` },
        })),
        items: (data.items || []).map((item, idx) => ({
          id: `item_${idx + 1}`,
          name: item.name,
          category: item.category,
          basePrice: item.basePrice,
          status: "PENDING",
          orderIndex: item.orderIndex || idx + 1,
          imageUrl: item.imageUrl || null,
          description: item.description || null,
          bids: [],
        })),
        transactions: [],
      };

      const { inMemoryAuctions } = await import("@/lib/memory-store");
      inMemoryAuctions.set(fallbackId, fullAuction);
    }

    return NextResponse.json({ auction: fullAuction }, { status: 201 });
  } catch (error: any) {
    console.error("[CreateAuction Error]:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    const isClientAuthError =
      error.message?.startsWith("UNAUTHORIZED") || error.message?.startsWith("FORBIDDEN");
    const status = error.message?.startsWith("UNAUTHORIZED")
      ? 401
      : error.message?.startsWith("FORBIDDEN")
      ? 403
      : error.message?.includes("Foreign key")
      ? 400
      : 500;

    const userMessage = isClientAuthError
      ? error.message
      : "Unable to create the auction. Please try again.";

    return NextResponse.json({ error: userMessage }, { status });
  }
}
