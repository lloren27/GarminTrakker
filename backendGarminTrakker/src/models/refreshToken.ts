import { ObjectId } from "mongodb";

export interface RefreshToken {
  _id?: ObjectId;
  userId: ObjectId;
  token: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  replacedByToken?: string | null;
  userAgent?: string | null;
  ip?: string | null;
}