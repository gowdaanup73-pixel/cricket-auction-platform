"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ClientAuction, ClientBid, ClientItem } from "@/lib/types";
import { SocketProvider } from "@/components/SocketContext";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/ToastNotifications";
import { AuctionHeader } from "@/components/AuctionHeader";
import { ItemSpotlight } from "@/components/ItemSpotlight";
import { TeamRail } from "@/components/TeamRail";
import { BidTicker } from "@/components/BidTicker";
import { InviteModal } from "@/components/InviteModal";
import { calculateAuctionMomentum } from "@/lib/momentum";
import { soundEngine } from "@/lib/sound-effects";
import { Eye, Flame, QrCode, Radio, Share2, Sparkles, Loader2, AlertCircle, ArrowLeft } from "lucide-react";

export default function SpectatorWatchPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auctionId = params.id as string;
  const tokenParam = searchParams.get("token");

  const { user } = useAuth();
  const { addToast } = useToast();

  const [auction, setAuction] = useState<ClientAuction | null>(null);
  const [bids, setBids] = useState<ClientBid[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Guest Spectator Name
  const [spectatorName, setSpectatorName] = useState<string>("");
  const [hasEnteredName, setHasEnteredName] = useState<boolean>(false);

  useEffect(() => {
    const savedName = localStorage.getItem("spectator_display_name");
    if (savedName || user?.name) {
      setSpectatorName(savedName || user?.name || "Spectator");
      setHasEnteredName(true);
    }
  }, [user]);

  // Validate Spectator Invite & Establish Session
  const validateInvite = useCallback(async () => {
    try {
      const inviteUrl = `/api/auctions/${auctionId}/invites${tokenParam ? `?token=${encodeURIComponent(tokenParam)}` : ""}`;
      const res = await fetch(inviteUrl);
      const data = await res.json();

      if (res.ok && data.valid) {
        setGuestToken(data.guestToken || null);
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

  const handleSocketEvent = useCallback(
    (eventName: string, data: any) => {
      switch (eventName) {
        case "reconnected_sync":
          // Authoritative state reconciliation upon socket reconnection
          fetchState();
          break;

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
            if (prev.some((b) => b.id === data.bid.id)) return prev;
            return [data.bid, ...prev];
          });
          setSecondsRemaining(data.secondsRemaining !== undefined ? data.secondsRemaining : 15);
          soundEngine.playNewBid();
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
          addToast(`Sold to ${data.updatedParticipant.teamName}`, "success");
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
    [auction?.timerDuration, addToast]
  );

  const handleSaveSpectatorName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!spectatorName.trim()) return;
    localStorage.setItem("spectator_display_name", spectatorName);
    setHasEnteredName(true);
  };

  if (loading) {
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
          <h2 className="text-[20px] font-bold text-[#EDEAE1]">Spectator Stream Unavailable</h2>
          <p className="text-[#8B939A] text-[14px]">
            {inviteError}
          </p>
          <p className="text-[12px] text-[#8B939A]">
            Please request an updated spectator link from the auctioneer.
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
  const teamA = auction.participants[0] || null;
  const teamB = auction.participants[1] || null;
  const momentum = calculateAuctionMomentum(bids);

  return (
    <SocketProvider auctionId={auctionId} guestToken={guestToken} onEvent={handleSocketEvent}>
      <div className="min-h-screen bg-[#10151A] text-[#EDEAE1] flex flex-col justify-between">
        {/* Top Broadcast Bar */}
        <div className="h-10 px-4 sm:px-6 bg-[#161D24] border-b border-[#2B343C] flex items-center justify-between text-[13px]">
          <div className="flex items-center gap-3">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="font-bold text-[#EDEAE1]">Live spectator broadcast</span>
            <span className="text-[#8B939A] hidden sm:inline">• Room: {auction.roomCode}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Momentum Indicator */}
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[12px]">
              <Flame className={`w-3.5 h-3.5 ${momentum.level === "HIGH" ? "text-amber-400" : "text-[#8B939A]"}`} />
              <span className="text-[#8B939A]">Momentum:</span>
              <strong className="text-[#EDEAE1]">{momentum.level}</strong>
            </div>

            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="px-2.5 py-0.5 rounded-[2px] bg-[#1B2229] border border-[#2B343C] hover:border-[#8B939A] text-[#EDEAE1] text-[12px] flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5 text-[#C7A046]" />
              <span>Share QR</span>
            </button>
          </div>
        </div>

        {/* Thin Header */}
        <AuctionHeader auction={auction} />

        {/* Guest Name Modal if spectator hasn't set display name */}
        {!hasEnteredName && (
          <div className="fixed inset-0 z-50 bg-[#10151A]/90 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="p-6 rounded-[4px] bg-[#1B2229] border border-[#2B343C] max-w-sm w-full space-y-4">
              <div>
                <h2 className="text-[17px] font-bold text-[#EDEAE1]">Join as spectator</h2>
                <p className="text-[13px] text-[#8B939A]">Enter your name to watch the live auction</p>
              </div>

              <form onSubmit={handleSaveSpectatorName} className="space-y-3">
                <input
                  type="text"
                  placeholder="Your Name (e.g. Rahul)"
                  value={spectatorName}
                  onChange={(e) => setSpectatorName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[14px]"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-[2px] bg-[#EDEAE1] text-[#10151A] font-semibold text-[13px] hover:bg-white"
                >
                  Enter broadcast
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Main Stage (Stadium Layout) */}
        <main className="max-w-7xl w-full mx-auto p-3 sm:p-5 flex-1 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Team Rails (3 cols) */}
            <div className="hidden lg:block lg:col-span-3 h-full space-y-4 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
              {auction.participants
                .filter((_, idx) => idx % 2 === 0)
                .map((p, idx) => (
                  <TeamRail key={p.id || idx} participant={p} items={auction.items} variant="team-a" />
                ))}
            </div>

            {/* Dominant Spotlight (6 cols) */}
            <div className="lg:col-span-6 space-y-4">
              <ItemSpotlight
                item={activeItem}
                currentHighestBid={highestBid?.amount || 0}
                highestBidderName={highestBid?.bidder?.name}
                highestBidderTeam={highestBid?.bidder?.participant?.teamName || (highestBid as any)?.teamName}
                secondsRemaining={secondsRemaining}
                timerDuration={15}
                isPaused={auction.status === "PAUSED"}
              />
            </div>

            {/* Right Team Rails (3 cols) */}
            <div className="hidden lg:block lg:col-span-3 h-full space-y-4 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
              {auction.participants
                .filter((_, idx) => idx % 2 === 1)
                .map((p, idx) => (
                  <TeamRail key={p.id || idx} participant={p} items={auction.items} variant="team-b" />
                ))}
            </div>

            {/* Mobile Rail stack */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:hidden">
              {auction.participants.map((p, idx) => (
                <TeamRail key={p.id || idx} participant={p} items={auction.items} variant={idx % 2 === 0 ? "team-a" : "team-b"} />
              ))}
            </div>
          </div>
        </main>

        <BidTicker bids={bids} />

        <InviteModal
          auction={auction}
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
        />
      </div>
    </SocketProvider>
  );
}
