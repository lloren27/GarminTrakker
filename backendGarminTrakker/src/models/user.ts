import { ObjectId } from "mongodb";
import { UserGarminTracking } from "./liveTracking";

export interface UserLocation {
  latitude: number;
  longitude: number;
  last_update: string;
}

export interface UserAvatar {
  url: string; // URL de la imagen (S3, Cloudinary, etc.)
  provider?: "local" | "cloudinary" | "s3";
  updatedAt?: string;
}

export interface User {
  _id?: ObjectId;
  email: string;
  emailLower?: string;
  login: string;
  loginLower?: string;
  password: string;

  avatar?: UserAvatar; // 👈 NUEVO

  location: UserLocation;
  garminTracking?: UserGarminTracking;
  groups: ObjectId[];
  real_time_location: boolean;
  push_token?: string;

  emailVerified?: boolean;
  isAdmin?: boolean;

  failedLoginAttempts?: number;
  lockUntil?: string | null;

  tokenVersion?: number;

  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
}
