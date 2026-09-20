"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/AuthContext";
import { useToast } from "@/components/ToastNotifications";
import { formatExactINR, formatINR } from "@/lib/auction-state";
import { AUCTION_PRESETS } from "@/lib/auction-templates";
import { ArrowLeft, Check, ChevronRight, Gavel, Plus, Trash2, Trophy, Users, Shield, Layers, Settings } from "lucide-react";

export default function CreateAuctionPage() {
  const router = useRouter();
  const { user, token, login } = useAuth();
  const { addToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Details
  const [name, setName] = useState("Champions Cricket League 2026");
  const [description, setDescription] = useState("Private multiplayer cricket mega auction with friends");
  const [sport, setSport] = useState("Cricket");
  const [season, setSeason] = useState("2026");
  const [bannerUrl, setBannerUrl] = useState("");

  // Step 2: Dynamic Teams & Bidder Count
  const DEFAULT_FRANCHISES = [
    { name: "Royal Challengers", color: "#3E7CB1", logo: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=150&auto=format&fit=crop&q=80", email: "bidder1@rcb.com" },
    { name: "Chennai Super Kings", color: "#B85C38", logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80", email: "bidder2@csk.com" },
    { name: "Mumbai Indians", color: "#1D4ED8", logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=150&auto=format&fit=crop&q=80", email: "bidder3@mi.com" },
    { name: "Kolkata Knight Riders", color: "#7C3AED", logo: "https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=150&auto=format&fit=crop&q=80", email: "bidder4@kkr.com" },
    { name: "Sunrisers Hyderabad", color: "#EA580C", logo: "https://images.unsplash.com/photo-1531415074868-036b1c57e3ce?w=150&auto=format&fit=crop&q=80", email: "bidder5@srh.com" },
    { name: "Delhi Capitals", color: "#0284C7", logo: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=150&auto=format&fit=crop&q=80", email: "bidder6@dc.com" },
    { name: "Rajasthan Royals", color: "#DB2777", logo: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=150&auto=format&fit=crop&q=80", email: "bidder7@rr.com" },
    { name: "Gujarat Titans", color: "#0D9488", logo: "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=150&auto=format&fit=crop&q=80", email: "bidder8@gt.com" },
    { name: "Lucknow Super Giants", color: "#2563EB", logo: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=150&auto=format&fit=crop&q=80", email: "bidder9@lsg.com" },
    { name: "Punjab Kings", color: "#DC2626", logo: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=150&auto=format&fit=crop&q=80", email: "bidder10@pbks.com" },
  ];

  const [bidderCount, setBidderCount] = useState(2);
  const [teams, setTeams] = useState([
    { teamName: DEFAULT_FRANCHISES[0].name, teamLogoUrl: DEFAULT_FRANCHISES[0].logo, teamColor: DEFAULT_FRANCHISES[0].color, userEmail: DEFAULT_FRANCHISES[0].email },
    { teamName: DEFAULT_FRANCHISES[1].name, teamLogoUrl: DEFAULT_FRANCHISES[1].logo, teamColor: DEFAULT_FRANCHISES[1].color, userEmail: DEFAULT_FRANCHISES[1].email },
  ]);

  const handleBidderCountChange = (newCount: number) => {
    if (newCount < 2 || newCount > 10) return;
    setBidderCount(newCount);
    setTeams((prev) => {
      const updated = [...prev];
      if (newCount > updated.length) {
        for (let i = updated.length; i < newCount; i++) {
          const defaultF = DEFAULT_FRANCHISES[i % DEFAULT_FRANCHISES.length];
          updated.push({
            teamName: defaultF.name,
            teamLogoUrl: defaultF.logo,
            teamColor: defaultF.color,
            userEmail: defaultF.email,
          });
        }
      } else if (newCount < updated.length) {
        return updated.slice(0, newCount);
      }
      return updated;
    });
  };

  // Step 3: Budgets
  const [initialBudget, setInitialBudget] = useState(100000000); // 10 Cr

  // Step 4: Players
  const [players, setPlayers] = useState([
    {
      name: "Jasprit Bumrah",
      category: "Bowler",
      basePrice: 20000000,
      matches: 133,
      wickets: 165,
      economy: 6.82,
      runs: 62,
      strikeRate: 115.4,
      imageUrl: "https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=600&auto=format&fit=crop&q=80",
      description: "Premier death-over yorker specialist with lethal accuracy and sub-7 economy.",
    },
    {
      name: "Heinrich Klaasen",
      category: "Wicket-Keeper",
      basePrice: 15000000,
      matches: 89,
      wickets: 0,
      economy: 0.0,
      runs: 2450,
      strikeRate: 178.6,
      imageUrl: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&auto=format&fit=crop&q=80",
      description: "Destructive middle-order spin destroyer boasting a 180+ strike rate in death overs.",
    },
    {
      name: "Rashid Khan",
      category: "All-Rounder",
      basePrice: 20000000,
      matches: 121,
      wickets: 149,
      economy: 6.67,
      runs: 840,
      strikeRate: 162.3,
      imageUrl: "https://images.unsplash.com/photo-1531415074868-036b1c57e3ce?w=600&auto=format&fit=crop&q=80",
      description: "World #1 T20 leg-spinner with unpickable googlies and explosive pinch-hitting capability.",
    },
    {
      name: "Travis Head",
      category: "Batsman",
      basePrice: 15000000,
      matches: 78,
      wickets: 8,
      economy: 8.9,
      runs: 2190,
      strikeRate: 184.2,
      imageUrl: "https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=600&auto=format&fit=crop&q=80",
      description: "Fearless southpaw opener averaging 200+ strike rate in powerplay overs with rapid centuries.",
    },
    {
      name: "Andre Russell",
      category: "All-Rounder",
      basePrice: 15000000,
      matches: 124,
      wickets: 112,
      economy: 9.1,
      runs: 2480,
      strikeRate: 174.9,
      imageUrl: "https://images.unsplash.com/photo-1546519638-68e109498ffc?w=600&auto=format&fit=crop&q=80",
      description: "High-impact power-hitter capable of 145km/h bowling spells and match-turning 6-hitting.",
    },
  ]);

  // Player Form State for adding another player
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerCategory, setNewPlayerCategory] = useState("Batsman");
  const [newPlayerBasePrice, setNewPlayerBasePrice] = useState(10000000);
  const [newPlayerImageUrl, setNewPlayerImageUrl] = useState("");
  const [newPlayerRuns, setNewPlayerRuns] = useState("");
  const [newPlayerWickets, setNewPlayerWickets] = useState("");

  // Step 5: Rules
  const [minimumBidIncrement, setMinimumBidIncrement] = useState(500000);
  const [timerDuration, setTimerDuration] = useState(30);
  const [antiSnipeThreshold, setAntiSnipeThreshold] = useState(5);
  const [antiSnipeExtension, setAntiSnipeExtension] = useState(10);
  const [minSquadSize, setMinSquadSize] = useState(11);
  const [maxSquadSize, setMaxSquadSize] = useState(25);

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    setPlayers((prev) => [
      ...prev,
      {
        name: newPlayerName,
        category: newPlayerCategory,
        basePrice: newPlayerBasePrice,
        matches: 50,
        wickets: newPlayerWickets ? parseInt(newPlayerWickets, 10) : 0,
        economy: 7.5,
        runs: newPlayerRuns ? parseInt(newPlayerRuns, 10) : 0,
        strikeRate: 140.0,
        imageUrl: newPlayerImageUrl || "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&auto=format&fit=crop&q=80",
        description: "Registered cricket player lot in pool.",
      },
    ]);
    setNewPlayerName("");
    setNewPlayerRuns("");
    setNewPlayerWickets("");
    setNewPlayerImageUrl("");
    addToast("Player added to draft lot pool", "brass");
  };

  const handleRemovePlayer = (index: number) => {
    setPlayers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateAuction = async () => {
    if (!token || !user) {
      addToast("Please sign in as an Auctioneer before launching the auction", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auctions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name,
          description,
          sport,
          season,
          bidderCount,
          minimumBidIncrement,
          timerDuration,
          antiSnipeThreshold,
          antiSnipeExtension,
          minSquadSize,
          maxSquadSize,
          teams: teams.map((t, idx) => ({
            teamName: t.teamName,
            teamLogoUrl: t.teamLogoUrl,
            teamColor: t.teamColor || DEFAULT_FRANCHISES[idx % DEFAULT_FRANCHISES.length].color,
            initialBudget,
            userEmail: t.userEmail || `bidder${idx + 1}@franchise.com`,
          })),
          items: players.map((p, idx) => ({
            name: p.name,
            category: p.category,
            basePrice: p.basePrice,
            description: p.description,
            imageUrl: p.imageUrl,
            orderIndex: idx + 1,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create auction");
      }

      addToast("Auction room created successfully!", "success");
      router.push(`/auction/${data.auction.id}`);
    } catch (e: any) {
      addToast(e.message || "Failed to create auction", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#10151A] text-[#EDEAE1] flex flex-col justify-between">
      <header className="h-14 px-4 sm:px-6 bg-[#1B2229] border-b border-[#2B343C] flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-[#EDEAE1] hover:text-white text-[14px] font-medium">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to lobby</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-[13px] text-[#8B939A] hidden sm:inline">Pre-auction setup wizard</span>
          {user ? (
            <div className="flex items-center gap-2 text-[12px] bg-[#10151A] px-2.5 py-1 rounded border border-[#2B343C]">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-[#EDEAE1] font-medium">{user.name}</span>
              <span className="text-[#C7A046] font-mono text-[10px]">({user.role})</span>
            </div>
          ) : (
            <Link
              href="/login?redirect=/create-auction"
              className="text-[12px] font-semibold text-[#C7A046] hover:text-[#D9A94E] px-2.5 py-1 rounded bg-[#10151A] border border-[#C7A046]/40 hover:border-[#C7A046] transition-colors"
            >
              Sign In as Auctioneer
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-4xl w-full mx-auto p-4 sm:p-8 flex-1 space-y-6">
        {/* Wizard Steps Indicator */}
        <div className="p-3 bg-[#1B2229] border border-[#2B343C] rounded-[4px] flex items-center justify-between overflow-x-auto text-[12px] no-scrollbar">
          {[
            { step: 1, title: "1. Details" },
            { step: 2, title: "2. Teams" },
            { step: 3, title: "3. Budgets" },
            { step: 4, title: "4. Players" },
            { step: 5, title: "5. Rules" },
            { step: 6, title: "6. Review" },
          ].map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={() => setCurrentStep(s.step)}
              className={`px-3 py-1 rounded-[2px] font-medium transition-colors shrink-0 ${
                currentStep === s.step
                  ? "bg-[#EDEAE1] text-[#10151A] font-bold"
                  : currentStep > s.step
                  ? "text-emerald-400"
                  : "text-[#8B939A]"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Step 1: Details */}
        {currentStep === 1 && (
          <div className="p-6 rounded-[4px] bg-[#1B2229] border border-[#2B343C] space-y-5">
            <div>
              <h2 className="text-[18px] font-bold text-[#EDEAE1]">Auction details & templates</h2>
              <p className="text-[13px] text-[#8B939A]">Choose a quick tournament preset or customize your settings</p>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <span className="text-[12px] font-semibold text-[#C7A046] uppercase tracking-wider block">
                Start from tournament preset
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {AUCTION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setName(preset.name);
                      setDescription(preset.description);
                      setInitialBudget(preset.initialBudget);
                      setMinimumBidIncrement(preset.minimumBidIncrement);
                      setTimerDuration(preset.timerDuration);
                      setAntiSnipeThreshold(preset.antiSnipeThreshold);
                      setAntiSnipeExtension(preset.antiSnipeExtension);
                      setMinSquadSize(preset.minSquadSize);
                      setMaxSquadSize(preset.maxSquadSize);
                      addToast(`Applied "${preset.name}" preset`, "brass");
                    }}
                    className="p-3 rounded-[3px] bg-[#10151A] border border-[#2B343C] hover:border-[#C7A046] text-left space-y-1 transition-colors"
                  >
                    <span className="text-[13px] font-bold text-[#EDEAE1] block">{preset.name}</span>
                    <span className="text-[11px] text-[#C7A046] font-semibold block">{preset.tagline}</span>
                    <span className="text-[11px] text-[#8B939A] block leading-tight">{preset.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-[#2B343C]">
              <div>
                <label className="text-[12px] font-medium text-[#8B939A] block mb-1">Auction name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[14px]"
                />
              </div>

              <div>
                <label className="text-[12px] font-medium text-[#8B939A] block mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[13px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-[#8B939A] block mb-1">Sport</label>
                  <input
                    type="text"
                    value={sport}
                    onChange={(e) => setSport(e.target.value)}
                    className="w-full px-3 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[13px]"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-[#8B939A] block mb-1">Season</label>
                  <input
                    type="text"
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    className="w-full px-3 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[13px]"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 rounded-[2px] bg-[#EDEAE1] text-[#10151A] font-semibold text-[13px]"
              >
                Continue to teams
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Teams */}
        {currentStep === 2 && (
          <div className="p-6 rounded-[4px] bg-[#1B2229] border border-[#2B343C] space-y-4">
            <div>
              <h2 className="text-[18px] font-bold text-[#EDEAE1]">Team participants</h2>
              <p className="text-[13px] text-[#8B939A]">Set up bidder capacity and franchise team profiles</p>
            </div>

            {/* Bidder Count Selector */}
            <div className="p-4 rounded-[2px] bg-[#10151A] border border-[#2B343C] flex items-center justify-between">
              <div>
                <span className="text-[14px] font-bold text-[#EDEAE1] block">Number of Bidders</span>
                <span className="text-[12px] text-[#8B939A]">Select between 2 to 10 competing team franchises</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleBidderCountChange(bidderCount - 1)}
                  disabled={bidderCount <= 2}
                  className="w-8 h-8 flex items-center justify-center rounded bg-[#1B2229] border border-[#2B343C] text-[#EDEAE1] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#2B343C]"
                >
                  -
                </button>
                <span className="font-hero text-[18px] font-bold text-[#C7A046] w-6 text-center tabular-nums">
                  {bidderCount}
                </span>
                <button
                  type="button"
                  onClick={() => handleBidderCountChange(bidderCount + 1)}
                  disabled={bidderCount >= 10}
                  className="w-8 h-8 flex items-center justify-center rounded bg-[#1B2229] border border-[#2B343C] text-[#EDEAE1] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#2B343C]"
                >
                  +
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {teams.map((team, idx) => {
                const slotLetter = String.fromCharCode(65 + idx);
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-3"
                    style={{ borderLeft: `3px solid ${team.teamColor || "#C7A046"}` }}
                  >
                    <span className="text-[12px] font-bold" style={{ color: team.teamColor || "#C7A046" }}>
                      Team {slotLetter} (Slot #{idx + 1})
                    </span>
                    <div>
                      <label className="text-[11px] text-[#8B939A] block mb-1">Team name</label>
                      <input
                        type="text"
                        value={team.teamName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, teamName: val } : t)));
                        }}
                        className="w-full px-3 py-1.5 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] text-[13px]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#8B939A] block mb-1">Logo URL</label>
                      <input
                        type="text"
                        value={team.teamLogoUrl}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTeams((prev) => prev.map((t, i) => (i === idx ? { ...t, teamLogoUrl: val } : t)));
                        }}
                        className="w-full px-3 py-1.5 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] text-[12px]"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[13px]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 rounded-[2px] bg-[#EDEAE1] text-[#10151A] font-semibold text-[13px]"
              >
                Continue to budgets
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Budgets */}
        {currentStep === 3 && (
          <div className="p-6 rounded-[4px] bg-[#1B2229] border border-[#2B343C] space-y-4">
            <div>
              <h2 className="text-[18px] font-bold text-[#EDEAE1]">Team budgets</h2>
              <p className="text-[13px] text-[#8B939A]">Set the initial purse. Once the auction starts, budgets are locked.</p>
            </div>

            <div className="p-4 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-3">
              <div>
                <label className="text-[12px] font-medium text-[#8B939A] block mb-1">
                  Initial purse per franchise (INR)
                </label>
                <input
                  type="number"
                  step="1000000"
                  value={initialBudget}
                  onChange={(e) => setInitialBudget(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] font-hero text-[18px] tabular-nums"
                />
              </div>

              <div className="text-[13px] text-[#8B939A] pt-1">
                Formatted allocation: <strong className="text-[#C7A046] font-hero text-[16px] tabular-nums">{formatExactINR(initialBudget)}</strong> ({formatINR(initialBudget)}) per team.
              </div>
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[13px]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 rounded-[2px] bg-[#EDEAE1] text-[#10151A] font-semibold text-[13px]"
              >
                Continue to player pool
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Players */}
        {currentStep === 4 && (
          <div className="p-6 rounded-[4px] bg-[#1B2229] border border-[#2B343C] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[18px] font-bold text-[#EDEAE1]">Player pool ({players.length} lots)</h2>
                <p className="text-[13px] text-[#8B939A]">Review and add cricket stars to the queue</p>
              </div>
            </div>

            {/* List of current players */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {players.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[13px]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-hero text-[14px] text-[#8B939A] tabular-nums">#{idx + 1}</span>
                    <span className="font-semibold text-[#EDEAE1]">{p.name}</span>
                    <span className="text-[11px] text-[#8B939A]">({p.category})</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-hero text-[14px] font-bold text-[#C7A046] tabular-nums">
                      {formatINR(p.basePrice)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePlayer(idx)}
                      className="p-1 text-[#8B939A] hover:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Player Sub-form */}
            <form onSubmit={handleAddPlayer} className="p-4 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-3">
              <h3 className="text-[13px] font-bold text-[#EDEAE1]">Add custom player</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Player name (e.g. Glenn Maxwell)"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className="px-2.5 py-1.5 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] text-[12px]"
                />
                <select
                  value={newPlayerCategory}
                  onChange={(e) => setNewPlayerCategory(e.target.value)}
                  className="px-2.5 py-1.5 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] text-[12px]"
                >
                  <option value="Batsman">Batsman</option>
                  <option value="Bowler">Bowler</option>
                  <option value="All-Rounder">All-Rounder</option>
                  <option value="Wicket-Keeper">Wicket-Keeper</option>
                </select>
                <input
                  type="number"
                  placeholder="Base Price (e.g. 10000000)"
                  value={newPlayerBasePrice}
                  onChange={(e) => setNewPlayerBasePrice(parseInt(e.target.value, 10) || 0)}
                  className="px-2.5 py-1.5 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] text-[12px]"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-3 py-1 bg-[#2B343C] hover:bg-[#8B939A] hover:text-[#10151A] text-[#EDEAE1] text-[12px] font-semibold rounded-[2px]"
                >
                  Add player
                </button>
              </div>
            </form>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[13px]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(5)}
                className="px-4 py-2 rounded-[2px] bg-[#EDEAE1] text-[#10151A] font-semibold text-[13px]"
              >
                Continue to rules
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Rules */}
        {currentStep === 5 && (
          <div className="p-6 rounded-[4px] bg-[#1B2229] border border-[#2B343C] space-y-4">
            <div>
              <h2 className="text-[18px] font-bold text-[#EDEAE1]">Auction rules & timers</h2>
              <p className="text-[13px] text-[#8B939A]">Configure countdown clocks, bid increments, and anti-snipe extensions</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3.5 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-1">
                <label className="text-[12px] text-[#8B939A] block">Minimum bid increment (₹)</label>
                <input
                  type="number"
                  step="50000"
                  value={minimumBidIncrement}
                  onChange={(e) => setMinimumBidIncrement(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-1.5 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] font-hero text-[16px] tabular-nums"
                />
              </div>

              <div className="p-3.5 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-1">
                <label className="text-[12px] text-[#8B939A] block">Timer duration (seconds)</label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={timerDuration}
                  onChange={(e) => setTimerDuration(parseInt(e.target.value, 10) || 30)}
                  className="w-full px-3 py-1.5 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] font-hero text-[16px] tabular-nums"
                />
              </div>

              <div className="p-3.5 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-1">
                <label className="text-[12px] text-[#8B939A] block">Anti-snipe threshold (seconds remaining)</label>
                <input
                  type="number"
                  min="2"
                  max="30"
                  value={antiSnipeThreshold}
                  onChange={(e) => setAntiSnipeThreshold(parseInt(e.target.value, 10) || 5)}
                  className="w-full px-3 py-1.5 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] font-hero text-[16px] tabular-nums"
                />
              </div>

              <div className="p-3.5 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-1">
                <label className="text-[12px] text-[#8B939A] block">Anti-snipe extension (seconds added)</label>
                <input
                  type="number"
                  min="3"
                  max="60"
                  value={antiSnipeExtension}
                  onChange={(e) => setAntiSnipeExtension(parseInt(e.target.value, 10) || 10)}
                  className="w-full px-3 py-1.5 rounded-[2px] bg-[#161D24] border border-[#2B343C] text-[#EDEAE1] font-hero text-[16px] tabular-nums"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[13px]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(6)}
                className="px-4 py-2 rounded-[2px] bg-[#EDEAE1] text-[#10151A] font-semibold text-[13px]"
              >
                Continue to review
              </button>
            </div>
          </div>
        )}

        {/* Step 6: Review & Launch */}
        {currentStep === 6 && (
          <div className="p-6 rounded-[4px] bg-[#1B2229] border border-[#2B343C] space-y-5">
            <div>
              <h2 className="text-[18px] font-bold text-[#EDEAE1]">Review and launch auction room</h2>
              <p className="text-[13px] text-[#8B939A]">Verify all configurations before creating the room</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-2 text-[13px]">
                <h3 className="font-bold text-[#EDEAE1] border-b border-[#2B343C] pb-1">Auction summary</h3>
                <p className="text-[#8B939A]">Name: <strong className="text-[#EDEAE1]">{name}</strong></p>
                <p className="text-[#8B939A]">Franchise budget: <strong className="text-[#C7A046] font-hero tabular-nums">{formatINR(initialBudget)}</strong></p>
                <p className="text-[#8B939A]">Total player lots: <strong className="text-[#EDEAE1]">{players.length}</strong></p>
              </div>

              <div className="p-4 rounded-[2px] bg-[#10151A] border border-[#2B343C] space-y-2 text-[13px]">
                <h3 className="font-bold text-[#EDEAE1] border-b border-[#2B343C] pb-1">Teams & rules</h3>
                <p className="text-[#8B939A]">Bidders: <strong className="text-[#C7A046] font-hero tabular-nums">{bidderCount} teams</strong></p>
                <div className="flex flex-wrap gap-1.5 py-1">
                  {teams.map((t, i) => (
                    <span key={i} className="text-[11px] px-2 py-0.5 rounded bg-[#161D24] border border-[#2B343C]" style={{ color: t.teamColor }}>
                      {t.teamName}
                    </span>
                  ))}
                </div>
                <p className="text-[#8B939A]">Timer: <strong className="text-[#EDEAE1] font-hero tabular-nums">{timerDuration}s</strong> (+{antiSnipeExtension}s extension)</p>
              </div>
            </div>

            {/* Auctioneer Auth Status Card */}
            {!user || user.role !== "AUCTIONEER" ? (
              <div className="p-4 rounded-[4px] bg-[#C7A046]/10 border border-[#C7A046]/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-[13px] font-bold text-[#C7A046] flex items-center gap-1.5">
                    <Shield className="w-4 h-4" />
                    Auctioneer Sign In Required
                  </span>
                  <p className="text-[12px] text-[#8B939A]">
                    You must be signed in as an <strong>Auctioneer</strong> to create and broadcast this auction arena.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/auth/login", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: "auctioneer@bpl.com", password: "Password123!" }),
                        });
                        const data = await res.json();
                        if (data.token && data.user) {
                          login(data.token, data.user);
                          addToast("Signed in as Tournament Auctioneer!", "success");
                        } else {
                          addToast(data.error || "Login failed", "error");
                        }
                      } catch (err: any) {
                        addToast(err.message, "error");
                      }
                    }}
                    className="px-3 py-1.5 rounded-[2px] bg-[#C7A046] hover:bg-[#D9A94E] text-[#10151A] text-[12px] font-bold transition-colors"
                  >
                    1-Click Sign In (Auctioneer)
                  </button>
                  <Link
                    href="/login?redirect=/create-auction"
                    className="px-3 py-1.5 rounded-[2px] bg-[#10151A] border border-[#2B343C] hover:border-[#8B939A] text-[#EDEAE1] text-[12px] font-medium"
                  >
                    All Accounts
                  </Link>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-[3px] bg-emerald-950/20 border border-emerald-800/40 flex items-center gap-2 text-[12px] text-emerald-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Ready to launch room as <strong>{user.name}</strong> (AUCTIONEER)</span>
              </div>
            )}

            <div className="pt-4 flex justify-between">
              <button
                type="button"
                onClick={() => setCurrentStep(5)}
                className="px-4 py-2 rounded-[2px] bg-[#10151A] border border-[#2B343C] text-[#EDEAE1] text-[13px]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCreateAuction}
                disabled={loading}
                className="px-6 py-2.5 rounded-[2px] bg-[#EDEAE1] text-[#10151A] font-bold text-[14px] hover:bg-white"
              >
                {loading ? "Creating auction..." : "Launch auction room"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
