import { NextFunction, Request, Response } from "express";
import { Db, ObjectId } from "mongodb";
import { connectToDatabase } from "./db";
import { User } from "../models/user";

export type AdminAccessFailure = {
  status: number;
  message: string;
};

export type AdminAccessSuccess = {
  db: Db;
  userObjectId: ObjectId;
  user: User;
};

function getEnvList(value?: string) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isConfiguredAdmin(user: User & { _id?: ObjectId }) {
  const adminIds = getEnvList(process.env.ADMIN_USER_IDS);
  const adminEmails = getEnvList(process.env.ADMIN_EMAILS);
  const adminLogins = getEnvList(process.env.ADMIN_LOGINS);

  return Boolean(
    user.isAdmin ||
      (user._id && adminIds.includes(user._id.toString().toLowerCase())) ||
      adminEmails.includes((user.emailLower || user.email || "").toLowerCase()) ||
      adminLogins.includes((user.loginLower || user.login || "").toLowerCase()),
  );
}

export async function requireAdminAccess(
  userId?: string,
): Promise<AdminAccessSuccess | AdminAccessFailure> {
  if (!userId || !ObjectId.isValid(userId)) {
    return { status: 401, message: "Usuario no autenticado" };
  }

  const db = await connectToDatabase();
  const userObjectId = new ObjectId(userId);
  const user = await db.collection<User>("users").findOne({ _id: userObjectId });

  if (!user) {
    return { status: 401, message: "Usuario no válido" };
  }

  if (!isConfiguredAdmin(user)) {
    return { status: 403, message: "No tienes permisos de administrador" };
  }

  return { db, userObjectId, user };
}

export function isAdminAccessFailure(
  access: AdminAccessSuccess | AdminAccessFailure,
): access is AdminAccessFailure {
  return "status" in access && typeof access.status === "number";
}

export async function requireAdminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const access = await requireAdminAccess(req.user?.userId);

  if (isAdminAccessFailure(access)) {
    return res.status(access.status).json({ message: access.message });
  }

  return next();
}
