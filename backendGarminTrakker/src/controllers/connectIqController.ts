import { Request, Response } from "express";
import {
  isCoordinateInRange,
  isValidCoordinate,
  updateLiveTrackingLocation,
} from "../services/liveTrackingService";
import {
  authenticateGarminDevice,
  getGarminPairingStatus,
  listGarminDevicesForUser,
  pairGarminDevice,
  startGarminPairing,
  touchGarminDevice,
  unlinkGarminDevice,
} from "../services/garminDeviceService";

const getBearerToken = (authHeader?: string): string | null => {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
};

const isAuthorizedLegacyRequest = (req: Request): boolean => {
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

const isNonNegativeFinite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export const startConnectIqPairing = async (req: Request, res: Response) => {
  try {
    const deviceId = req.body?.deviceId;
    const model = req.body?.model;

    if (
      typeof deviceId !== "string" ||
      deviceId.trim().length < 8 ||
      deviceId.length > 200
    ) {
      return res.status(400).json({
        success: false,
        error: "Identificador de dispositivo inválido",
      });
    }

    const pairing = await startGarminPairing({
      deviceId,
      model: typeof model === "string" ? model : undefined,
    });

    return res.status(201).json({
      success: true,
      ...pairing,
    });
  } catch (error) {
    console.error("Error iniciando vinculación Garmin:", error);
    return res.status(500).json({
      success: false,
      error: "No se pudo generar el código de vinculación",
    });
  }
};

export const getConnectIqPairingStatus = async (
  req: Request,
  res: Response,
) => {
  try {
    const deviceId = req.body?.deviceId;
    const pairingCode = req.body?.pairingCode;

    if (typeof deviceId !== "string" || typeof pairingCode !== "string") {
      return res.status(400).json({
        success: false,
        error: "deviceId y pairingCode son obligatorios",
      });
    }

    const pairing = await getGarminPairingStatus({
      deviceId,
      pairingCode,
    });

    if (!pairing) {
      return res.status(404).json({
        success: false,
        error: "Código caducado o no encontrado",
      });
    }

    return res.json({
      success: true,
      ...pairing,
    });
  } catch (error) {
    console.error("Error consultando vinculación Garmin:", error);
    return res.status(500).json({
      success: false,
      error: "No se pudo consultar la vinculación",
    });
  }
};

export const pairConnectIqDevice = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const pairingCode = req.body?.pairingCode;

    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    if (typeof pairingCode !== "string" || !pairingCode.trim()) {
      return res.status(400).json({
        success: false,
        error: "El código de vinculación es obligatorio",
      });
    }

    const pairedDevice = await pairGarminDevice({
      userId,
      pairingCode,
    });

    if (!pairedDevice) {
      return res.status(404).json({
        success: false,
        error: "Código inválido o caducado",
      });
    }

    return res.json({
      success: true,
      message: "Garmin vinculado correctamente",
      ...pairedDevice,
    });
  } catch (error) {
    console.error("Error vinculando Garmin:", error);
    return res.status(500).json({
      success: false,
      error: "No se pudo vincular el Garmin",
    });
  }
};

export const getConnectIqDevices = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    return res.json(await listGarminDevicesForUser(userId));
  } catch (error) {
    console.error("Error obteniendo dispositivos Garmin:", error);
    return res.status(500).json({
      success: false,
      error: "No se pudieron obtener los dispositivos Garmin",
    });
  }
};

export const deleteConnectIqDevice = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const removed = await unlinkGarminDevice({
      userId,
      deviceId: req.params.deviceId,
    });

    if (!removed) {
      return res.status(404).json({ message: "Dispositivo no encontrado" });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Error desvinculando Garmin:", error);
    return res.status(500).json({
      success: false,
      error: "No se pudo desvincular el Garmin",
    });
  }
};

export const updateConnectIqLocation = async (req: Request, res: Response) => {
  try {
    const bearerToken = getBearerToken(req.headers.authorization);
    const device = bearerToken
      ? await authenticateGarminDevice(bearerToken)
      : null;
    const isLegacyRequest = !device && isAuthorizedLegacyRequest(req);

    if (!device && !isLegacyRequest) {
      return res.status(401).json({
        success: false,
        error: "Connect IQ token inválido",
      });
    }

    const userId = device?.userId.toString() ?? req.body?.userId;
    const latitude =
      typeof req.body?.latitude === "number" ? req.body.latitude : req.body?.lat;
    const longitude =
      typeof req.body?.longitude === "number"
        ? req.body.longitude
        : req.body?.lon;
    const elapsedDistanceMeters = req.body?.elapsedDistanceMeters;
    const averageSpeedMps = req.body?.averageSpeedMps;
    const currentSpeedMps = req.body?.currentSpeedMps;
    const timerTimeSeconds = req.body?.timerTimeSeconds;

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
      !isNonNegativeFinite(elapsedDistanceMeters)
    ) {
      return res.status(400).json({
        success: false,
        error: "elapsedDistanceMeters es inválido",
      });
    }

    for (const [field, value] of [
      ["averageSpeedMps", averageSpeedMps],
      ["currentSpeedMps", currentSpeedMps],
      ["timerTimeSeconds", timerTimeSeconds],
    ] as const) {
      if (value !== undefined && !isNonNegativeFinite(value)) {
        return res.status(400).json({
          success: false,
          error: `${field} es inválido`,
        });
      }
    }

    const summary = await updateLiveTrackingLocation({
      userId: userId.trim(),
      latitude,
      longitude,
      elapsedDistanceMeters,
      averageSpeedMps,
      currentSpeedMps,
      timerTimeSeconds,
      source: "connect_iq",
    });

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: "Usuario no encontrado",
      });
    }

    if (device?._id) {
      await touchGarminDevice(device._id);
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
