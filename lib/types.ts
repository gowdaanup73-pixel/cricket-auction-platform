export type UserRole = "AUCTIONEER" | "BIDDER" | "SPECTATOR";

export type AuctionStatus = "DRAFT" | "READY" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

export type ItemStatus = "PENDING" | "ACTIVE" | "SOLD" | "UNSOLD" | "FINAL_UNSOLD";

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  participantAuctionId?: string;
}

export interface GuestSessionPayload {
  isGuest: true;
  auctionId: string;
  role: "BIDDER" | "SPECTATOR";
  participantId?: string; // For bidders: specific AuctionParticipant document ID
  teamSlot?: string;      // For bidders: "A" | "B" | "C" etc.
  tokenVersion: string;   // Current token hash / value for immediate revocation checking
  userId: string;         // Participant's assigned user ID
  name: string;
}

export type AuthenticatedCaller =
  | { isGuest: false; user: JWTPayload }
  | { isGuest: true; guest: GuestSessionPayload };

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface ClientItem {
  id: string;
  auctionId: string;
  name: string;
  imageUrl?: string | null;
  description?: string | null;
  category: string; // Batsman, Bowler, All-Rounder, Wicket-Keeper
  basePrice: number;
  status: ItemStatus;
  round?: number;
  orderIndex: number;
  rating?: number | null;
  age?: number | null;
  matches?: number | null;
  runs?: number | null;
  wickets?: number | null;
  strikeRate?: number | null;
  economy?: number | null;
  customStats?: string | null;
  winnerId?: string | null;
  winningPrice?: number | null;
  soldAt?: string | null;
  bids?: ClientBid[];
}

export interface ClientParticipant {
  id: string;
  auctionId: string;
  userId: string;
  teamName: string;
  teamLogoUrl?: string | null;
  teamColor?: string | null;
  initialBudget: number;
  remainingBudget: number;
  totalSpent: number;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ClientBid {
  id: string;
  auctionId: string;
  itemId: string;
  bidderId: string;
  amount: number;
  sequenceNumber?: number;
  timestamp: string;
  item?: {
    id: string;
    name: string;
    category: string;
  };
  bidder?: {
    id: string;
    name: string;
    participant?: {
      teamName: string;
      teamColor?: string | null;
    };
  };
}

export interface ClientAuction {
  id: string;
  roomCode: string;
  bidderInviteA?: string | null;
  bidderInviteB?: string | null;
  bidderInvites?: string | null;
  bidderCount?: number;
  spectatorInvite?: string | null;
  isConfigLocked?: boolean;
  name: string;
  description?: string | null;
  sport: string;
  season: string;
  bannerUrl?: string | null;
  status: AuctionStatus;
  auctioneerId: string;
  minimumBidIncrement: number;
  timerDuration: number;
  antiSnipeThreshold: number;
  antiSnipeExtension: number;
  minSquadSize: number;
  maxSquadSize: number;
  squadRequirements?: string | null;
  activeItemId?: string | null;
  currentTimerExpiry?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  participants: ClientParticipant[];
  items: ClientItem[];
  bids?: ClientBid[];
  activeItem?: ClientItem | null;
}

export interface SquadComposition {
  batsmen: number;
  bowlers: number;
  allRounders: number;
  wicketkeepers: number;
  total: number;
}

export interface SafeBidRecommendation {
  maxSafeBid: number;
  remainingBudget: number;
  remainingSquadSlots: number;
  reserveForFutureSlots: number;
  isOverbudgetRisk: boolean;
  warnings: string[];
}

export type MomentumLevel = "HIGH" | "MODERATE" | "STEADY";

export interface AuctionMomentum {
  level: MomentumLevel;
  velocityPerMinute: number;
  recentBidCount: number;
  averageJump: number;
}

export interface ReplayFrame {
  timestamp: string;
  action: string;
  description: string;
  itemId?: string;
  itemName?: string;
  bidderName?: string;
  teamName?: string;
  amount?: number;
  state: {
    status: AuctionStatus;
    activeItem: ClientItem | null;
    currentHighestBid: number;
    participants: {
      teamName: string;
      remainingBudget: number;
      totalSpent: number;
      acquiredCount: number;
    }[];
  };
}

export interface ServerToClientEvents {
  auction_started: (data: { auctionId: string; status: AuctionStatus }) => void;
  auction_paused: (data: { auctionId: string; status: AuctionStatus }) => void;
  auction_resumed: (data: { auctionId: string; status: AuctionStatus }) => void;
  auction_completed: (data: { auctionId: string; status: AuctionStatus }) => void;
  auction_cancelled: (data: { auctionId: string; status: AuctionStatus }) => void;
  player_started: (data: { auctionId: string; item: ClientItem; timerExpiry: string }) => void;
  player_sold: (data: { auctionId: string; item: ClientItem; transaction: any; updatedParticipant: ClientParticipant }) => void;
  player_unsold: (data: { auctionId: string; item: ClientItem }) => void;
  player_undo_finalized: (data: { auctionId: string; item: ClientItem; updatedParticipant: ClientParticipant }) => void;
  bid_placed: (data: { auctionId: string; itemId: string; bid: ClientBid; newHighestBid: number; timerExpiry?: string }) => void;
  bid_rejected: (data: { reason: string; itemId: string }) => void;
  timer_updated: (data: { auctionId: string; itemId: string; secondsRemaining: number; timerExpiry: string }) => void;
  participant_updated: (data: { participant: ClientParticipant }) => void;
  spectator_count_updated: (data: { auctionId: string; count: number }) => void;
  state_sync: (data: { auction: ClientAuction }) => void;
}
