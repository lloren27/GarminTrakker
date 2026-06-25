import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { AuthUser, JwtUserPayload } from "../models/auth";
import { connectToDatabase } from "../config/db";
import { User } from "../models/user";

const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Acceso denegado. Token faltante.",
      });
    }

    const token = authHeader.split(" ")[1];
    const secretKey = process.env.JWT_SECRET;

    if (!secretKey) {
      console.error("JWT_SECRET no está configurado.");
      return res.status(500).json({
        success: false,
        error: "Error interno del servidor.",
      });
    }

    const decoded = jwt.verify(token, secretKey) as JwtUserPayload;

    if (!decoded.userId || !decoded.login) {
      return res.status(403).json({
        success: false,
        error: "Token inválido.",
      });
    }

    const db = await connectToDatabase();

    const user = await db.collection<User>("users").findOne({
      _id: new ObjectId(decoded.userId),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Usuario no válido.",
      });
    }

    if ((decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(401).json({
        success: false,
        error: "Sesión invalidada. Vuelve a iniciar sesión.",
      });
    }

    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return res.status(423).json({
        success: false,
        error: "Cuenta bloqueada temporalmente.",
      });
    }

    const authUser: AuthUser = {
      userId: user._id!.toString(),
      login: user.login,
    };

    req.user = authUser;

    next();
  } catch (error) {
    console.error("Error al verificar el token:", error);
    return res.status(403).json({
      success: false,
      error: "Token inválido o expirado.",
    });
  }
};

export default authenticateToken;