import { Request, Response } from "express";
import {
  isCoordinateInRange,
  isValidCoordinate,
  updateLiveTrackingLocation,
} from "../services/liveTrackingService";

const getBearerToken = (authHeader?: string): string | null => {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
};

const isAuthorizedConnectIqRequest = (req: Request): boolean => {
  const expectedToken = process.env.CONNECT_IQ_SHARED_TOKEN;

  if (!expectedToken && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (!expectedToken) {
    return false;
  }

  const bearerToken = getBearerToken(req.headers.authorization);
  const headerToken = req.headers["x-connect-iq-token"];

  return (
    bearerToken === expectedToken ||
    (typeof headerToken === "string" && headerToken === expectedToken)
  );
};

export const updateConnectIqLocation = async (req: Request, res: Response) => {
  try {
    if (!isAuthorizedConnectIqRequest(req)) {
      return res.status(401).json({
        success: false,
        error: "Connect IQ token inválido",
      });
    }

    const userId = req.body?.userId;
    const latitude =
      typeof req.body?.latitude === "number" ? req.body.latitude : req.body?.lat;
    const longitude =
      typeof req.body?.longitude === "number"
        ? req.body.longitude
        : req.body?.lon;
    const elapsedDistanceMeters = req.body?.elapsedDistanceMeters;

    if (typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({
        success: false,
        error: "userId es obligatorio",
      });
    }

    if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) {
      return res.status(400).json({
        success: false,
        error: "La ubicación es inválida",
      });
    }

    if (!isCoordinateInRange(latitude, longitude)) {
      return res.status(400).json({
        success: false,
        error: "La ubicación está fuera de rango",
      });
    }

    if (
      elapsedDistanceMeters !== undefined &&
      (typeof elapsedDistanceMeters !== "number" ||
        !Number.isFinite(elapsedDistanceMeters) ||
        elapsedDistanceMeters < 0)
    ) {
      return res.status(400).json({
        success: false,
        error: "elapsedDistanceMeters es inválido",
      });
    }

    const summary = await updateLiveTrackingLocation({
      userId: userId.trim(),
      latitude,
      longitude,
      elapsedDistanceMeters,
      source: "connect_iq",
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: "Usuario no encontrado",
      });
    }

    return res.json({
      success: true,
      ...summary,
    });
  } catch (error) {
    console.error("Error al actualizar ubicación Connect IQ:", error);
    return res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};
