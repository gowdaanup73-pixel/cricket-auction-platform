import { NextResponse } from "next/server";
import { extractAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const authUser = extractAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ user: null });
    }

    let user: any = null;
    try {
      if (process.env.DATABASE_URL) {
        user = await prisma.user.findUnique({
          where: { id: authUser.userId },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            participants: {
              select: {
                id: true,
                auctionId: true,
                teamName: true,
                initialBudget: true,
                remainingBudget: true,
                totalSpent: true,
              },
            },
          },
        });
      }
    } catch (e) {
      // Database not reachable
    }

    if (!user) {
      // Return user from verified auth token
      return NextResponse.json({
        user: {
          id: authUser.userId,
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
          participants: authUser.participantAuctionId
            ? [{ auctionId: authUser.participantAuctionId, teamName: "Demo Franchise" }]
            : [],
        },
      });
    }

    return NextResponse.json({ user });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
