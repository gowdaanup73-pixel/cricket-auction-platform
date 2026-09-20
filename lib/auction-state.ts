import { AuctionStatus, ItemStatus } from "./types";
import { z } from "zod";

export const createAuctionSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  sport: z.string().default("Cricket"),
  season: z.string().default("2026"),
  minimumBidIncrement: z.number().int().positive().default(500000),
  timerDuration: z.number().int().min(5).max(120).default(30),
  antiSnipeThreshold: z.number().int().min(2).max(30).default(5),
  antiSnipeExtension: z.number().int().min(3).max(60).default(10),
  minSquadSize: z.number().int().default(11),
  maxSquadSize: z.number().int().default(25),
  squadRequirements: z.string().optional(),
  bidderCount: z.number().int().min(2).max(10).default(2),
  teams: z
    .array(
      z.object({
        teamName: z.string().min(2),
        teamLogoUrl: z.string().optional().or(z.literal("")),
        teamColor: z.string().optional(),
        initialBudget: z.number().int().positive(),
        userId: z.string().optional(),
        userEmail: z.string().optional(),
      })
    )
    .optional(),
  items: z
    .array(
      z.object({
        name: z.string().min(2),
        category: z.string().min(1),
        basePrice: z.number().int().positive(),
        description: z.string().optional(),
        imageUrl: z.string().optional().or(z.literal("")),
        orderIndex: z.number().int().optional(),
      })
    )
    .optional(),
});

const VALID_TRANSITIONS: Record<AuctionStatus, AuctionStatus[]> = {
  DRAFT: ["READY", "CANCELLED"],
  READY: ["LIVE", "DRAFT", "CANCELLED"],
  LIVE: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["LIVE", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isValidAuctionTransition(from: AuctionStatus, to: AuctionStatus): boolean {
  if (from === to) return true;
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function assertValidAuctionTransition(from: AuctionStatus, to: AuctionStatus): void {
  if (!isValidAuctionTransition(from, to)) {
    throw new Error(`Invalid auction state transition from ${from} to ${to}`);
  }
}

export interface AuctionPreflightData {
  name: string;
  minimumBidIncrement: number;
  timerDuration: number;
  bidderCount?: number;
  bidderInviteA?: string | null;
  bidderInviteB?: string | null;
  bidderInvites?: string | null;
  spectatorInvite?: string | null;
  participants: Array<{
    initialBudget: number;
    remainingBudget: number;
    totalSpent: number;
  }>;
  items: Array<{
    basePrice: number;
  }>;
}

export function isAuctionConfigComplete(auction: AuctionPreflightData): boolean {
  const requiredBidders = auction.bidderCount || 2;
  if (!auction.name || auction.name.trim().length < 3) return false;
  if (!auction.participants || auction.participants.length < requiredBidders) return false;
  if (!auction.items || auction.items.length < 1) return false;
  if (
    auction.participants.some(
      (p) => p.initialBudget <= 0 || p.remainingBudget !== p.initialBudget - p.totalSpent
    )
  ) {
    return false;
  }
  if (auction.items.some((i) => i.basePrice <= 0)) return false;
  if (auction.minimumBidIncrement <= 0) return false;
  if (auction.timerDuration < 5) return false;
  const hasBidderInvites = !!(auction.bidderInvites || (auction.bidderInviteA && auction.bidderInviteB));
  if (!hasBidderInvites || !auction.spectatorInvite) return false;
  return true;
}

export function formatINR(amount: number): string {
  if (amount >= 10000000) {
    const cr = (amount / 10000000).toFixed(2).replace(/\.00$/, "");
    return `₹${cr} Cr`;
  }
  if (amount >= 100000) {
    const lakh = (amount / 100000).toFixed(2).replace(/\.00$/, "");
    return `₹${lakh} L`;
  }
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function formatExactINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}
