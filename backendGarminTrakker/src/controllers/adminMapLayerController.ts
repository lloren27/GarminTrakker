import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../config/db";
import {
  isAdminAccessFailure,
  requireAdminAccess,
} from "../config/adminAccess";
import {
  AdminMapLayer,
  AdminMapLayerSource,
  AdminMapLayerType,
} from "../models/adminMapLayer";
import { extractMapLayerGeoJson } from "../services/mapLayerGeoJsonService";

const MAX_LAYER_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 240;

function serializeAdminLayer(layer: AdminMapLayer) {
  return {
    ...layer,
    _id: layer._id?.toString(),
    createdBy: layer.createdBy.toString(),
    updatedBy: layer.updatedBy.toString(),
    scope: "global",
  };
}

function normalizeLayerType(type: unknown): AdminMapLayerType {
  if (type === "kml") return "kml";
  return type === "gpx" ? "gpx" : "geojson";
}

function normalizeLayerSource({
  source,
  sourceUrl,
}: {
  source?: unknown;
  sourceUrl?: unknown;
}): AdminMapLayerSource {
  if (source === "upload") return "upload";
  if (typeof sourceUrl === "string" && sourceUrl.trim()) return "url";
  return "inline";
}

function normalizeName(name: unknown) {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("El nombre de la capa es obligatorio");
  }

  return name.trim().slice(0, MAX_LAYER_NAME_LENGTH);
}

function normalizeDescription(description: unknown) {
  return typeof description === "string" && description.trim()
    ? description.trim().slice(0, MAX_DESCRIPTION_LENGTH)
    : undefined;
}

function normalizeSourceUrl(sourceUrl: unknown) {
  if (typeof sourceUrl !== "string" || !sourceUrl.trim()) return undefined;

  const parsedUrl = new URL(sourceUrl.trim());

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("La URL debe usar http o https");
  }

  return parsedUrl.toString();
}

function getFeatureCount(geoJson: Record<string, unknown>) {
  const features = Array.isArray(geoJson.features) ? geoJson.features : [];
  return features.length;
}

