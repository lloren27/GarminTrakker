export type LiveUserTrailPoint = {
  lat: number;
  lng: number;
  updatedAt: number;
  progressMeters?: number;
};

export type LiveUser = {
  userId: string;
  username?: string;
  email?: string;
  lat: number;
  lng: number;
  updatedAt: number;
  isOwner?: boolean;
  progressMeters?: number;
  speedKmH?: number;
  bib?: string;
  team?: string;
  trail: LiveUserTrailPoint[];
};

export interface UserLocationUpdate {
  userId: string;
  username?: string;
  email?: string;
  coords: {
    lat: number;
    lng: number;
  };
  isOwner?: boolean;
  progressMeters?: number;
  speedKmH?: number;
  bib?: string;
  team?: string;
  updatedAt?: number | string;
}
