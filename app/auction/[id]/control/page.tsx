"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ClientAuction, ClientBid, ClientItem } from "@/lib/types";
import { SocketProvider } from "@/components/SocketContext";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/ToastNotifications";
import { RoleSwitcherBar } from "@/components/RoleSwitcherBar";
import { AuctionHeader } from "@/components/AuctionHeader";
import { ItemSpotlight } from "@/components/ItemSpotlight";
import { AuctionControlPanel } from "@/components/AuctionControlPanel";
import { TeamRail } from "@/components/TeamRail";
import { BidTicker } from "@/components/BidTicker";
import { InviteModal } from "@/components/InviteModal";
import { Activity, BarChart3, Loader2, Share2 } from "lucide-react";

export default function AuctioneerControlPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.id as string;
  const { user } = useAuth();
  const { addToast } = useToast();

  const [auction, setAuction] = useState<ClientAuction | null>(null);
  const [bids, setBids] = useState<ClientBid[]>([]);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

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
    fetchState();
  }, [fetchState]);

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
          break;
        case "timer_updated":
          setSecondsRemaining(data.secondsRemaining);
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
          break;
        case "player_final_unsold":
          setAuction((prev) => {
            if (!prev) return null;
            const updatedItems = prev.items.map((i) =>
              i.id === data.item.id ? { ...i, status: "FINAL_UNSOLD" as any, round: 2 } : i
            );
            return { ...prev, activeItemId: null, items: updatedItems };
          });
          setSecondsRemaining(null);
          addToast(`${data.item?.name || "Player"} passed as FINAL UNSOLD`, "info");
          break;
        case "player_unsold":
          setAuction((prev) => {
            if (!prev) return null;
            const finalStatus = data.isFinal || data.item?.status === "FINAL_UNSOLD" ? "FINAL_UNSOLD" : "UNSOLD";
            const updatedItems = prev.items.map((i) => (i.id === data.item.id ? { ...i, ...data.item, status: finalStatus as any } : i));
            return { ...prev, activeItemId: null, items: updatedItems };
          });
          setSecondsRemaining(null);
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

  if (loading || !auction) {
    return (
      <div className="min-h-screen bg-[#10151A] flex items-center justify-center text-[#EDEAE1]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C7A046]" />
      </div>
    );
  }

  const activeItem = auction.items.find((i) => i.id === auction.activeItemId) || null;
  const highestBid = bids[0];
  const teamA = auction.participants[0] || null;
  const teamB = auction.participants[1] || null;

  return (
    <SocketProvider auctionId={auctionId} onEvent={handleSocketEvent}>
      <div className="min-h-screen bg-[#10151A] text-[#EDEAE1] flex flex-col justify-between">
        <RoleSwitcherBar />

        {/* Sub-header navigation */}
        <div className="h-10 px-4 sm:px-6 bg-[#161D24] border-b border-[#2B343C] flex items-center justify-between text-[13px]">
          <div className="flex items-center gap-3">
            <span className="text-[#C7A046] font-bold">Admin Controller</span>
            <span className="text-[#8B939A]">Room: {auction.roomCode}</span>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/auction/${auction.id}/war-room`}
              className="px-2.5 py-0.5 rounded-[2px] bg-[#1B2229] border border-[#2B343C] hover:border-[#8B939A] text-[#EDEAE1] text-[12px] flex items-center gap-1.5"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#C7A046]" />
              <span>War room analytics</span>
            </Link>
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="px-2.5 py-0.5 rounded-[2px] bg-[#1B2229] border border-[#2B343C] hover:border-[#8B939A] text-[#EDEAE1] text-[12px] flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Invite links & QR</span>
            </button>
          </div>
        </div>

        <main className="max-w-7xl w-full mx-auto p-3 sm:p-5 flex-1 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Stage: Spotlight (7 cols) */}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
                {auction.participants.map((p, idx) => (
                  <TeamRail
                    key={p.id || idx}
                    participant={p}
                    items={auction.items}
                    variant={idx % 2 === 0 ? "team-a" : "team-b"}
                  />
                ))}
              </div>
            </div>

            {/* Right Deck: Auctioneer Control Panel (5 cols) */}
            <div className="lg:col-span-5">
              <AuctionControlPanel
                auction={auction}
                bids={bids}
                onRefresh={fetchState}
              />
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
