import { Request, Response } from "express";
import { connectToDatabase } from "../config/db";
import { Group } from "../models/group";
import { GroupLayer } from "../models/groupLayer";
import { GroupLayerPreference } from "../models/groupLayerPreference";
import { User } from "../models/user";
import { ObjectId } from "mongodb";
import crypto from "crypto";
import { getGarminStatusByUserIds } from "../services/garminDeviceService";

const generateInviteCode = () => {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
};

export const createGroup = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { name } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return res
        .status(400)
        .json({ message: "El nombre del grupo es obligatorio" });
    }

    const db = await connectToDatabase();
    const ownerId = new ObjectId(userId);

    let inviteCode = "";
    let existingGroup = null;

    do {
      inviteCode = generateInviteCode();
      existingGroup = await db
        .collection<Group>("groups")
        .findOne({ inviteCode });
    } while (existingGroup);

    const group: Group = {
      name: name.trim(),
      owner: ownerId,
      users: [ownerId],
      usersPending: [],
      inviteCode,
    };

    const result = await db.collection<Group>("groups").insertOne(group);

    await db
      .collection<User>("users")
      .updateOne(
        { _id: ownerId },
        { $addToSet: { groups: result.insertedId } },
      );

    return res.status(201).json({
      message: "Grupo creado exitosamente",
      groupId: result.insertedId,
      inviteCode,
    });
  } catch (error) {
    console.error("Error al crear grupo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const getUserGroups = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).send("Usuario no autenticado.");
    }

    const db = await connectToDatabase();

    const userDoc = await db
      .collection<User>("users")
      .findOne({ _id: new ObjectId(userId) });
    if (!userDoc) {
      return res.status(404).send("Usuario no encontrado.");
    }

    const groups = await db
      .collection<Group>("groups")
      .find({ _id: { $in: userDoc.groups.map((id) => new ObjectId(id)) } })
      .toArray();

    res.json(groups);
  } catch (error) {
    console.error("Error al obtener grupos del usuario:", error);
    res.status(500).send("Error interno del servidor.");
  }
};

export const getGroupUsers = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;
    const currentUserId = req.user?.userId;

    if (!currentUserId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!ObjectId.isValid(groupId) || !ObjectId.isValid(currentUserId)) {
      return res.status(400).json({ message: "Formato de groupId inválido" });
    }

    const db = await connectToDatabase();
    const group = await db
      .collection<Group>("groups")
      .findOne({ _id: new ObjectId(groupId) });

    if (!group) {
      return res.status(404).json({ message: "Grupo no encontrado" });
    }

    const currentUserObjectId = new ObjectId(currentUserId);
    if (!isGroupMember(group, currentUserObjectId)) {
      return res.status(403).json({ message: "No perteneces a este grupo" });
    }

    const owner = await db
      .collection<User>("users")
      .findOne({ _id: group.owner }, { projection: { password: 0 } });

    if (!owner) {
      return res
        .status(404)
        .json({ message: "Propietario del grupo no encontrado" });
    }

    const participants = await db
      .collection<User>("users")
      .find(
        {
          _id: {
            $in: (group.users || []).filter(
              (userId) =>
                typeof userId === "object" &&
                userId.toString() !== group.owner.toString(),
            ),
          },
        },
        { projection: { password: 0 } },
      )
      .toArray();
    const allUsers = [owner, ...participants];
    const garminStatus = await getGarminStatusByUserIds(
      allUsers
        .map((user) => user._id)
        .filter((id): id is ObjectId => Boolean(id)),
    );
    const serializeUser = (user: User, role: "owner" | "participant") => {
      const id = user._id?.toString() ?? "";
      const status = garminStatus.get(id);

      return {
        _id: id,
        login: user.login,
        email: user.email,
        role,
        locationUpdatedAt: user.location?.last_update,
        garminPaired: status?.paired ?? false,
        garminOnline: status?.online ?? false,
        garminLastSeenAt: status?.lastSeenAt,
      };
    };

    const response = {
      owner: serializeUser(owner, "owner"),
      participants: participants.map((participant) =>
        serializeUser(participant, "participant"),
      ),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error al obtener usuarios del grupo:", error);
    res.status(500).send("Error interno del servidor.");
  }
};

const isGroupMember = (group: Group, userId: ObjectId): boolean => {
  const memberIds = [group.owner, ...(group.users || [])];

  return memberIds.some((memberId) => memberId.toString() === userId.toString());
};

