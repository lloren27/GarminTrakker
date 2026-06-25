import type { FeatureCollection } from "geojson";

export type TrackingParticipantRole = "owner" | "participant";
export type TrackingParticipantStatus = "invited" | "accepted" | "rejected";

export interface TrackingParticipant {
  userId: string;
  username?: string;
  email?: string;
  bib?: string;
  team?: string;
  role: TrackingParticipantRole;
  status?: TrackingParticipantStatus;
  location?: {
    lat: number;
    lng: number;
    updatedAt: string;
  };
  progressMeters?: number;
  speedKmH?: number;
  locationTrail?: Array<{
    lat: number;
    lng: number;
    updatedAt: string;
    progressMeters?: number;
  }>;
  invitedAt?: string;
  joinedAt?: string;
  lastSeenAt?: string;
}

export interface TrackingRouteResponse {
  trackingId: string;
  isActive: boolean;
  expiresAt: string;
  isPublic: boolean;
  participants: TrackingParticipant[];
  route: {
    id: string;
    name: string;
    source?: string;
    dataRouteJson: FeatureCollection | null;
  };
}

export interface JoinTrackingByCodeResponse {
  success: boolean;
  message: string;
  trackingId: string;
  inviteCode: string;
  participant: TrackingParticipant;
}

export interface SharedTrackingSession {
  trackingId: string;
  inviteCode: string;
  routeId: string;
  ownerId: string;
  expiresAt: string;
  isPublic: boolean;
  participants: TrackingParticipant[];
}
