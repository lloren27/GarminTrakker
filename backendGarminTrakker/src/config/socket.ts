import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "./db";
import { User } from "../models/user";
import { corsOrigin } from "./cors";
import { Group } from "../models/group";
import { getGarminStatusByUserIds } from "../services/garminDeviceService";
import { UserRouteProgress } from "../services/routeProgressService";

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
let snapshotInterval: NodeJS.Timeout | null = null;
const SNAPSHOT_INTERVAL_MS = 40 * 1000;

const isValidCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const emitLocationUpdatedToUserGroups = async (
  {
    userId,
    latitude,
    longitude,
    lastUpdateIso,
    progressMeters,
    averageSpeedKmH,
    currentSpeedKmH,
    routeProgress,
    progressSource,
  }: {
    userId: string;
    latitude: number;
    longitude: number;
    lastUpdateIso: string;
    progressMeters?: number;
    averageSpeedKmH?: number;
    currentSpeedKmH?: number;
    routeProgress?: UserRouteProgress | null;
    progressSource?: "route" | "device";
  },
): Promise<boolean> => {
  if (!socketServer || !ObjectId.isValid(userId)) {
    return false;
  }

  const db = await connectToDatabase();
  const user = await db.collection<User>("users").findOne(
    { _id: new ObjectId(userId) },
    { projection: { groups: 1, login: 1, email: 1 } },
  );

  if (!user) {
    return false;
  }

  const groupIds = (user.groups || []).map((groupId) => groupId.toString());

  for (const groupId of groupIds) {
    const hasProgressForGroup =
      !routeProgress || routeProgress.groupId === groupId;

    socketServer.to(`group:${groupId}`).emit("locationUpdated", {
      userId,
      groupId,
      latitude,
      longitude,
      last_update: lastUpdateIso,
      username: user.login,
      email: user.email,
      progressMeters: hasProgressForGroup ? progressMeters : undefined,
      progressSource: hasProgressForGroup ? progressSource : undefined,
      remainingMeters: hasProgressForGroup
        ? routeProgress?.remainingMeters
        : undefined,
      routeLengthMeters: hasProgressForGroup
        ? routeProgress?.routeLengthMeters
        : undefined,
      progressPercent: hasProgressForGroup
        ? routeProgress?.progressPercent
        : undefined,
      distanceFromRouteMeters: hasProgressForGroup
        ? routeProgress?.distanceFromRouteMeters
        : undefined,
      isOffRoute: hasProgressForGroup
        ? routeProgress?.isOffRoute
        : undefined,
      routeLayerId: hasProgressForGroup
        ? routeProgress?.routeLayerId
        : undefined,
      speedKmH: averageSpeedKmH,
      currentSpeedKmH,
    });
  }

  return true;
};

const getGroupSnapshot = async (group: Group & { _id: ObjectId }) => {
  const db = await connectToDatabase();
  const memberIds = Array.from(
    new Set([group.owner, ...(group.users || [])].map((id) => id.toString())),
  ).map((id) => new ObjectId(id));
  const [users, garminStatus] = await Promise.all([
    db
      .collection<User>("users")
      .find(
        { _id: { $in: memberIds } },
        {
          projection: {
            login: 1,
            email: 1,
            location: 1,
            garminTracking: 1,
          },
        },
      )
      .toArray(),
    getGarminStatusByUserIds(memberIds),
  ]);

  return users.map((user) => {
    const userId = user._id?.toString() ?? "";
    const deviceStatus = garminStatus.get(userId);

    return {
      userId,
      username: user.login,
      email: user.email,
      role:
        userId === group.owner.toString() ? "owner" : "participant",
      status: "accepted",
      location: user.location
        ? {
            lat: user.location.latitude,
            lng: user.location.longitude,
            updatedAt: user.location.last_update,
          }
        : undefined,
      progressMeters:
        !user.garminTracking?.groupId ||
        user.garminTracking.groupId === group._id.toString()
          ? user.garminTracking?.progressMeters
          : undefined,
      progressSource:
        !user.garminTracking?.groupId ||
        user.garminTracking.groupId === group._id.toString()
          ? user.garminTracking?.progressSource
          : undefined,
      remainingMeters:
        user.garminTracking?.groupId === group._id.toString()
          ? user.garminTracking?.remainingMeters
          : undefined,
      routeLengthMeters:
        user.garminTracking?.groupId === group._id.toString()
          ? user.garminTracking?.routeLengthMeters
          : undefined,
      progressPercent:
        user.garminTracking?.groupId === group._id.toString()
          ? user.garminTracking?.progressPercent
          : undefined,
      distanceFromRouteMeters:
        user.garminTracking?.groupId === group._id.toString()
          ? user.garminTracking?.distanceFromRouteMeters
          : undefined,
      isOffRoute:
        user.garminTracking?.groupId === group._id.toString()
          ? user.garminTracking?.isOffRoute
          : undefined,
      routeLayerId:
        user.garminTracking?.groupId === group._id.toString()
          ? user.garminTracking?.routeLayerId
          : undefined,
      speedKmH: user.garminTracking?.averageSpeedKmH,
      currentSpeedKmH: user.garminTracking?.currentSpeedKmH,
      garminPaired: deviceStatus?.paired ?? false,
      garminOnline: deviceStatus?.online ?? false,
      garminLastSeenAt: deviceStatus?.lastSeenAt,
    };
  });
};

const emitGroupSnapshot = async (
  group: Group & { _id: ObjectId },
  socket?: AuthenticatedSocket,
): Promise<void> => {
  const payload = {
    groupId: group._id.toString(),
    generatedAt: new Date().toISOString(),
    participants: await getGroupSnapshot(group),
  };

  if (socket) {
    socket.emit("trackingSnapshot", payload);
    return;
  }

  socketServer
    ?.to(`group:${group._id.toString()}`)
    .emit("trackingSnapshot", payload);
};

const broadcastTrackingSnapshots = async (): Promise<void> => {
  if (!socketServer) return;

  try {
    const db = await connectToDatabase();
    const groups = await db
      .collection<Group>("groups")
      .find({})
      .toArray();

    await Promise.all(
      groups
        .filter((group): group is Group & { _id: ObjectId } => Boolean(group._id))
        .map((group) => emitGroupSnapshot(group)),
    );
  } catch (error) {
    console.error("Error emitiendo snapshots de tracking:", error);
  }
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

      for (const groupId of user.groups || []) {
        const group = await db
          .collection<Group>("groups")
          .findOne({ _id: groupId });
        if (group?._id) {
          await emitGroupSnapshot(group as Group & { _id: ObjectId }, socket);
        }
      }
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

          const emitted = await emitLocationUpdatedToUserGroups({
            userId,
            latitude,
            longitude,
            lastUpdateIso,
          });

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

    socket.on("joinTracking", async (trackingId: string) => {
      if (!ObjectId.isValid(trackingId)) return;

      try {
        const db = await connectToDatabase();
        const group = await db.collection<Group>("groups").findOne({
          _id: new ObjectId(trackingId),
          $or: [
            { owner: new ObjectId(userId) },
            { users: new ObjectId(userId) },
          ],
        });

        if (!group?._id) return;

        await socket.join(`group:${trackingId}`);
        await emitGroupSnapshot(
          group as Group & { _id: ObjectId },
          socket,
        );
      } catch (error) {
        console.error("Error uniendo socket al tracking:", error);
      }
    });

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

  if (!snapshotInterval) {
    snapshotInterval = setInterval(
      () => void broadcastTrackingSnapshots(),
      SNAPSHOT_INTERVAL_MS,
    );
    snapshotInterval.unref();
  }

  return io;
};
