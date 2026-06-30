import { ObjectId } from "mongodb";

export interface LiveTrackingLocationInput {
  userId: string;
  latitude: number;
  longitude: number;
  elapsedDistanceMeters?: number;
  averageSpeedMps?: number;
  currentSpeedMps?: number;
  timerTimeSeconds?: number;
  source: "connect_iq" | "api" | "socket";
}

export interface LiveTrackingPeer {
  userId: string;
  name: string;
  deltaMeters: number;
  gapSeconds?: number;
  progressMeters: number;
  averageSpeedKmH?: number;
  last_update: string;
}

export interface LiveTrackingSummary {
  progressMeters?: number;
  last_update: string;
  ahead: LiveTrackingPeer | null;
  behind: LiveTrackingPeer | null;
}

export interface UserGarminTracking {
  elapsedDistanceMeters?: number;
  progressMeters?: number;
  averageSpeedKmH?: number;
  currentSpeedKmH?: number;
  timerTimeSeconds?: number;
  source: "connect_iq" | "api" | "socket";
  last_update: string;
}

export interface LiveTrackingUserProjection {
  _id?: ObjectId;
  login?: string;
  email?: string;
  groups?: ObjectId[];
  garminTracking?: UserGarminTracking;
}
