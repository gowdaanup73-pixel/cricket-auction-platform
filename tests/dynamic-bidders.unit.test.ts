import { isAuctionConfigComplete, createAuctionSchema } from "../lib/auction-state";
import {
  checkBidderReadiness,
  registerMockPresence,
  clearMockPresence,
} from "../lib/socket-server";

async function runUnitTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING DYNAMIC BIDDER-COUNT UNIT TESTS");
  console.log("   (Database-Free / In-Memory Mock Tests)");
  console.log("=================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // Test Suite 1: Zod Schema Dynamic Bidder Validation
  // ----------------------------------------------------
  console.log("Test Suite 1: Auction Creation Schema (Bidder Count Limits)");
  {
    const valid2 = createAuctionSchema.safeParse({
      name: "Champions Trophy",
      bidderCount: 2,
    });
    assert(valid2.success && valid2.data.bidderCount === 2, "Allows 2 bidders (min boundary)");

    const valid5 = createAuctionSchema.safeParse({
      name: "Mega Auction 2026",
      bidderCount: 5,
    });
    assert(valid5.success && valid5.data.bidderCount === 5, "Allows 5 bidders (arbitrary capacity)");

    const valid10 = createAuctionSchema.safeParse({
      name: "Deca League",
      bidderCount: 10,
    });
    assert(valid10.success && valid10.data.bidderCount === 10, "Allows 10 bidders (max boundary)");

    const defaultCount = createAuctionSchema.safeParse({
      name: "Default Auction",
    });
    assert(defaultCount.success && defaultCount.data.bidderCount === 2, "Defaults to 2 bidders when unspecified");

    const invalidUnder = createAuctionSchema.safeParse({
      name: "Single Player",
      bidderCount: 1,
    });
    assert(!invalidUnder.success, "Rejects bidderCount < 2 (minimum invariant)");

    const invalidOver = createAuctionSchema.safeParse({
      name: "Crowded League",
      bidderCount: 11,
    });
    assert(!invalidOver.success, "Rejects bidderCount > 10 (maximum invariant)");

    const invalidFloat = createAuctionSchema.safeParse({
      name: "Fractional League",
      bidderCount: 3.5,
    });
    assert(!invalidFloat.success, "Rejects non-integer bidder count");
  }

  // ----------------------------------------------------
  // Test Suite 2: Dynamic Auction Configuration Completeness
  // ----------------------------------------------------
  console.log("\nTest Suite 2: Auction Configuration Completeness (Dynamic Capacity)");
  {
    const mockParticipant = () => ({
      initialBudget: 100000000,
      remainingBudget: 100000000,
      totalSpent: 0,
    });

    const baseAuction = {
      name: "Super Auction 2026",
      minimumBidIncrement: 500000,
      timerDuration: 30,
      items: [{ basePrice: 10000000 }],
      bidderInviteA: "tokA",
      bidderInviteB: "tokB",
      spectatorInvite: "tokSpec",
    };

    // 2-bidder auction
    const auction2Bidders = {
      ...baseAuction,
      bidderCount: 2,
      participants: [mockParticipant(), mockParticipant()],
    };
    assert(isAuctionConfigComplete(auction2Bidders as any), "2-bidder auction complete with 2 participants");

    const auction2BiddersIncomplete = {
      ...baseAuction,
      bidderCount: 2,
      participants: [mockParticipant()],
    };
    assert(!isAuctionConfigComplete(auction2BiddersIncomplete as any), "2-bidder auction incomplete with 1 participant");

    // 4-bidder auction
    const auction4Bidders = {
      ...baseAuction,
      bidderCount: 4,
      bidderInvites: JSON.stringify(["tok0", "tok1", "tok2", "tok3"]),
      participants: [mockParticipant(), mockParticipant(), mockParticipant(), mockParticipant()],
    };
    assert(isAuctionConfigComplete(auction4Bidders as any), "4-bidder auction complete with 4 participants");

    const auction4BiddersPartial = {
      ...baseAuction,
      bidderCount: 4,
      bidderInvites: JSON.stringify(["tok0", "tok1", "tok2", "tok3"]),
      participants: [mockParticipant(), mockParticipant(), mockParticipant()],
    };
    assert(!isAuctionConfigComplete(auction4BiddersPartial as any), "4-bidder auction incomplete with 3 participants");

    // 6-bidder auction
    const auction6Bidders = {
      ...baseAuction,
      bidderCount: 6,
      bidderInvites: JSON.stringify(["t0", "t1", "t2", "t3", "t4", "t5"]),
      participants: Array.from({ length: 6 }, () => mockParticipant()),
    };
    assert(isAuctionConfigComplete(auction6Bidders as any), "6-bidder auction complete with 6 participants");

    // Incomplete if items are missing
    const auctionNoItems = {
      ...auction4Bidders,
      items: [],
    };
    assert(!isAuctionConfigComplete(auctionNoItems as any), "Auction incomplete when items array is empty");
  }

  // ----------------------------------------------------
  // Test Suite 3: Dynamic Invite Token Resolution
  // ----------------------------------------------------
  console.log("\nTest Suite 3: Dynamic Invite Token Resolution");
  {
    const tokens = ["token_slot_a", "token_slot_b", "token_slot_c", "token_slot_d", "token_slot_e"];
    const bidderInvites = JSON.stringify(tokens);

    function resolveSlotFromToken(token: string, invitesJson: string | null) {
      if (!invitesJson) return null;
      try {
        const list: string[] = JSON.parse(invitesJson);
        const idx = list.indexOf(token);
        if (idx !== -1) {
          return {
            slotIndex: idx,
            teamSlot: String.fromCharCode(65 + idx),
          };
        }
      } catch {}
      return null;
    }

    const slotA = resolveSlotFromToken("token_slot_a", bidderInvites);
    assert(slotA?.teamSlot === "A" && slotA?.slotIndex === 0, "Resolves token_slot_a to Team Slot A");

    const slotC = resolveSlotFromToken("token_slot_c", bidderInvites);
    assert(slotC?.teamSlot === "C" && slotC?.slotIndex === 2, "Resolves token_slot_c to Team Slot C");

    const slotE = resolveSlotFromToken("token_slot_e", bidderInvites);
    assert(slotE?.teamSlot === "E" && slotE?.slotIndex === 4, "Resolves token_slot_e to Team Slot E");

    const invalidToken = resolveSlotFromToken("unknown_token", bidderInvites);
    assert(invalidToken === null, "Rejects unknown token cleanly");
  }

  // ----------------------------------------------------
  // Test Suite 4: Socket.IO Dynamic Bidder Readiness Checking
  // ----------------------------------------------------
  console.log("\nTest Suite 4: Socket.IO Dynamic Bidder Readiness");
  {
    const testAuctionId = `test_dyn_auction_${Date.now()}`;
    clearMockPresence(testAuctionId);

    const participants4 = [
      { id: "p1", userId: "u1", teamName: "Alpha" },
      { id: "p2", userId: "u2", teamName: "Beta" },
      { id: "p3", userId: "u3", teamName: "Gamma" },
      { id: "p4", userId: "u4", teamName: "Delta" },
    ];

    // Initially 0 present
    const check0 = checkBidderReadiness(testAuctionId, participants4, 4);
    assert(
      !check0.allBiddersReady && check0.readyBidderCount === 0 && check0.requiredBidderCount === 4,
      "0 of 4 connected -> readiness is false"
    );

    // 2 present
    registerMockPresence(testAuctionId, { socketId: "sock-1", userId: "u1", role: "BIDDER" } as any);
    registerMockPresence(testAuctionId, { socketId: "sock-2", userId: "u2", role: "BIDDER" } as any);
    const check2 = checkBidderReadiness(testAuctionId, participants4, 4);
    assert(
      !check2.allBiddersReady && check2.readyBidderCount === 2 && check2.requiredBidderCount === 4,
      "2 of 4 connected -> readiness is false"
    );

    // 3 present
    registerMockPresence(testAuctionId, { socketId: "sock-3", userId: "u3", role: "BIDDER" } as any);
    const check3 = checkBidderReadiness(testAuctionId, participants4, 4);
    assert(
      !check3.allBiddersReady && check3.readyBidderCount === 3 && check3.requiredBidderCount === 4,
      "3 of 4 connected -> readiness is false"
    );

    // All 4 present
    registerMockPresence(testAuctionId, { socketId: "sock-4", userId: "u4", role: "BIDDER" } as any);
    const check4 = checkBidderReadiness(testAuctionId, participants4, 4);
    assert(
      check4.allBiddersReady && check4.readyBidderCount === 4 && check4.requiredBidderCount === 4,
      "4 of 4 connected -> readiness is true"
    );

    // Dynamic readiness for 3 bidders with same participants
    const check3Required = checkBidderReadiness(testAuctionId, participants4.slice(0, 3), 3);
    assert(
      check3Required.allBiddersReady && check3Required.readyBidderCount === 3 && check3Required.requiredBidderCount === 3,
      "3 of 3 connected -> readiness is true for 3-bidder requiredCount"
    );

    clearMockPresence(testAuctionId);
  }

  console.log("\n=================================================");
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runUnitTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
