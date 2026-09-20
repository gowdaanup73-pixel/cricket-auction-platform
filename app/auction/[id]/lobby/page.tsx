"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ClientAuction } from "@/lib/types";
import { SocketProvider, useAuctionSocket } from "@/components/SocketContext";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/ToastNotifications";
import { RoleSwitcherBar } from "@/components/RoleSwitcherBar";
import { InviteModal } from "@/components/InviteModal";
import { formatExactINR, formatINR } from "@/lib/auction-state";
import { ArrowLeft, Play, QrCode, Share2, Users, Shield, CheckCircle2, Circle, Radio, Loader2 } from "lucide-react";

function LobbyContent({ auction }: { auction: ClientAuction }) {
  const router = useRouter();
  const { user, token } = useAuth();
  const { addToast } = useToast();
  const { connected, spectatorCount, bidderAReady, bidderBReady, allBiddersReady, participantReadiness } = useAuctionSocket();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const teamA = auction.participants[0];
  const teamB = auction.participants[1];

  const isAuctioneer = user?.role === "AUCTIONEER";

  const handleStartAuction = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auctions/${auction.id}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        addToast(data.error || "Failed to start auction", "error");
      } else {
        addToast("Auction started! Entering arena.", "success");
        router.push(`/auction/${auction.id}`);
      }
    } catch (e: any) {
      addToast(e.message || "Network error", "error");
    } finally {
      setLoading(false);
    }
  };

  const isTeamAReady = bidderAReady || auction.status === "READY";
  const isTeamBReady = bidderBReady || auction.status === "READY";

  return (
    <div className="max-w-4xl w-full mx-auto p-4 sm:p-8 space-y-6">
      {/* Header card */}
      <div className="p-6 rounded-[4px] bg-[#1B2229] border border-[#2B343C] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2B343C] pb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 bg-[#C7A046] rounded-[2px]" />
              <h1 className="text-[22px] font-bold text-[#EDEAE1]">{auction.name}</h1>
            </div>
            <p className="text-[13px] text-[#8B939A]">
              Room code: <strong className="text-[#EDEAE1]">{auction.roomCode}</strong> &bull; Status: <strong className="text-[#C7A046] font-semibold">{auction.status}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="px-3.5 py-1.5 rounded-[2px] bg-[#10151A] border border-[#2B343C] hover:border-[#8B939A] text-[#EDEAE1] text-[13px] font-medium flex items-center gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5 text-[#C7A046]" />
              <span>Share invites & QR</span>
            </button>
          </div>
        </div>

        <p className="text-[14px] text-[#8B939A]">
          {auction.description || "Official live cricket player auction lobby."}
        </p>
      </div>

      {/* Participant Readiness Deck */}
      <div className="p-6 rounded-[4px] bg-[#1B2229] border border-[#2B343C] space-y-4">
        <div className="flex items-center justify-between border-b border-[#2B343C] pb-2">
          <h2 className="text-[15px] font-bold text-[#EDEAE1]">
            Connected participants readiness
          </h2>
          <span className="text-[12px] text-[#8B939A]">
            {spectatorCount} spectator(s) connected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {auction.participants.map((p, idx) => {
            const isReady =
              (participantReadiness && participantReadiness[p.id]) ||
              (idx === 0 && bidderAReady) ||
              (idx === 1 && bidderBReady) ||
              auction.status === "READY";
            const teamColor = p.teamColor || (idx === 0 ? "#3E7CB1" : idx === 1 ? "#B85C38" : "#2563EB");
            const slotLetter = String.fromCharCode(65 + idx);

            return (
              <div
                key={p.id || idx}
                className="p-4 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-2"
                style={{ borderLeft: `3px solid ${teamColor}` }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold block" style={{ color: teamColor }}>
                      Team {slotLetter}
                    </span>
                    <h3 className="text-[15px] font-bold text-[#EDEAE1]">{p.teamName}</h3>
                  </div>
                  {isReady ? (
                    <div className="flex items-center gap-1 text-[12px] text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Ready</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[12px] text-[#8B939A]">
                      <Circle className="w-3.5 h-3.5" />
                      <span>Waiting</span>
                    </div>
                  )}
                </div>
                <div className="text-[12px] text-[#8B939A]">
                  Purse: <strong className="text-[#EDEAE1] font-hero tabular-nums">{formatINR(p.initialBudget || 0)}</strong>
                </div>
              </div>
            );
          })}
        </div>

        {/* Rules Brief */}
        <div className="p-3.5 rounded-[2px] bg-[#10151A] border border-[#2B343C] grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
          <div>
            <span className="text-[#8B939A] block">Min increment</span>
            <span className="font-hero text-[15px] font-bold text-[#EDEAE1] tabular-nums">{formatINR(auction.minimumBidIncrement)}</span>
          </div>
          <div>
            <span className="text-[#8B939A] block">Lot timer</span>
            <span className="font-hero text-[15px] font-bold text-[#EDEAE1] tabular-nums">{auction.timerDuration}s</span>
          </div>
          <div>
            <span className="text-[#8B939A] block">Anti-snipe</span>
            <span className="font-hero text-[15px] font-bold text-[#EDEAE1] tabular-nums">+{auction.antiSnipeExtension}s</span>
          </div>
          <div>
            <span className="text-[#8B939A] block">Total lots</span>
            <span className="font-hero text-[15px] font-bold text-[#EDEAE1] tabular-nums">{auction.items?.length || 0} players</span>
          </div>
        </div>

        {/* Start Auction Action (Auctioneer) */}
        {isAuctioneer ? (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={handleStartAuction}
              disabled={loading}
              className="px-6 py-3 rounded-[2px] bg-[#EDEAE1] text-[#10151A] font-bold text-[14px] hover:bg-white flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{loading ? "Starting auction..." : auction.status === "READY" ? "Launch live arena" : "Start live auction"}</span>
            </button>
          </div>
        ) : (
          <div className="p-3 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[13px] text-[#8B939A] text-center">
            {auction.status === "READY"
              ? "All bidders ready! Waiting for the auctioneer to launch..."
              : "Waiting for all bidders to connect in lobby..."}
          </div>
        )}
      </div>

      <InviteModal
        auction={auction}
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </div>
  );
}

export default function LobbyPage() {
  const params = useParams();
  const auctionId = params.id as string;
  const [auction, setAuction] = useState<ClientAuction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/auctions/${auctionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.auction) setAuction(data.auction);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [auctionId]);

  if (loading || !auction) {
    return (
      <div className="min-h-screen bg-[#10151A] flex items-center justify-center text-[#EDEAE1]">
        <Loader2 className="w-8 h-8 animate-spin text-[#C7A046]" />
      </div>
    );
  }

  return (
    <SocketProvider auctionId={auctionId}>
      <div className="min-h-screen bg-[#10151A] text-[#EDEAE1] flex flex-col justify-between">
        <RoleSwitcherBar />
        <LobbyContent auction={auction} />
        <footer className="py-4 border-t border-[#2B343C] text-center text-[12px] text-[#8B939A]">
          Cricket sports auction broadcast lobby — Room: {auction.roomCode}
        </footer>
      </div>
    </SocketProvider>
  );
}
