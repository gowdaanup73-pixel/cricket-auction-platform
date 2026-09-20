"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  spectatorCount: number;
  onlineUserIds: string[];
  hasAuctioneer: boolean;
  bidderAReady: boolean;
  bidderBReady: boolean;
  allBiddersReady: boolean;
  readyBidderCount: number;
  requiredBidderCount: number;
  participantReadiness: Record<string, boolean>;
  lastEventTime: number;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
  spectatorCount: 0,
  onlineUserIds: [],
  hasAuctioneer: false,
  bidderAReady: false,
  bidderBReady: false,
  allBiddersReady: false,
  readyBidderCount: 0,
  requiredBidderCount: 2,
  participantReadiness: {},
  lastEventTime: 0,
});

export function SocketProvider({
  auctionId,
  guestToken,
  children,
  onEvent,
}: {
  auctionId: string;
  guestToken?: string | null;
  children: React.ReactNode;
  onEvent?: (eventName: string, data: any) => void;
}) {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [spectatorCount, setSpectatorCount] = useState(1);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [hasAuctioneer, setHasAuctioneer] = useState(false);
  const [bidderAReady, setBidderAReady] = useState(false);
  const [bidderBReady, setBidderBReady] = useState(false);
  const [allBiddersReady, setAllBiddersReady] = useState(false);
  const [readyBidderCount, setReadyBidderCount] = useState(0);
  const [requiredBidderCount, setRequiredBidderCount] = useState(2);
  const [participantReadiness, setParticipantReadiness] = useState<Record<string, boolean>>({});
  const [lastEventTime, setLastEventTime] = useState(Date.now());
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const isFirstConnectRef = useRef(true);

  useEffect(() => {
    const socketUrl =
      typeof window !== "undefined"
        ? process.env.NEXT_PUBLIC_SOCKET_URL && !process.env.NEXT_PUBLIC_SOCKET_URL.includes("localhost")
          ? process.env.NEXT_PUBLIC_SOCKET_URL
          : window.location.origin
        : "";
    const effectiveToken = token || guestToken || "";
    const socketInstance = io(socketUrl, {
      auth: { token: effectiveToken },
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
    });

    socketInstance.on("connect", () => {
      setConnected(true);
      socketInstance.emit("join_auction", { auctionId });
      
      // On initial mount, the page's useEffect already fetches authoritative state.
      // Only fire reconnected_sync on actual reconnection after a disconnection.
      if (isFirstConnectRef.current) {
        isFirstConnectRef.current = false;
      } else {
        if (onEventRef.current) {
          onEventRef.current("reconnected_sync", { auctionId });
        }
      }
    });

    socketInstance.on("disconnect", () => {
      setConnected(false);
    });

    socketInstance.on("spectator_count_updated", ({ count }) => {
      setSpectatorCount(count);
    });

    socketInstance.on("presence_updated", (data: any) => {
      if (data.spectatorCount !== undefined) setSpectatorCount(data.spectatorCount);
      if (data.connectedUserIds) setOnlineUserIds(data.connectedUserIds);
      if (data.hasAuctioneer !== undefined) setHasAuctioneer(data.hasAuctioneer);
      if (data.bidderAReady !== undefined) setBidderAReady(data.bidderAReady);
      if (data.bidderBReady !== undefined) setBidderBReady(data.bidderBReady);
      if (data.allBiddersReady !== undefined) setAllBiddersReady(data.allBiddersReady);
      if (data.readyBidderCount !== undefined) setReadyBidderCount(data.readyBidderCount);
      if (data.requiredBidderCount !== undefined) setRequiredBidderCount(data.requiredBidderCount);
      if (data.participantReadiness) setParticipantReadiness(data.participantReadiness);
      if (onEventRef.current) {
        onEventRef.current("presence_updated", data);
      }
    });

    const events = [
      "auction_ready",
      "auction_status_changed",
      "auction_started",
      "auction_paused",
      "auction_resumed",
      "auction_completed",
      "auction_cancelled",
      "player_started",
      "player_sold",
      "player_unsold",
      "player_undo_finalized",
      "bid_placed",
      "bid_rejected",
      "timer_updated",
      "participant_updated",
      "presence_updated",
    ];

    events.forEach((ev) => {
      socketInstance.on(ev, (data: any) => {
        setLastEventTime(Date.now());
        if (onEventRef.current) {
          onEventRef.current(ev, data);
        }
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.emit("leave_auction", { auctionId });
      socketInstance.disconnect();
    };
  }, [auctionId, token, guestToken]);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        spectatorCount,
        onlineUserIds,
        hasAuctioneer,
        bidderAReady,
        bidderBReady,
        allBiddersReady,
        readyBidderCount,
        requiredBidderCount,
        participantReadiness,
        lastEventTime,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useAuctionSocket() {
  return useContext(SocketContext);
}
