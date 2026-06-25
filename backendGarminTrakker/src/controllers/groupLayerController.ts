import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../config/db";
import { Group } from "../models/group";
import { GroupLayer } from "../models/groupLayer";
import { GroupLayerPreference } from "../models/groupLayerPreference";

const MAX_LAYER_NAME_LENGTH = 80;
const MAX_FEATURES_PER_LAYER = 2000;

type GroupAccessFailure = {
  status: number;
  message: string;
};

function serializeLayer(layer: GroupLayer) {
  return {
    ...layer,
    _id: layer._id?.toString(),
    groupId: layer.groupId.toString(),
    createdBy: layer.createdBy.toString(),
    scope: "group",
  };
}

function serializeLayerPreference(preference: GroupLayerPreference | null) {
  return {
    visibleLayerIds: preference?.visibleLayerIds.map((layerId) => layerId.toString()) ?? null,
    updatedAt: preference?.updatedAt ?? null,
  };
}

function isGroupMember(group: Group, userId: ObjectId): boolean {
  const allMembers = [group.owner, ...(group.users || [])];

  return allMembers.some((memberId) => memberId.toString() === userId.toString());
}

async function getGroupForMember(groupId: string, userId: string) {
  if (!ObjectId.isValid(groupId)) {
    return { status: 400, message: "ID de grupo inválido" } as GroupAccessFailure;
  }

  const db = await connectToDatabase();
  const userObjectId = new ObjectId(userId);
  const groupObjectId = new ObjectId(groupId);
  const group = await db.collection<Group>("groups").findOne({ _id: groupObjectId });

  if (!group) {
    return { status: 404, message: "Grupo no encontrado" } as GroupAccessFailure;
  }

  if (!isGroupMember(group, userObjectId)) {
    return { status: 403, message: "No perteneces a este grupo" } as GroupAccessFailure;
  }

  return { db, group, groupObjectId, userObjectId } as const;
}

function isGroupAccessFailure(
  access: Awaited<ReturnType<typeof getGroupForMember>>,
): access is GroupAccessFailure {
  return "status" in access && typeof access.status === "number";
}

function hasValidGeoJsonShape(geoJson: unknown): geoJson is Record<string, unknown> {
  if (!geoJson || typeof geoJson !== "object") return false;

  const collection = geoJson as {
    type?: unknown;
    features?: unknown;
  };

  return (
    collection.type === "FeatureCollection" &&
    Array.isArray(collection.features) &&
    collection.features.length > 0 &&
    collection.features.length <= MAX_FEATURES_PER_LAYER
  );
}

function canManageLayer(group: Group, userId: ObjectId, layer: GroupLayer): boolean {
  return (
    group.owner.toString() === userId.toString() ||
    layer.createdBy.toString() === userId.toString()
  );
}

