import { ObjectId } from "mongodb";

export interface GarminDevice {
  _id?: ObjectId;
  userId: ObjectId;
  deviceIdHash: string;
  tokenHash: string;
  model?: string;
  pairedAt: string;
  lastSeenAt?: string;
  revokedAt?: string | null;
}

export interface GarminPairing {
  _id?: ObjectId;
  codeHash: string;
  deviceIdHash: string;
  model?: string;
  status: "pending" | "paired";
  createdAt: Date;
  expiresAt: Date;
  pairedAt?: Date;
  deviceToken?: string;
}
