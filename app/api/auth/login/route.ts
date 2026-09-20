import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { comparePassword, signToken } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateLimit = checkRateLimit(`login:${ip}`, 5, 60000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many login attempts. Please wait a minute before trying again.",
          retryAfterMs: rateLimit.resetMs,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, password } = loginSchema.parse(body);

    const normalizedEmail = email.toLowerCase();
    const { DEMO_USERS } = await import("@/lib/memory-store");
    const demoUser = DEMO_USERS[normalizedEmail];

    if (demoUser && password === "Password123!") {
      const token = signToken({
        userId: demoUser.id,
        email: demoUser.email,
        name: demoUser.name,
        role: demoUser.role,
        participantAuctionId: demoUser.participantAuctionId,
      });

      const response = NextResponse.json({
        success: true,
        token,
        user: {
          id: demoUser.id,
          name: demoUser.name,
          email: demoUser.email,
          role: demoUser.role,
          teamName: demoUser.teamName,
          participantAuctionId: demoUser.participantAuctionId,
        },
      });

      response.cookies.set("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60,
        path: "/",
      });

      return response;
    }

    let user: any = null;
    try {
      if (process.env.DATABASE_URL) {
        user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: {
            participants: {
              take: 1,
            },
          },
        });
      }
    } catch (dbErr) {
      console.warn("Database lookup failed, checking fallback:", dbErr);
    }

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as any,
      participantAuctionId: user.participants[0]?.auctionId,
    });

    const response = NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        teamName: user.participants[0]?.teamName,
        participantAuctionId: user.participants[0]?.auctionId,
      },
    });

    // Set HTTP-only secure auth cookie
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