export const getActiveAdminMapLayers = async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const layers = await db
      .collection<AdminMapLayer>("adminMapLayers")
      .find({ isActive: true })
      .sort({ updatedAt: -1 })
      .toArray();

    return res.json(layers.map(serializeAdminLayer));
  } catch (error) {
    console.error("Error al obtener capas globales:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const getAdminMapLayers = async (req: Request, res: Response) => {
  try {
    const access = await requireAdminAccess(req.user?.userId);

    if (isAdminAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    const layers = await access.db
      .collection<AdminMapLayer>("adminMapLayers")
      .find({})
      .sort({ updatedAt: -1 })
      .toArray();

    return res.json(layers.map(serializeAdminLayer));
  } catch (error) {
    console.error("Error al obtener capas de administración:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};

export const createAdminMapLayer = async (req: Request, res: Response) => {
  try {
    const access = await requireAdminAccess(req.user?.userId);

    if (isAdminAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    const name = normalizeName(req.body?.name);
    const type = normalizeLayerType(req.body?.type);
    const sourceUrl = normalizeSourceUrl(req.body?.sourceUrl);
    const source = normalizeLayerSource({ source: req.body?.source, sourceUrl });
    const geoJson = await extractMapLayerGeoJson({
      name,
      type,
      sourceUrl,
      rawContent: req.body?.rawContent,
      geoJson: req.body?.geoJson,
    });
    const now = new Date().toISOString();
    const layer: AdminMapLayer = {
      type,
      source,
      name,
      description: normalizeDescription(req.body?.description),
      sourceUrl,
      geoJson,
      isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : true,
      extraction: {
        status: "success",
        fetchedAt: now,
        featureCount: getFeatureCount(geoJson),
      },
      createdBy: access.userObjectId,
      updatedBy: access.userObjectId,
      createdAt: now,
      updatedAt: now,
    };

    const result = await access.db.collection<AdminMapLayer>("adminMapLayers").insertOne(layer);

    return res.status(201).json(
      serializeAdminLayer({
        ...layer,
        _id: result.insertedId,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la capa";
    console.error("Error al crear capa global:", error);
    return res.status(400).json({ message });
  }
};

export const updateAdminMapLayer = async (req: Request, res: Response) => {
  try {
    const access = await requireAdminAccess(req.user?.userId);
    const { layerId } = req.params;

    if (isAdminAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    if (!ObjectId.isValid(layerId)) {
      return res.status(400).json({ message: "ID de capa inválido" });
    }

    const layerObjectId = new ObjectId(layerId);
    const existingLayer = await access.db
      .collection<AdminMapLayer>("adminMapLayers")
      .findOne({ _id: layerObjectId });

    if (!existingLayer) {
      return res.status(404).json({ message: "Capa no encontrada" });
    }

    const hasNewSource =
      req.body?.sourceUrl !== undefined ||
      req.body?.rawContent !== undefined ||
      req.body?.geoJson !== undefined;
    const nextType = normalizeLayerType(req.body?.type || existingLayer.type);
    const nextName =
      req.body?.name !== undefined ? normalizeName(req.body.name) : existingLayer.name;
    const nextSourceUrl =
      req.body?.sourceUrl !== undefined
        ? normalizeSourceUrl(req.body.sourceUrl)
        : existingLayer.sourceUrl;
    const now = new Date().toISOString();
    const updates: Partial<AdminMapLayer> = {
      name: nextName,
      type: nextType,
      description:
        req.body?.description !== undefined
          ? normalizeDescription(req.body.description)
          : existingLayer.description,
      sourceUrl: nextSourceUrl,
      isActive:
        typeof req.body?.isActive === "boolean" ? req.body.isActive : existingLayer.isActive,
      updatedBy: access.userObjectId,
      updatedAt: now,
    };

    if (hasNewSource) {
      const geoJson = await extractMapLayerGeoJson({
        name: nextName,
        type: nextType,
        sourceUrl: nextSourceUrl,
        rawContent: req.body?.rawContent,
        geoJson: req.body?.geoJson,
      });

      updates.geoJson = geoJson;
      updates.source = normalizeLayerSource({
        source: req.body?.source,
        sourceUrl: nextSourceUrl,
      });
      updates.extraction = {
        status: "success",
        fetchedAt: now,
        featureCount: getFeatureCount(geoJson),
      };
    }

    await access.db.collection<AdminMapLayer>("adminMapLayers").updateOne(
      { _id: layerObjectId },
      {
        $set: updates,
      },
    );

    return res.json(
      serializeAdminLayer({
        ...existingLayer,
        ...updates,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo actualizar la capa";
    console.error("Error al actualizar capa global:", error);
    return res.status(400).json({ message });
  }
};

export const refreshAdminMapLayer = async (req: Request, res: Response) => {
  try {
    const access = await requireAdminAccess(req.user?.userId);
    const { layerId } = req.params;

    if (isAdminAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    if (!ObjectId.isValid(layerId)) {
      return res.status(400).json({ message: "ID de capa inválido" });
    }

    const layerObjectId = new ObjectId(layerId);
    const layer = await access.db
      .collection<AdminMapLayer>("adminMapLayers")
      .findOne({ _id: layerObjectId });

    if (!layer) {
      return res.status(404).json({ message: "Capa no encontrada" });
    }

    if (!layer.sourceUrl) {
      return res.status(400).json({ message: "Esta capa no tiene URL de origen" });
    }

    const now = new Date().toISOString();
    const geoJson = await extractMapLayerGeoJson({
      name: layer.name,
      type: layer.type,
      sourceUrl: layer.sourceUrl,
    });
    const updates: Partial<AdminMapLayer> = {
      geoJson,
      extraction: {
        status: "success",
        fetchedAt: now,
        featureCount: getFeatureCount(geoJson),
      },
      updatedBy: access.userObjectId,
      updatedAt: now,
    };

    await access.db.collection<AdminMapLayer>("adminMapLayers").updateOne(
      { _id: layerObjectId },
      {
        $set: updates,
      },
    );

    return res.json(
      serializeAdminLayer({
        ...layer,
        ...updates,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo refrescar la capa";
    console.error("Error al refrescar capa global:", error);
    return res.status(400).json({ message });
  }
};

export const deleteAdminMapLayer = async (req: Request, res: Response) => {
  try {
    const access = await requireAdminAccess(req.user?.userId);
    const { layerId } = req.params;

    if (isAdminAccessFailure(access)) {
      return res.status(access.status).json({ message: access.message });
    }

    if (!ObjectId.isValid(layerId)) {
      return res.status(400).json({ message: "ID de capa inválido" });
    }

    const result = await access.db
      .collection<AdminMapLayer>("adminMapLayers")
      .deleteOne({ _id: new ObjectId(layerId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Capa no encontrada" });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar capa global:", error);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
};
