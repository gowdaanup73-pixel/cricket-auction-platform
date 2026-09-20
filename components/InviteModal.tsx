"use client";

import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ClientAuction } from "@/lib/types";
import { useToast } from "./ToastNotifications";
import { useAuth } from "./AuthContext";
import { Copy, Check, QrCode, X, Share2, Shield, Eye, RefreshCw } from "lucide-react";

interface InviteModalProps {
  auction: ClientAuction;
  isOpen: boolean;
  onClose: () => void;
}

export function InviteModal({ auction, isOpen, onClose }: InviteModalProps) {
  const { user, token } = useAuth();
  const { addToast } = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeQrLink, setActiveQrLink] = useState<{ title: string; url: string } | null>(null);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL || "https://cricket-auction-platform.onrender.com";

  const spectatorInvite = auction.spectatorInvite || "";
  const [currentSpectatorToken, setCurrentSpectatorToken] = useState(spectatorInvite);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Parse initial bidder tokens
  const getInitialTokens = (): Record<number, string> => {
    const map: Record<number, string> = {};
    let parsedTokens: string[] = [];
    if (auction.bidderInvites) {
      try {
        parsedTokens = JSON.parse(auction.bidderInvites);
      } catch (e) {}
    }
    if (parsedTokens.length > 0) {
      parsedTokens.forEach((t, i) => {
        map[i] = t;
      });
    } else {
      if (auction.bidderInviteA) map[0] = auction.bidderInviteA;
      if (auction.bidderInviteB) map[1] = auction.bidderInviteB;
    }
    return map;
  };

  const [bidderTokens, setBidderTokens] = useState<Record<number, string>>(getInitialTokens);

  if (!isOpen) return null;

  const spectatorUrl = `${origin}/auction/${auction.id}/watch${currentSpectatorToken ? `?token=${currentSpectatorToken}` : ""}`;
  const auctioneerUrl = `${origin}/auction/${auction.id}/control`;

  const copyToClipboard = (url: string, key: string, label: string) => {
    navigator.clipboard.writeText(url);
    setCopiedKey(key);
    addToast(`Copied ${label} to clipboard`, "brass");
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleRevokeToken = async (
    tokenType: string,
    label: string,
    bidderIndex?: number
  ) => {
    try {
      setRevoking(tokenType);
      const res = await fetch(`/api/auctions/${auction.id}/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tokenType }),
      });
      if (!res.ok) throw new Error("Failed to regenerate token");
      const data = await res.json();
      if (tokenType === "spectatorInvite") {
        setCurrentSpectatorToken(data.newToken);
      } else if (bidderIndex !== undefined) {
        setBidderTokens((prev) => ({ ...prev, [bidderIndex]: data.newToken }));
      }
      addToast(`Regenerated private link for ${label}`, "brass");
    } catch (err: any) {
      addToast(err.message || "Failed to regenerate token", "error");
    } finally {
      setRevoking(null);
    }
  };

  const isOwnerAuctioneer = Boolean(
    user?.role === "AUCTIONEER" && user.id === auction.auctioneerId
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#10151A]/85 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#1B2229] border border-[#2B343C] rounded-[4px] p-6 max-w-xl w-full space-y-5 max-h-[90vh] flex flex-col justify-between">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2B343C] pb-3">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-[#C7A046]" />
            <div>
              <h2 className="text-[16px] font-bold text-[#EDEAE1]">
                {isOwnerAuctioneer ? "Private Auction Invites" : "Share Spectator Link"}
              </h2>
              <span className="text-[12px] text-[#8B939A]">
                Room code: <strong className="text-[#EDEAE1]">{auction.roomCode}</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8B939A] hover:text-[#EDEAE1]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <div className="p-3 bg-[#10151A] border border-[#2B343C] rounded-[3px] text-[13px] text-[#8B939A]">
          {isOwnerAuctioneer ? (
            <>
              <span className="text-[#EDEAE1] font-semibold block mb-0.5">Passwordless Private Links:</span>
              Share these private links with your franchise bidders ({auction.participants.length} slots). Recipients can join instantly without creating an account or logging in.
            </>
          ) : (
            <>
              <span className="text-[#EDEAE1] font-semibold block mb-0.5">Live Spectator Broadcast:</span>
              Anyone with this link can watch this auction.
            </>
          )}
        </div>

        {/* Modal Content */}
        {activeQrLink ? (
          /* QR Code View */
          <div className="flex flex-col items-center justify-center p-6 bg-[#10151A] border border-[#2B343C] rounded-[3px] text-center space-y-4">
            <div className="p-3 bg-white rounded-[4px] inline-block">
              <QRCodeSVG
                value={activeQrLink.url}
                size={180}
                bgColor="#FFFFFF"
                fgColor="#10151A"
                level="Q"
              />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-[#EDEAE1]">
                {activeQrLink.title} QR Code
              </h3>
              <p className="text-[12px] text-[#8B939A] mt-0.5">
                Scan with mobile camera to join/watch the live auction stream.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveQrLink(null)}
              className="px-3 py-1 bg-[#1B2229] border border-[#2B343C] text-[#EDEAE1] text-[12px] rounded-[2px]"
            >
              Back to link
            </button>
          </div>
        ) : isOwnerAuctioneer ? (
          /* Full Auctioneer Management Links List */
          <div className="space-y-3.5 overflow-y-auto max-h-[50vh] pr-1">
            {/* Dynamic Bidder Links */}
            {auction.participants.map((p, idx) => {
              const tokenVal = bidderTokens[idx] || (idx === 0 ? auction.bidderInviteA : idx === 1 ? auction.bidderInviteB : "") || "";
              const bidderUrl = `${origin}/auction/${auction.id}/bidder${tokenVal ? `?token=${tokenVal}` : ""}`;
              const slotLetter = String.fromCharCode(65 + idx);
              const teamColor = p.teamColor || (idx === 0 ? "#3E7CB1" : idx === 1 ? "#B85C38" : "#2563EB");
              const tokenType = idx === 0 ? "bidderInviteA" : idx === 1 ? "bidderInviteB" : `bidderInvite_${idx}`;
              const label = `Bidder ${slotLetter} (${p.teamName})`;

              return (
                <div
                  key={p.id || idx}
                  className="p-3 rounded-[3px] bg-[#10151A] border border-[#2B343C] space-y-2"
                  style={{ borderLeft: `4px solid ${teamColor}` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#EDEAE1]">
                      Bidder {slotLetter} — {p.teamName}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRevokeToken(tokenType, label, idx)}
                      disabled={revoking === tokenType}
                      className="text-[11px] hover:underline flex items-center gap-1"
                      style={{ color: teamColor }}
                    >
                      <RefreshCw className={`w-3 h-3 ${revoking === tokenType ? "animate-spin" : ""}`} />
                      <span>{revoking === tokenType ? "Regenerating..." : "Regenerate"}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={bidderUrl}
                      className="flex-1 px-2.5 py-1 text-[12px] bg-[#161D24] border border-[#2B343C] text-[#8B939A] rounded-[2px] font-mono select-all"
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(bidderUrl, `bidder_${idx}`, label)}
                      className="px-3 py-1 bg-[#EDEAE1] text-[#10151A] rounded-[2px] text-[12px] font-semibold flex items-center gap-1 hover:bg-white"
                    >
                      {copiedKey === `bidder_${idx}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === `bidder_${idx}` ? "Copied" : "Copy"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveQrLink({ title: label, url: bidderUrl })}
                      className="px-2.5 py-1 bg-[#1B2229] border border-[#2B343C] text-[#EDEAE1] rounded-[2px] text-[12px] font-semibold flex items-center gap-1 hover:border-[#8B939A]"
                    >
                      <QrCode className="w-3.5 h-3.5 text-[#C7A046]" />
                      <span>QR</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* 3. Spectator Link */}
            <div className="p-3 rounded-[3px] bg-[#10151A] border border-[#2B343C] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-[#EDEAE1] flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-[#8B939A]" />
                  Spectator (Live read-only stream)
                </span>
                <button
                  type="button"
                  onClick={() => handleRevokeToken("spectatorInvite", "Spectator")}
                  disabled={revoking === "spectatorInvite"}
                  className="text-[11px] text-[#8B939A] hover:text-[#C7A046] underline flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${revoking === "spectatorInvite" ? "animate-spin" : ""}`} />
                  <span>{revoking === "spectatorInvite" ? "Regenerating..." : "Regenerate"}</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={spectatorUrl}
                  className="flex-1 px-2.5 py-1 text-[12px] bg-[#161D24] border border-[#2B343C] text-[#8B939A] rounded-[2px] font-mono select-all"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(spectatorUrl, "spectator", "Spectator link")}
                  className="px-3 py-1 bg-[#EDEAE1] text-[#10151A] rounded-[2px] text-[12px] font-semibold flex items-center gap-1 hover:bg-white"
                >
                  {copiedKey === "spectator" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === "spectator" ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveQrLink({ title: "Spectator Stream", url: spectatorUrl })}
                  className="px-2.5 py-1 bg-[#1B2229] border border-[#2B343C] text-[#EDEAE1] rounded-[2px] text-[12px] font-semibold flex items-center gap-1 hover:border-[#8B939A]"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#C7A046]" />
                  <span>QR</span>
                </button>
              </div>
            </div>

            {/* Auctioneer Controller Link */}
            <div className="p-3 rounded-[3px] bg-[#10151A] border border-[#2B343C] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-[#EDEAE1] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#C7A046]" />
                  Auctioneer Controller (Requires your login)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={auctioneerUrl}
                  className="flex-1 px-2.5 py-1 text-[12px] bg-[#161D24] border border-[#2B343C] text-[#8B939A] rounded-[2px] font-mono select-all"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(auctioneerUrl, "auctioneer", "Auctioneer link")}
                  className="px-3 py-1 bg-[#EDEAE1] text-[#10151A] rounded-[2px] text-[12px] font-semibold flex items-center gap-1 hover:bg-white"
                >
                  {copiedKey === "auctioneer" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === "auctioneer" ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Spectator-Only Share Card */
          <div className="space-y-3">
            <div className="p-4 rounded-[3px] bg-[#10151A] border border-[#2B343C] space-y-2.5">
              <span className="text-[13px] font-bold text-[#EDEAE1] flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-[#8B939A]" />
                Spectator Link
              </span>
              <p className="text-[12px] text-[#8B939A]">
                Anyone with this link can watch this auction live with real-time bids and timer.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  readOnly
                  value={spectatorUrl}
                  className="flex-1 px-2.5 py-1.5 text-[12px] bg-[#161D24] border border-[#2B343C] text-[#8B939A] rounded-[2px] font-mono select-all"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(spectatorUrl, "spectator", "Spectator link")}
                  className="px-3.5 py-1.5 bg-[#EDEAE1] text-[#10151A] rounded-[2px] text-[12px] font-semibold flex items-center gap-1.5 hover:bg-white"
                >
                  {copiedKey === "spectator" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === "spectator" ? "Copied" : "Copy"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveQrLink({ title: "Spectator Live Stream", url: spectatorUrl })}
                  className="px-3 py-1.5 bg-[#1B2229] border border-[#2B343C] text-[#EDEAE1] rounded-[2px] text-[12px] font-semibold flex items-center gap-1.5 hover:border-[#8B939A]"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#C7A046]" />
                  <span>QR</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[13px] rounded-[2px] hover:border-[#8B939A]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