export const getGroupLayers = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const access = await getGroupForMember(groupId, userId);

    if (isGroupAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    const layers = await access.db
      .collection<GroupLayer>("groupLayers")
      .find({ groupId: access.groupObjectId })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json(layers.map(serializeLayer));
  } catch (error) {
    console.error("Error al obtener capas del grupo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const createGroupLayer = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { name, type, geoJson } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (type !== "gpx") {
      return res.status(400).json({ message: "Tipo de capa no soportado" });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "El nombre de la capa es obligatorio" });
    }

    if (!hasValidGeoJsonShape(geoJson)) {
      return res.status(400).json({ message: "GeoJSON de capa inválido" });
    }

    const access = await getGroupForMember(groupId, userId);

    if (isGroupAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    const now = new Date().toISOString();
    const layer: GroupLayer = {
      groupId: access.groupObjectId,
      type: "gpx",
      source: "user_upload",
      name: name.trim().slice(0, MAX_LAYER_NAME_LENGTH),
      geoJson,
      createdBy: access.userObjectId,
      createdAt: now,
      updatedAt: now,
    };

    const result = await access.db.collection<GroupLayer>("groupLayers").insertOne(layer);
    const createdLayer = {
      ...layer,
      _id: result.insertedId,
    };

    return res.status(201).json(serializeLayer(createdLayer));
  } catch (error) {
    console.error("Error al crear capa del grupo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const updateGroupLayer = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { groupId, layerId } = req.params;
    const { name } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!ObjectId.isValid(layerId)) {
      return res.status(400).json({ message: "ID de capa inválido" });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "El nombre de la capa es obligatorio" });
    }

    const access = await getGroupForMember(groupId, userId);

    if (isGroupAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    const layerObjectId = new ObjectId(layerId);
    const layer = await access.db.collection<GroupLayer>("groupLayers").findOne({
      _id: layerObjectId,
      groupId: access.groupObjectId,
    });

    if (!layer) {
      return res.status(404).json({ message: "Capa no encontrada" });
    }

    if (!canManageLayer(access.group, access.userObjectId, layer)) {
      return res.status(403).json({
        message: "Solo el propietario del grupo o quien subió la capa puede renombrarla",
      });
    }

    const nextName = name.trim().slice(0, MAX_LAYER_NAME_LENGTH);
    const updatedAt = new Date().toISOString();

    const updatedLayer = {
      ...layer,
      name: nextName,
      updatedAt,
    };

    await access.db.collection<GroupLayer>("groupLayers").updateOne(
      {
        _id: layerObjectId,
        groupId: access.groupObjectId,
      },
      {
        $set: {
          name: nextName,
          updatedAt,
        },
      },
    );

    return res.json(serializeLayer(updatedLayer));
  } catch (error) {
    console.error("Error al actualizar capa del grupo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const getGroupLayerPreference = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const access = await getGroupForMember(groupId, userId);

    if (isGroupAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    const preference = await access.db
      .collection<GroupLayerPreference>("groupLayerPreferences")
      .findOne({
        groupId: access.groupObjectId,
        userId: access.userObjectId,
      });

    return res.json(serializeLayerPreference(preference));
  } catch (error) {
    console.error("Error al obtener preferencias de capas:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const updateGroupLayerPreference = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { groupId } = req.params;
    const { visibleLayerIds } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!Array.isArray(visibleLayerIds)) {
      return res.status(400).json({ message: "visibleLayerIds debe ser una lista" });
    }

    const invalidLayerId = visibleLayerIds.find(
      (layerId) => typeof layerId !== "string" || !ObjectId.isValid(layerId),
    );

    if (invalidLayerId) {
      return res.status(400).json({ message: "Lista de capas visibles inválida" });
    }

    const access = await getGroupForMember(groupId, userId);

    if (isGroupAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    const uniqueLayerIds = Array.from(new Set(visibleLayerIds));
    const layerObjectIds = uniqueLayerIds.map((layerId) => new ObjectId(layerId));

    if (layerObjectIds.length > 0) {
      const existingLayerIds = await access.db
        .collection<GroupLayer>("groupLayers")
        .find({
          _id: { $in: layerObjectIds },
          groupId: access.groupObjectId,
        })
        .project({ _id: 1 })
        .toArray();

      if (existingLayerIds.length !== layerObjectIds.length) {
        return res.status(400).json({
          message: "Alguna capa visible no pertenece a este grupo",
        });
      }
    }

    const updatedAt = new Date().toISOString();
    const preference: GroupLayerPreference = {
      groupId: access.groupObjectId,
      userId: access.userObjectId,
      visibleLayerIds: layerObjectIds,
      updatedAt,
    };

    await access.db.collection<GroupLayerPreference>("groupLayerPreferences").updateOne(
      {
        groupId: access.groupObjectId,
        userId: access.userObjectId,
      },
      {
        $set: {
          groupId: preference.groupId,
          userId: preference.userId,
          visibleLayerIds: preference.visibleLayerIds,
          updatedAt: preference.updatedAt,
        },
      },
      { upsert: true },
    );

    return res.json(serializeLayerPreference(preference));
  } catch (error) {
    console.error("Error al actualizar preferencias de capas:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const deleteGroupLayer = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { groupId, layerId } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (!ObjectId.isValid(layerId)) {
      return res.status(400).json({ message: "ID de capa inválido" });
    }

    const access = await getGroupForMember(groupId, userId);

    if (isGroupAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    const layerObjectId = new ObjectId(layerId);
    const layer = await access.db.collection<GroupLayer>("groupLayers").findOne({
      _id: layerObjectId,
      groupId: access.groupObjectId,
    });

    if (!layer) {
      return res.status(404).json({ message: "Capa no encontrada" });
    }

    if (!canManageLayer(access.group, access.userObjectId, layer)) {
      return res.status(403).json({
        message: "Solo el propietario del grupo o quien subió la capa puede eliminarla",
      });
    }

    await access.db.collection<GroupLayer>("groupLayers").deleteOne({
      _id: layerObjectId,
      groupId: access.groupObjectId,
    });

    await access.db.collection<GroupLayerPreference>("groupLayerPreferences").updateMany(
      {
        groupId: access.groupObjectId,
      },
      {
        $pull: {
          visibleLayerIds: layerObjectId,
        },
        $set: {
          updatedAt: new Date().toISOString(),
        },
      },
    );

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar capa del grupo:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
