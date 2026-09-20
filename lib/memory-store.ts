// In-memory fallback store when MongoDB is unavailable (no local DB running)

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: "AUCTIONEER" | "BIDDER" | "SPECTATOR";
  teamName?: string;
  participantAuctionId?: string;
}

export const DEMO_USERS: Record<string, DemoUser> = {
  "auctioneer@bpl.com": {
    id: "demo-auctioneer-1",
    name: "Tournament Auctioneer",
    email: "auctioneer@bpl.com",
    role: "AUCTIONEER",
  },
  "bidder1@rcb.com": {
    id: "demo-bidder-rcb",
    name: "Royal Challengers Owner",
    email: "bidder1@rcb.com",
    role: "BIDDER",
    teamName: "Royal Challengers",
  },
  "bidder2@csk.com": {
    id: "demo-bidder-csk",
    name: "Super Kings Owner",
    email: "bidder2@csk.com",
    role: "BIDDER",
    teamName: "Chennai Super Kings",
  },
  "spectator@fan.com": {
    id: "demo-spectator-fan",
    name: "Cricket Fan",
    email: "spectator@fan.com",
    role: "SPECTATOR",
  },
};

declare global {
  // eslint-disable-next-line no-var
  var __inMemoryAuctions: Map<string, any> | undefined;
}

if (!global.__inMemoryAuctions) {
  global.__inMemoryAuctions = new Map();
}

export const inMemoryAuctions = global.__inMemoryAuctions;
