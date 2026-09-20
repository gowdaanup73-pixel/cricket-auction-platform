"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ClientAuction, ClientBid, ClientItem, ClientParticipant } from "@/lib/types";
import { SocketProvider } from "../../../../components/SocketContext";
import { useAuth } from "../../../../components/AuthContext";
import { useToast } from "../../../../components/ToastNotifications";
import { RoleSwitcherBar } from "../../../../components/RoleSwitcherBar";
import { AuctionHeader } from "../../../../components/AuctionHeader";
import { ItemSpotlight } from "../../../../components/ItemSpotlight";
import { TeamRail } from "../../../../components/TeamRail";
import { BidPanel } from "../../../../components/BidPanel";
import { BidTicker } from "../../../../components/BidTicker";
import { calculateSafeBid, getSquadComposition } from "@/lib/squad-strategy";
import { formatExactINR, formatINR } from "@/lib/auction-state";
import { soundEngine } from "@/lib/sound-effects";
import { AlertCircle, ShieldAlert, Sparkles, Trophy, Loader2, ArrowLeft } from "lucide-react";

export default function DedicatedBidderPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auctionId = params.id as string;
  const tokenParam = searchParams.get("token");
  const teamParam = searchParams.get("team");

  const { user, loading: authLoading } = useAuth();
  const { addToast } = useToast();

  const [auction, setAuction] = useState<ClientAuction | null>(null);
  const [bids, setBids] = useState<ClientBid[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestSession, setGuestSession] = useState<{
    role: string;
    teamSlot?: string;
    participantId?: string;
    guestToken?: string;
  } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Validate Invite Token & Establish Guest Session
  const validateInvite = useCallback(async () => {
    try {
      const inviteUrl = `/api/auctions/${auctionId}/invites${tokenParam ? `?token=${encodeURIComponent(tokenParam)}` : ""}`;
      const res = await fetch(inviteUrl);
      const data = await res.json();

      if (res.ok && data.valid && data.role === "BIDDER") {
        setGuestSession({
          role: data.role,
          teamSlot: data.teamSlot,
          participantId: data.participantId,
          guestToken: data.guestToken,
        });
        setInviteError(null);
      } else if (!user) {
        setInviteError(data.error || "Invalid or expired invitation");
      }
    } catch (err: any) {
      if (!user) {
        setInviteError(err.message || "Failed to validate invite");
      }
    }
  }, [auctionId, tokenParam, user]);

  // Authoritative State Fetcher
  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/auctions/${auctionId}`);
      if (!res.ok) throw new Error("Failed to load auction");
      const data = await res.json();
      setAuction(data.auction);

      if (data.auction?.activeItemId) {
        const bidsRes = await fetch(`/api/auctions/${auctionId}/bids?itemId=${data.auction.activeItemId}`);
        if (bidsRes.ok) {
          const bidsData = await bidsRes.json();
          setBids((currentBids) => {
            const fetchedBids: ClientBid[] = bidsData.bids || [];
            const fetchedIds = new Set(fetchedBids.map((b) => b.id));
            const inFlightBids = currentBids.filter(
              (b) => !fetchedIds.has(b.id) && b.itemId === data.auction.activeItemId
            );
            return [...fetchedBids, ...inFlightBids].sort((a, b) => b.amount - a.amount);
          });
        }
      } else {
        setBids([]);
        setSecondsRemaining(null);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    validateInvite();
    fetchState();
  }, [validateInvite, fetchState]);

  // Handle Socket Events
  const handleSocketEvent = useCallback(
    (eventName: string, data: any) => {
      switch (eventName) {
        case "reconnected_sync":
          // Authoritative state reconciliation upon socket reconnection
          fetchState();
          break;

        case "auction_ready":
        case "auction_status_changed":
        case "auction_started":
        case "auction_paused":
        case "auction_resumed":
        case "auction_completed":
          setAuction((prev) => (prev ? { ...prev, status: data.status } : null));
          break;
        case "re_auction_started":
          setAuction((prev) => {
            if (!prev) return null;
            const updatedItems = prev.items.map((i) =>
              i.id === data.item.id ? { ...i, ...data.item, status: "ACTIVE" as any, round: 2 } : i
            );
            return { ...prev, activeItemId: data.item.id, items: updatedItems };
          });
          setBids([]);
          setSecondsRemaining(15);
          soundEngine.playNewBid();
          addToast(`ROUND 2 RE-AUCTION: ${data.item.name} is on stage!`, "brass");
          break;
        case "player_started":
          setAuction((prev) => {
            if (!prev) return null;
            const updatedItems = prev.items.map((i) =>
              i.id === data.item.id ? { ...i, ...data.item, status: "ACTIVE" as any } : i
            );
            return { ...prev, activeItemId: data.item.id, items: updatedItems };
          });
          setBids([]);
          setSecondsRemaining(data.secondsRemaining || 15);
          addToast(`Lot #${data.item.orderIndex} ${data.item.name} now on spotlight`, "brass");
          break;
        case "bid_placed":
          setBids((prev) => {
            const previousHighest = prev[0];
            const isOutbid =
              previousHighest &&
              (previousHighest.bidderId === user?.id || (guestSession?.participantId && previousHighest.bidderId === guestSession.participantId)) &&
              data.bid.bidderId !== user?.id &&
              data.bid.bidderId !== guestSession?.participantId;
            if (isOutbid) {
              soundEngine.playOutbid();
              addToast(`You have been outbid! Current bid: ${formatExactINR(data.bid.amount)}`, "error");
            } else {
              soundEngine.playNewBid();
            }
            if (prev.some((b) => b.id === data.bid.id)) {
              return prev;
            }
            return [data.bid, ...prev];
          });
          setSecondsRemaining(data.secondsRemaining !== undefined ? data.secondsRemaining : 15);
          break;
        case "timer_updated":
          setSecondsRemaining(data.secondsRemaining);
          if (data.secondsRemaining <= 4 && data.secondsRemaining > 0) {
            soundEngine.playTimerWarning();
          }
          break;
        case "player_sold":
          setAuction((prev) => {
            if (!prev) return null;
            const updatedItems = prev.items.map((i) => (i.id === data.item.id ? data.item : i));
            const updatedParticipants = prev.participants.map((p) =>
              p.id === data.updatedParticipant.id ? data.updatedParticipant : p
            );
            return { ...prev, activeItemId: null, items: updatedItems, participants: updatedParticipants };
          });
          setSecondsRemaining(null);
          soundEngine.playSoldFanfare();
          addToast(`Sold to ${data.updatedParticipant.teamName} for ${formatExactINR(data.item.winningPrice)}`, "success");
          break;
        case "player_final_unsold":
          setAuction((prev) => {
            if (!prev) return null;
            const updatedItems = prev.items.map((i) => (i.id === data.item.id ? { ...i, status: "FINAL_UNSOLD" as any, round: 2 } : i));
            return { ...prev, activeItemId: null, items: updatedItems };
          });
          setSecondsRemaining(null);
          soundEngine.playUnsoldGavel();
          addToast(`${data.item?.name || "Player"} passed as FINAL UNSOLD`, "error");
          break;
        case "player_unsold":
          setAuction((prev) => {
            if (!prev) return null;
            const finalStatus = data.isFinal || data.item?.status === "FINAL_UNSOLD" ? "FINAL_UNSOLD" : "UNSOLD";
            const updatedItems = prev.items.map((i) => (i.id === data.item.id ? { ...i, ...data.item, status: finalStatus as any } : i));
            return { ...prev, activeItemId: null, items: updatedItems };
          });
          setSecondsRemaining(null);
          soundEngine.playUnsoldGavel();
          addToast(`${data.item.name} passed unsold`, "error");
          break;
        case "participant_updated":
          setAuction((prev) => {
            if (!prev) return null;
            const updatedParticipants = prev.participants.map((p) =>
              p.id === data.participant.id ? data.participant : p
            );
            return { ...prev, participants: updatedParticipants };
          });
          break;
        default:
          break;
      }
    },
    [auction?.timerDuration, addToast, user?.id, guestSession?.participantId]
  );

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-[#10151A] flex items-center justify-center text-[#EDEAE1]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C7A046]" />
      </div>
    );
  }

  // Invalid / Expired Invite State
  if (inviteError && !user) {
    return (
      <div className="min-h-screen bg-[#10151A] flex flex-col items-center justify-center p-6 text-center text-[#EDEAE1]">
        <div className="p-8 bg-[#1B2229] border border-[#2B343C] rounded-[4px] max-w-md w-full space-y-4">
          <AlertCircle className="w-12 h-12 text-[#B85C38] mx-auto" />
          <h2 className="text-[20px] font-bold text-[#EDEAE1]">Invitation Invalid or Expired</h2>
          <p className="text-[#8B939A] text-[14px]">
            {inviteError}
          </p>
          <p className="text-[12px] text-[#8B939A]">
            Please ask the auctioneer to share an updated private invitation link.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded-[2px] bg-[#EDEAE1] text-[#10151A] font-semibold text-[13px] hover:bg-white flex items-center justify-center gap-2 mx-auto"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return Home</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen bg-[#10151A] flex items-center justify-center text-[#EDEAE1]">
        <div className="text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-[15px]">Auction not found</p>
        </div>
      </div>
    );
  }

  const activeItem = auction.items.find((i) => i.id === auction.activeItemId) || null;
  const highestBid = bids[0];

  // Derive Self Participant: from guest session participantId, teamSlot, or logged-in user
  let selfParticipant: ClientParticipant | null = null;
  if (guestSession?.participantId) {
    selfParticipant = auction.participants.find((p) => p.id === guestSession.participantId) || null;
  }
  if (!selfParticipant && guestSession?.teamSlot) {
    selfParticipant = guestSession.teamSlot === "B" ? auction.participants[1] : auction.participants[0];
  }
  if (!selfParticipant && user) {
    selfParticipant = auction.participants.find((p) => p.userId === (teamParam || user.id)) || null;
  }
  if (!selfParticipant) {
    selfParticipant = auction.participants[0] || null;
  }

  const opponentParticipant =
    auction.participants.find((p) => p.id !== selfParticipant?.id) ||
    auction.participants[1] ||
    null;

  const wonItems = auction.items.filter((i) => i.winnerId === selfParticipant?.userId && i.status === "SOLD");
  const squadComp = getSquadComposition(wonItems);
  const safeBidInfo = selfParticipant ? calculateSafeBid(selfParticipant, wonItems, auction.minSquadSize) : null;

  return (
    <SocketProvider auctionId={auctionId} guestToken={guestSession?.guestToken} onEvent={handleSocketEvent}>
      <div className="min-h-screen bg-[#10151A] text-[#EDEAE1] flex flex-col justify-between">
        <RoleSwitcherBar />
        <AuctionHeader auction={auction} />

        <main className="max-w-7xl w-full mx-auto p-3 sm:p-5 flex-1 space-y-4">
          {/* Main Grid: Spotlight & Bidding Console */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Spotlight (7 cols) */}
            <div className="lg:col-span-7 space-y-4">
              <ItemSpotlight
                item={activeItem}
                currentHighestBid={highestBid?.amount || 0}
                highestBidderName={highestBid?.bidder?.name}
                highestBidderTeam={highestBid?.bidder?.participant?.teamName || (highestBid as any)?.teamName}
                secondsRemaining={secondsRemaining}
                timerDuration={15}
                isPaused={auction.status === "PAUSED"}
              />

              {/* Squad Composition & Strategy Bar */}
              <div className="p-4 rounded-[4px] bg-[#1B2229] border border-[#2B343C] space-y-3">
                <div className="flex items-center justify-between border-b border-[#2B343C] pb-2">
                  <span className="text-[13px] font-bold text-[#EDEAE1] flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-[#C7A046]" />
                    {selfParticipant?.teamName} squad strategy ({wonItems.length}/{auction.minSquadSize} slots)
                  </span>
                  {safeBidInfo && (
                    <span className="text-[12px] text-[#8B939A]">
                      Recommended safe ceiling: <strong className="text-[#C7A046] font-hero tabular-nums">{formatINR(safeBidInfo.maxSafeBid)}</strong>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                  <div className="p-2 rounded-[2px] bg-[#10151A] border border-[#2B343C]">
                    <span className="text-[#8B939A] block">Batsmen</span>
                    <span className="font-hero text-[16px] font-bold text-[#EDEAE1] tabular-nums">{squadComp.batsmen} acquired</span>
                  </div>
                  <div className="p-2 rounded-[2px] bg-[#10151A] border border-[#2B343C]">
                    <span className="text-[#8B939A] block">Bowlers</span>
                    <span className="font-hero text-[16px] font-bold text-[#EDEAE1] tabular-nums">{squadComp.bowlers} acquired</span>
                  </div>
                  <div className="p-2 rounded-[2px] bg-[#10151A] border border-[#2B343C]">
                    <span className="text-[#8B939A] block">All-rounders</span>
                    <span className="font-hero text-[16px] font-bold text-[#EDEAE1] tabular-nums">{squadComp.allRounders} acquired</span>
                  </div>
                  <div className="p-2 rounded-[2px] bg-[#10151A] border border-[#2B343C]">
                    <span className="text-[#8B939A] block">Keepers</span>
                    <span className="font-hero text-[16px] font-bold text-[#EDEAE1] tabular-nums">{squadComp.wicketkeepers} acquired</span>
                  </div>
                </div>

                {safeBidInfo?.warnings.map((w, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[12px] text-[#C7A046] pt-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Bid Panel & Team Telemetry (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <BidPanel
                auction={auction}
                item={activeItem}
                currentHighestBid={highestBid?.amount || 0}
                highestBidderId={highestBid?.bidderId}
                participant={selfParticipant}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                <TeamRail
                  participant={selfParticipant}
                  items={auction.items}
                  variant="team-a"
                  isSelf={true}
                />
                {auction.participants
                  .filter((p) => p.id !== selfParticipant?.id)
                  .map((p, idx) => (
                    <TeamRail
                      key={p.id || idx}
                      participant={p}
                      items={auction.items}
                      variant="team-b"
                      isSelf={false}
                    />
                  ))}
              </div>
            </div>
          </div>
        </main>

        <BidTicker bids={bids} />
      </div>
    </SocketProvider>
  );
}
