import { ObjectId } from "mongodb";

export interface PasswordResetToken {
  _id?: ObjectId;
  userId: ObjectId;
  token: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string | null;
}