export const getGroupTracking = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "Formato de groupId inválido" });
    }

    const db = await connectToDatabase();
    const userObjectId = new ObjectId(userId);
    const groupObjectId = new ObjectId(groupId);
    const group = await db.collection<Group>("groups").findOne({ _id: groupObjectId });

    if (!group) {
      return res.status(404).json({ message: "Grupo no encontrado" });
    }

    if (!isGroupMember(group, userObjectId)) {
      return res.status(403).json({ message: "No perteneces a este grupo" });
    }

    const memberIds = Array.from(
      new Set([group.owner, ...(group.users || [])].map((id) => id.toString())),
    ).map((id) => new ObjectId(id));

    const users = await db
      .collection<User>("users")
      .find(
        { _id: { $in: memberIds } },
        {
          projection: {
            password: 0,
            failedLoginAttempts: 0,
            lockUntil: 0,
            tokenVersion: 0,
          },
        },
      )
      .toArray();
    const garminStatus = await getGarminStatusByUserIds(memberIds);

    const routeLayer = await db
      .collection<GroupLayer>("groupLayers")
      .find({ groupId: groupObjectId, type: "gpx" })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1)
      .next();

    const participants = users.map((user) => ({
      userId: user._id?.toString() ?? "",
      username: user.login,
      email: user.email,
      role:
        user._id?.toString() === group.owner.toString()
          ? "owner"
          : "participant",
      status: "accepted",
      location: user.location
        ? {
            lat: user.location.latitude,
            lng: user.location.longitude,
            updatedAt: user.location.last_update,
          }
        : undefined,
      progressMeters: user.garminTracking?.progressMeters,
      speedKmH: user.garminTracking?.averageSpeedKmH,
      currentSpeedKmH: user.garminTracking?.currentSpeedKmH,
      garminPaired:
        garminStatus.get(user._id?.toString() ?? "")?.paired ?? false,
      garminOnline:
        garminStatus.get(user._id?.toString() ?? "")?.online ?? false,
      garminLastSeenAt: garminStatus.get(user._id?.toString() ?? "")
        ?.lastSeenAt,
      team:
        user._id?.toString() === group.owner.toString()
          ? "Organizacion"
          : "GarminTrakker",
    }));

    return res.json({
      trackingId: group._id?.toString() ?? groupId,
      inviteCode: group.inviteCode,
      isActive: true,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      isPublic: false,
      participants,
      route: {
        id: routeLayer?._id?.toString() ?? "",
        name: routeLayer?.name ?? group.name,
        source: routeLayer?.source ?? "group",
        dataRouteJson: routeLayer?.geoJson ?? null,
      },
    });
  } catch (error) {
    console.error("Error al obtener tracking del grupo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const joinGroupByInvite = async (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!inviteCode || typeof inviteCode !== "string") {
      return res
        .status(400)
        .json({ message: "El código de invitación es obligatorio" });
    }

    const normalizedInviteCode = inviteCode.trim().toUpperCase();

    const db = await connectToDatabase();

    const group = await db.collection("groups").findOne({
      inviteCode: normalizedInviteCode,
    });

    if (!group) {
      return res.status(404).json({ message: "Código de invitación inválido" });
    }

    const userObjectId = new ObjectId(userId);

    const isMember = group.users?.some((id: ObjectId) =>
      id.equals(userObjectId),
    );
    if (isMember) {
      return res.status(400).json({ message: "Ya eres miembro de este grupo" });
    }

    const isPending = group.usersPending?.some((id: ObjectId) =>
      id.equals(userObjectId),
    );

    const updatePayload: Record<string, any> = {
      $addToSet: { users: userObjectId },
    };

    if (isPending) {
      updatePayload.$pull = { usersPending: userObjectId };
    }

    const result = await db
      .collection("groups")
      .updateOne({ _id: group._id }, updatePayload);

    if (result.modifiedCount === 0) {
      return res.status(500).json({ message: "No se pudo unir al grupo" });
    }

    await db
      .collection("users")
      .updateOne({ _id: userObjectId }, { $addToSet: { groups: group._id } });

    return res.json({
      message: "Te has unido al grupo exitosamente",
      groupId: group._id.toString(),
      groupName: group.name,
    });
  } catch (error) {
    console.error("Error al unirse al grupo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const deleteGroup = async (req: Request, res: Response) => {
  try {
    const { groupId } = req.params;

    if (!ObjectId.isValid(groupId)) {
      return res.status(400).json({ message: "ID de grupo inválido" });
    }

    const db = await connectToDatabase();
    const groupObjectId = new ObjectId(groupId);

    const deletedGroup = await db
      .collection<Group>("groups")
      .deleteOne({ _id: groupObjectId });

    if (deletedGroup.deletedCount === 0) {
      return res.status(404).json({ message: "Grupo no encontrado" });
    }

    await db
      .collection<User>("users")
      .updateMany(
        { groups: groupObjectId },
        { $pull: { groups: groupObjectId } },
      );

    await db.collection<GroupLayer>("groupLayers").deleteMany({
      groupId: groupObjectId,
    });

    await db.collection<GroupLayerPreference>("groupLayerPreferences").deleteMany({
      groupId: groupObjectId,
    });

    return res.status(200).json({ message: "Grupo eliminado exitosamente" });
  } catch (error) {
    console.error("Error al eliminar grupo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
