import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "./db";
import { User } from "../models/user";
import { corsOrigin } from "./cors";

type SocketUserPayload = {
  userId: string;
  login: string;
};

type AuthenticatedSocket = Socket & {
  data: {
    userId?: string;
    login?: string;
    lastLocationUpdateAt?: number;
  };
};

type UpdateLocationPayload = {
  latitude: number;
  longitude: number;
};

let socketServer: Server | null = null;

const isValidCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const emitLocationUpdatedToUserGroups = async (
  userId: string,
  latitude: number,
  longitude: number,
  lastUpdateIso: string,
): Promise<boolean> => {
  if (!socketServer || !ObjectId.isValid(userId)) {
    return false;
  }

  const db = await connectToDatabase();
  const user = await db.collection<User>("users").findOne(
    { _id: new ObjectId(userId) },
    { projection: { groups: 1 } },
  );

  if (!user) {
    return false;
  }

  const groupIds = (user.groups || []).map((groupId) => groupId.toString());

  for (const groupId of groupIds) {
    socketServer.to(`group:${groupId}`).emit("locationUpdated", {
      userId,
      groupId,
      latitude,
      longitude,
      last_update: lastUpdateIso,
    });
  }

  return true;
};

const joinUserGroups = async (
  socket: AuthenticatedSocket,
  user: User,
): Promise<void> => {
  const groupIds = (user.groups || []).map((groupId) => groupId.toString());

  for (const groupId of groupIds) {
    const roomName = `group:${groupId}`;
    await socket.join(roomName);
    console.log(`✅ Usuario ${socket.data.userId} unido a room ${roomName}`);
  }
};

const leaveAllGroupRooms = async (
  socket: AuthenticatedSocket,
): Promise<void> => {
  const rooms = Array.from(socket.rooms);

  for (const room of rooms) {
    if (room.startsWith("group:")) {
      await socket.leave(room);
    }
  }
};

export const setupSocket = (server: any) => {
  const io = new Server(server, {
    cors: {
      origin: corsOrigin,
    },
  });

  socketServer = io;

  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication error: token missing"));
      }

      const secretKey = process.env.JWT_SECRET;

      if (!secretKey) {
        return next(new Error("Authentication error: JWT secret missing"));
      }

      const decoded = jwt.verify(token, secretKey) as SocketUserPayload;

      if (!decoded?.userId || !decoded?.login) {
        return next(new Error("Authentication error: invalid token payload"));
      }

      socket.data.userId = decoded.userId;
      socket.data.login = decoded.login;

      next();
    } catch (error) {
      console.error("❌ Error autenticando socket:", error);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", async (socket: AuthenticatedSocket) => {
    const userId = socket.data.userId;

    if (!userId || !ObjectId.isValid(userId)) {
      socket.disconnect();
      return;
    }

    console.log("🔌 Usuario conectado:", userId, socket.id);

    try {
      const db = await connectToDatabase();

      const user = await db.collection<User>("users").findOne({
        _id: new ObjectId(userId),
      });

      if (!user) {
        console.warn("⚠️ Usuario no encontrado al conectar socket:", userId);
        socket.disconnect();
        return;
      }

      await joinUserGroups(socket, user);
    } catch (error) {
      console.error("❌ Error uniendo usuario a rooms:", error);
      socket.disconnect();
      return;
    }

    socket.on(
      "updateLocation",
      async (
        payload: UpdateLocationPayload,
        callback?: (response: {
          ok: boolean;
          error?: string;
          last_update?: string;
        }) => void,
      ) => {
        try {
          const { latitude, longitude } = payload ?? {};

          if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) {
            callback?.({ ok: false, error: "Invalid coordinates" });
            return;
          }

          if (
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
          ) {
            callback?.({ ok: false, error: "Coordinates out of range" });
            return;
          }

          const now = Date.now();
          const lastUpdate = socket.data.lastLocationUpdateAt ?? 0;

          if (now - lastUpdate < 3000) {
            callback?.({ ok: false, error: "Too many location updates" });
            return;
          }

          socket.data.lastLocationUpdateAt = now;

          const db = await connectToDatabase();
          const userObjectId = new ObjectId(userId);
          const lastUpdateIso = new Date().toISOString();

          const result = await db.collection<User>("users").updateOne(
            { _id: userObjectId },
            {
              $set: {
                location: {
                  latitude,
                  longitude,
                  last_update: lastUpdateIso,
                },
              },
            },
          );

          if (!result.acknowledged) {
            callback?.({ ok: false, error: "Database update failed" });
            return;
          }

          if (result.matchedCount === 0) {
            callback?.({ ok: false, error: "User not found" });
            return;
          }

          const emitted = await emitLocationUpdatedToUserGroups(
            userId,
            latitude,
            longitude,
            lastUpdateIso,
          );

          if (!emitted) {
            callback?.({ ok: false, error: "Location broadcast failed" });
            return;
          }

          console.log(`📍 Ubicación actualizada y emitida a grupos de ${userId}`);

          callback?.({ ok: true, last_update: lastUpdateIso });
        } catch (error) {
          console.error("❌ Error al actualizar ubicación:", error);
          callback?.({ ok: false, error: "Internal server error" });
        }
      },
    );

    socket.on(
      "refreshGroups",
      async (callback?: (response: { ok: boolean; error?: string }) => void) => {
        try {
          const db = await connectToDatabase();

          const user = await db.collection<User>("users").findOne({
            _id: new ObjectId(userId),
          });

          if (!user) {
            callback?.({ ok: false, error: "User not found" });
            return;
          }

          await leaveAllGroupRooms(socket);
          await joinUserGroups(socket, user);

          callback?.({ ok: true });
        } catch (error) {
          console.error("❌ Error refrescando rooms:", error);
          callback?.({ ok: false, error: "Internal server error" });
        }
      },
    );

    socket.on("disconnect", (reason) => {
      console.log("🔴 Usuario desconectado:", userId, socket.id, reason);
    });
  });

  return io;
};
