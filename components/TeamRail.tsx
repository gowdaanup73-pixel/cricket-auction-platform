"use client";

import React from "react";
import { ClientItem, ClientParticipant } from "@/lib/types";
import { formatExactINR, formatINR } from "@/lib/auction-state";

interface TeamRailProps {
  participant: ClientParticipant | null;
  items: ClientItem[];
  variant: "team-a" | "team-b";
  isSelf?: boolean;
}

export function TeamRail({
  participant,
  items,
  variant,
  isSelf,
}: TeamRailProps) {
  if (!participant) {
    return (
      <div className="bg-[#1B2229] border border-[#2B343C] rounded-[4px] p-4 text-[13px] text-[#8B939A] text-center">
        No team registered
      </div>
    );
  }

  const teamColor = participant.teamColor || (variant === "team-a" ? "#3E7CB1" : "#B85C38");
  const wonItems = items.filter((i) => i.winnerId === participant.userId && i.status === "SOLD");

  const initialBudget = participant.initialBudget || 1;
  const remainingBudget = Math.max(0, participant.remainingBudget);
  const remainingRatio = Math.min(1, Math.max(0, remainingBudget / initialBudget));
  const remainingPercent = (remainingRatio * 100).toFixed(1);

  return (
    <div className="bg-[#1B2229] border border-[#2B343C] rounded-[4px] flex flex-col justify-between h-full">
      {/* Team Header Rail Strip */}
      <div
        className="p-3.5 border-b border-[#2B343C] flex items-center justify-between"
        style={{ borderTop: `3px solid ${teamColor}` }}
      >
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-bold text-[#EDEAE1] leading-tight">
              {participant.teamName}
            </h3>
            {isSelf && (
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 bg-[#2B343C] text-[#EDEAE1] rounded-[2px]">
                You
              </span>
            )}
          </div>
          <span className="text-[12px] text-[#8B939A]">
            {participant.user?.name}
          </span>
        </div>
        <span
          className="w-2.5 h-2.5 rounded-[2px]"
          style={{ backgroundColor: teamColor }}
        />
      </div>

      {/* Budget Depletion Gauge (Primary Visual Read) */}
      <div className="p-4 border-b border-[#2B343C] bg-[#161D24]">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[12px] text-[#8B939A]">
            Budget available
          </span>
          <span className="font-hero text-[18px] font-bold text-[#EDEAE1] tabular-nums">
            {formatINR(remainingBudget)}
          </span>
        </div>

        {/* Horizontal Depletion Bar (Fills with Brass, Empties toward Line) */}
        <div className="relative w-full h-3.5 bg-[#10151A] border border-[#2B343C] rounded-[2px] overflow-hidden">
          <div
            className="h-full bg-[#C7A046] transition-all duration-500 ease-out"
            style={{ width: `${remainingPercent}%` }}
          />

          {/* Tick Marks (25%, 50%, 75%) */}
          <div className="absolute inset-0 flex justify-between px-1 pointer-events-none">
            <span className="w-px h-full bg-[#2B343C]" style={{ marginLeft: "25%" }} />
            <span className="w-px h-full bg-[#2B343C]" style={{ marginLeft: "25%" }} />
            <span className="w-px h-full bg-[#2B343C]" style={{ marginLeft: "25%" }} />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#8B939A] mt-1 font-hero tabular-nums">
          <span>0</span>
          <span>{remainingPercent}% remaining</span>
          <span>{formatINR(initialBudget)}</span>
        </div>
      </div>

      {/* Compact Acquired Squad List */}
      <div className="p-3.5 flex-1 flex flex-col">
        <div className="flex items-center justify-between text-[12px] text-[#8B939A] mb-2 font-medium">
          <span>Acquired ({wonItems.length})</span>
          <span>Spend: {formatINR(participant.totalSpent)}</span>
        </div>

        {wonItems.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-4 border border-dashed border-[#2B343C] rounded-[2px] text-[12px] text-[#8B939A] text-center">
            No acquisitions yet
          </div>
        ) : (
          <div className="space-y-1.5 overflow-y-auto max-h-56 pr-1">
            {wonItems.map((won) => (
              <div
                key={won.id}
                className="flex items-center justify-between p-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[13px]"
              >
                <div className="truncate mr-2">
                  <span className="font-medium text-[#EDEAE1] block truncate">{won.name}</span>
                  <span className="text-[11px] text-[#8B939A]">{won.category}</span>
                </div>
                <span className="font-hero text-[14px] font-bold text-[#EDEAE1] tabular-nums shrink-0">
                  {formatINR(won.winningPrice || 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
