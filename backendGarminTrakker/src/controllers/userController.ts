import { Request, Response } from "express";
import { ObjectId, UpdateResult } from "mongodb";
import { connectToDatabase } from "../config/db";
import { User } from "../models/user";
import { sanitizeUser } from "../utils/sanitizeUser";
import {
  isCoordinateInRange,
  isValidCoordinate,
  updateLiveTrackingLocation,
} from "../services/liveTrackingService";

export const getUsers = async (_req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const usersCollection = db.collection<User>("users");

    const users = await usersCollection
      .find({}, { projection: { password: 0 } })
      .toArray();

    return res.json(users);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

export const getMe = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Usuario no autenticado",
      });
    }

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        error: "userId inválido",
      });
    }

    const db = await connectToDatabase();
    const usersCollection = db.collection<User>("users");

    const user = await usersCollection.findOne(
      { _id: new ObjectId(userId) },
      { projection: { password: 0 } },
    );

    if (!user) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    return res.json(sanitizeUser(user));
  } catch (error) {
    console.error("Error al obtener el usuario autenticado:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

export const updateUserLocation = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;

    const latitude =
      typeof req.body?.location?.latitude === "number"
        ? req.body.location.latitude
        : req.body?.latitude;

    const longitude =
      typeof req.body?.location?.longitude === "number"
        ? req.body.location.longitude
        : req.body?.longitude;

    if (!userId) {
      return res.status(401).json({
        error: "Usuario no autenticado",
      });
    }

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        error: "userId inválido",
      });
    }

    if (!isValidCoordinate(latitude) || !isValidCoordinate(longitude)) {
      return res.status(400).json({
        error: "La ubicación es inválida",
      });
    }

    if (!isCoordinateInRange(latitude, longitude)) {
      return res.status(400).json({
        error: "La ubicación está fuera de rango",
      });
    }

    const summary = await updateLiveTrackingLocation({
      userId,
      latitude,
      longitude,
      source: "api",
    });

    if (!summary) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    return res.json({
      message: "Ubicación del usuario actualizada correctamente",
      last_update: summary.last_update,
    });
  } catch (error) {
    console.error("Error al actualizar ubicación:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};

export const updateRealTimeLocation = async (req: Request, res: Response) => {
  try {
    const { realTimeLocation } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Usuario no autenticado",
      });
    }

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({
        error: "userId inválido",
      });
    }

    if (typeof realTimeLocation !== "boolean") {
      return res.status(400).json({
        error: "realTimeLocation debe ser boolean",
      });
    }

    const db = await connectToDatabase();
    const usersCollection = db.collection<User>("users");

    const result: UpdateResult = await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          real_time_location: realTimeLocation,
        },
      },
    );

    if (!result.acknowledged) {
      return res.status(500).json({
        error: "Error al actualizar en la base de datos",
      });
    }

    if (result.matchedCount === 0) {
      return res.status(404).json({
        error: "Usuario no encontrado",
      });
    }

    return res.json({
      message: "Ubicación en tiempo real actualizada correctamente",
      real_time_location: realTimeLocation,
    });
  } catch (error) {
    console.error("Error al actualizar la ubicación en tiempo real:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
    });
  }
};
