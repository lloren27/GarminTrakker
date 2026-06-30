import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { API_URL } from "../config";
import type { UserLocationUpdate } from "../types/user";
import type { UseSocketResult } from "../types/socket";
import type { TrackingParticipant } from "../types/tracking";
import { getAccessToken } from "../services/apiClient";

export function useSocket(
  trackingId: string,
  onLocation: (payload: UserLocationUpdate) => void,
  onParticipants?: (participants: TrackingParticipant[]) => void,
): UseSocketResult {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onLocationRef = useRef(onLocation);
  const onParticipantsRef = useRef(onParticipants);

  useEffect(() => {
    onLocationRef.current = onLocation;
  }, [onLocation]);

  useEffect(() => {
    onParticipantsRef.current = onParticipants;
  }, [onParticipants]);

  useEffect(() => {
    if (!trackingId?.trim()) return;

    const normalizedTrackingId = trackingId.trim().toUpperCase();
    if (normalizedTrackingId === "LAGOS26" || normalizedTrackingId === "DEMO") {
      setConnected(true);
      setError(null);
      return;
    }

    const socket: Socket = io(API_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      auth: {
        trackingId,
        token: getAccessToken(),
      },
      query: {
        trackingId,
      },
    });

    const joinRoom = () => {
      socket.emit("joinTracking", trackingId);
    };

    const handleConnect = () => {
      setConnected(true);
      setError(null);
      joinRoom();
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleConnectError = (err: Error) => {
      console.error("Socket connect_error:", err);
      setError(err.message || "Error de conexión con el servidor");
      setConnected(false);
    };

    const handleLocationUpdate = (payload: UserLocationUpdate) => {
      onLocationRef.current(payload);
    };

    const handleGroupLocationUpdated = (payload: {
      userId?: string;
      latitude?: number;
      longitude?: number;
      last_update?: string;
      username?: string;
      email?: string;
      progressMeters?: number;
      speedKmH?: number;
      currentSpeedKmH?: number;
    }) => {
      if (
        !payload.userId ||
        typeof payload.latitude !== "number" ||
        typeof payload.longitude !== "number"
      ) {
        return;
      }

      onLocationRef.current({
        userId: payload.userId,
        username: payload.username,
        email: payload.email,
        coords: {
          lat: payload.latitude,
          lng: payload.longitude,
        },
        updatedAt: payload.last_update,
        progressMeters: payload.progressMeters,
        speedKmH: payload.speedKmH,
        currentSpeedKmH: payload.currentSpeedKmH,
      });
    };

    const handleParticipantsPayload = (payload: {
      participants?: TrackingParticipant[];
    }) => {
      if (!Array.isArray(payload?.participants)) return;
      onParticipantsRef.current?.(payload.participants);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("locationUpdate", handleLocationUpdate);
    socket.on("locationUpdated", handleGroupLocationUpdated);
    socket.on("trackingSnapshot", handleParticipantsPayload);
    socket.on("participantJoined", handleParticipantsPayload);

    socket.io.on("reconnect", () => {
      joinRoom();
    });

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("locationUpdate", handleLocationUpdate);
      socket.off("locationUpdated", handleGroupLocationUpdated);
      socket.off("trackingSnapshot", handleParticipantsPayload);
      socket.off("participantJoined", handleParticipantsPayload);
      socket.disconnect();
    };
  }, [trackingId]);

  return { connected, error };
}
