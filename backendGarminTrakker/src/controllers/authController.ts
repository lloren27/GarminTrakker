import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as crypto from "crypto";
import { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../config/db";
import { User } from "../models/user";
import { RefreshToken } from "../models/refreshToken";
import { PasswordResetToken } from "../models/passwordResetToken";
import { sanitizeUser } from "../utils/sanitizeUser";
import { Group } from "../models/group";
import { AuthUser, ChangePasswordBody } from "../models/auth";
import { sendPasswordResetEmail } from "../services/emailService";

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MINUTES = 15;
const ACCESS_TOKEN_EXPIRES_IN = "1h";
const REFRESH_TOKEN_EXPIRES_IN = "7d";
const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const PASSWORD_RESET_TOKEN_EXPIRES_MINUTES = 30;

const getClientIp = (req: Request): string | null => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return req.socket.remoteAddress || null;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const normalizeLogin = (login: string) => login.trim().toLowerCase();

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isStrongPassword = (password: string) =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,64}$/.test(password);

const generateTokens = (
  userId: string,
  login: string,
  tokenVersion: number = 0,
) => {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!jwtSecret || !jwtRefreshSecret) {
    throw new Error("JWT secrets no configurados");
  }

  const payload = {
    userId,
    login,
    tokenVersion,
  };

  const accessToken = jwt.sign(payload, jwtSecret, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });

  const refreshToken = jwt.sign(payload, jwtRefreshSecret, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
};

const saveRefreshToken = async ({
  userId,
  token,
  req,
}: {
  userId: string;
  token: string;
  req: Request;
}) => {
  const db = await connectToDatabase();

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  );

  const refreshTokenDoc: RefreshToken = {
    userId: new ObjectId(userId),
    token,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    revokedAt: null,
    replacedByToken: null,
    userAgent: req.headers["user-agent"] || null,
    ip: getClientIp(req),
  };

  await db
    .collection<RefreshToken>("refresh_tokens")
    .insertOne(refreshTokenDoc);
};

const findStoredRefreshToken = async (token: string) => {
  const db = await connectToDatabase();
  return db.collection<RefreshToken>("refresh_tokens").findOne({ token });
};

const revokeStoredRefreshToken = async (
  token: string,
  replacedByToken?: string | null,
) => {
  const db = await connectToDatabase();

  await db.collection<RefreshToken>("refresh_tokens").updateOne(
    { token, revokedAt: null },
    {
      $set: {
        revokedAt: new Date().toISOString(),
        replacedByToken: replacedByToken ?? null,
      },
    },
  );
};

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { email, login, password, confirmPassword, location, avatar } =
      req.body;

    if (
      !email ||
      !login ||
      !password ||
      !confirmPassword ||
      !location ||
      location.latitude === undefined ||
      location.longitude === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Email, login, contraseña, confirmación de contraseña y ubicación son obligatorios",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Las contraseñas no coinciden",
      });
    }

    const emailNormalized = normalizeEmail(email);
    const loginNormalized = normalizeLogin(login);

    if (!isValidEmail(emailNormalized)) {
      return res.status(400).json({
        success: false,
        message: "El email no es válido",
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "La contraseña debe tener entre 8 y 64 caracteres e incluir mayúscula, minúscula y número",
      });
    }

    const db = await connectToDatabase();

    const existingUser = await db.collection<User>("users").findOne({
      $or: [{ loginLower: loginNormalized }, { emailLower: emailNormalized }],
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "El login o email ya están en uso",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    const user: User = {
      email: emailNormalized,
      emailLower: emailNormalized,
      login: login.trim(),
      loginLower: loginNormalized,
      password: hashedPassword,
      avatar: avatar ?? undefined,
      groups: [],
      location: {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        last_update: now,
      },
      real_time_location: true,
      emailVerified: false,
      failedLoginAttempts: 0,
      lockUntil: null,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    const result = await db.collection<User>("users").insertOne(user);
    const userId = result.insertedId.toString();

    const tokens = generateTokens(userId, user.login, user.tokenVersion ?? 0);

    await saveRefreshToken({
      userId,
      token: tokens.refreshToken,
      req,
    });

    return res.status(201).json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: sanitizeUser({
        ...user,
        _id: result.insertedId,
      }),
    });
  } catch (error) {
    console.error("Error al registrar usuario:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

export const loginUser = async (req: Request, res: Response) => {
  try {
    const { login, password } = req.body;

    if (!login || !password) {
      return res.status(400).json({
        success: false,
        message: "Login y contraseña son obligatorios",
      });
    }

    const db = await connectToDatabase();
    const loginNormalized = login.trim().toLowerCase();

    const user = await db.collection<User>("users").findOne({
      $or: [{ loginLower: loginNormalized }, { emailLower: loginNormalized }],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Credenciales incorrectas",
      });
    }

    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      return res.status(423).json({
        success: false,
        message:
          "Cuenta bloqueada temporalmente por demasiados intentos fallidos",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      const failedAttempts = (user.failedLoginAttempts ?? 0) + 1;
      const shouldLock = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;

      await db.collection<User>("users").updateOne(
        { _id: user._id },
        {
          $set: {
            failedLoginAttempts: failedAttempts,
            updatedAt: new Date().toISOString(),
            ...(shouldLock
              ? {
                  lockUntil: new Date(
                    Date.now() + LOCK_TIME_MINUTES * 60 * 1000,
                  ).toISOString(),
                }
              : {}),
          },
        },
      );

      return res.status(401).json({
        success: false,
        message: "Credenciales incorrectas",
      });
    }

    await db.collection<User>("users").updateOne(
      { _id: user._id },
      {
        $set: {
          failedLoginAttempts: 0,
          lockUntil: null,
          lastLoginAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    );

    const tokens = generateTokens(
      user._id!.toString(),
      user.login,
      user.tokenVersion ?? 0,
    );

    await saveRefreshToken({
      userId: user._id!.toString(),
      token: tokens.refreshToken,
      req,
    });

    return res.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token requerido",
      });
    }

    await revokeStoredRefreshToken(refreshToken);

    return res.status(200).json({
      success: true,
      message: "Sesión cerrada correctamente",
    });
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken: providedRefreshToken } = req.body;

    if (!providedRefreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token requerido",
      });
    }

    const storedToken = await findStoredRefreshToken(providedRefreshToken);

    if (!storedToken) {
      return res.status(403).json({
        success: false,
        message: "Refresh token inválido",
      });
    }

    if (storedToken.revokedAt) {
      return res.status(403).json({
        success: false,
        message: "Refresh token revocado",
      });
    }

    if (new Date(storedToken.expiresAt) <= new Date()) {
      return res.status(403).json({
        success: false,
        message: "Refresh token expirado",
      });
    }

    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!jwtRefreshSecret) {
      throw new Error("JWT_REFRESH_SECRET no configurado");
    }

    const decoded = jwt.verify(providedRefreshToken, jwtRefreshSecret) as {
      userId: string;
      login: string;
      tokenVersion?: number;
    };

    const db = await connectToDatabase();

    const user = await db.collection<User>("users").findOne({
      _id: new ObjectId(decoded.userId),
    });

    if (!user) {
      return res.status(403).json({
        success: false,
        message: "Usuario no válido",
      });
    }

    if ((decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      return res.status(403).json({
        success: false,
        message: "Sesión invalidada",
      });
    }

    const newTokens = generateTokens(
      user._id!.toString(),
      user.login,
      user.tokenVersion ?? 0,
    );

    await revokeStoredRefreshToken(
      providedRefreshToken,
      newTokens.refreshToken,
    );

    await saveRefreshToken({
      userId: user._id!.toString(),
      token: newTokens.refreshToken,
      req,
    });

    return res.status(200).json({
      success: true,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
    });
  } catch (error) {
    console.error("Error al refrescar token:", error);
    return res.status(403).json({
      success: false,
      message: "Refresh token inválido o expirado",
    });
  }
};

const generatePasswordResetToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const savePasswordResetToken = async ({
  userId,
  token,
}: {
  userId: string;
  token: string;
}) => {
  const db = await connectToDatabase();

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + PASSWORD_RESET_TOKEN_EXPIRES_MINUTES * 60 * 1000,
  );

  const resetTokenDoc: PasswordResetToken = {
    userId: new ObjectId(userId),
    token,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    usedAt: null,
  };

  await db
    .collection<PasswordResetToken>("password_reset_tokens")
    .insertOne(resetTokenDoc);
};

const findPasswordResetToken = async (token: string) => {
  const db = await connectToDatabase();

  return db
    .collection<PasswordResetToken>("password_reset_tokens")
    .findOne({ token });
};

const markPasswordResetTokenAsUsed = async (token: string) => {
  const db = await connectToDatabase();

  await db.collection<PasswordResetToken>("password_reset_tokens").updateOne(
    { token, usedAt: null },
    {
      $set: {
        usedAt: new Date().toISOString(),
      },
    },
  );
};

const revokeAllUserRefreshTokens = async (userId: string) => {
  const db = await connectToDatabase();

  await db.collection<RefreshToken>("refresh_tokens").updateMany(
    {
      userId: new ObjectId(userId),
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date().toISOString(),
      },
    },
  );
};

export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "El email es obligatorio",
      });
    }

    const emailNormalized = normalizeEmail(email);
    const db = await connectToDatabase();

    const user = await db.collection<User>("users").findOne({
      emailLower: emailNormalized,
    });

    // Respuesta genérica para no revelar si el email existe o no
    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          "Si existe una cuenta con ese email, se enviarán instrucciones para recuperar la contraseña",
      });
    }

    const resetToken = generatePasswordResetToken();

    await savePasswordResetToken({
      userId: user._id!.toString(),
      token: resetToken,
    });

    await sendPasswordResetEmail(user.email, resetToken);

    return res.status(200).json({
      success: true,
      message:
        "Si existe una cuenta con ese email, se enviarán instrucciones para recuperar la contraseña",
      ...(process.env.NODE_ENV !== "production" && { resetToken }),
    });
  } catch (error) {
    console.error("Error al solicitar recuperación de contraseña:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password, confirmPassword } = req.body;

    if (!token || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Token, contraseña y confirmación son obligatorios",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Las contraseñas no coinciden",
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "La contraseña debe tener entre 8 y 64 caracteres e incluir mayúscula, minúscula y número",
      });
    }

    const resetDoc = await findPasswordResetToken(token);

    if (!resetDoc) {
      return res.status(400).json({
        success: false,
        message: "Token inválido",
      });
    }

    if (resetDoc.usedAt) {
      return res.status(400).json({
        success: false,
        message: "El token ya ha sido utilizado",
      });
    }

    if (new Date(resetDoc.expiresAt) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "El token ha expirado",
      });
    }

    const db = await connectToDatabase();
    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    await db.collection<User>("users").updateOne(
      { _id: resetDoc.userId },
      {
        $set: {
          password: hashedPassword,
          failedLoginAttempts: 0,
          lockUntil: null,
          updatedAt: now,
        },
        $inc: {
          tokenVersion: 1,
        },
      },
    );

    await markPasswordResetTokenAsUsed(token);
    await revokeAllUserRefreshTokens(resetDoc.userId.toString());

    return res.status(200).json({
      success: true,
      message: "Contraseña restablecida correctamente",
    });
  } catch (error) {
    console.error("Error al restablecer la contraseña:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

export const deleteMyAccount = async (req: Request, res: Response) => {
  try {
    const authUser = req.user as AuthUser | undefined;
    const { password } = req.body;

    if (!authUser?.userId) {
      return res.status(401).json({
        success: false,
        message: "No autorizado",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "La contraseña es obligatoria para eliminar la cuenta",
      });
    }

    const db = await connectToDatabase();
    const userObjectId = new ObjectId(authUser.userId);

    const existingUser = await db.collection<User>("users").findOne({
      _id: userObjectId,
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      existingUser.password,
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Contraseña incorrecta",
      });
    }

    await db.collection<RefreshToken>("refresh_tokens").updateMany(
      { userId: userObjectId, revokedAt: null },
      {
        $set: {
          revokedAt: new Date().toISOString(),
        },
      },
    );

    await db.collection("password_reset_tokens").updateMany(
      { userId: userObjectId, usedAt: null },
      {
        $set: {
          usedAt: new Date().toISOString(),
        },
      },
    );

    await db.collection<Group>("groups").deleteMany({
      owner: userObjectId,
    });

    await db.collection<Group>("groups").updateMany(
      {
        $or: [{ users: userObjectId }, { usersPending: userObjectId }],
      },
      {
        $pull: {
          users: userObjectId,
          usersPending: userObjectId,
        },
      },
    );

    await db.collection<User>("users").deleteOne({
      _id: userObjectId,
    });

    return res.status(200).json({
      success: true,
      message: "Cuenta eliminada correctamente",
    });
  } catch (error) {
    console.error("Error al eliminar la cuenta:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};

export const changePassword = async (
  req: Request<{}, {}, ChangePasswordBody>,
  res: Response,
) => {
  try {
    const authUser = req.user as AuthUser | undefined;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!authUser?.userId) {
      return res.status(401).json({
        success: false,
        message: "No autorizado",
      });
    }

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message:
          "La contraseña actual, la nueva contraseña y su confirmación son obligatorias",
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: "Las nuevas contraseñas no coinciden",
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "La nueva contraseña debe tener entre 8 y 64 caracteres e incluir mayúscula, minúscula y número",
      });
    }

    const db = await connectToDatabase();
    const userObjectId = new ObjectId(authUser.userId);

    const user = await db.collection<User>("users").findOne({
      _id: userObjectId,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "La contraseña actual no es correcta",
      });
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message: "La nueva contraseña no puede ser igual a la actual",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    const now = new Date().toISOString();

    await db.collection<User>("users").updateOne(
      { _id: userObjectId },
      {
        $set: {
          password: hashedPassword,
          updatedAt: now,
          failedLoginAttempts: 0,
          lockUntil: null,
        },
        $inc: {
          tokenVersion: 1,
        },
      },
    );

    await db.collection<RefreshToken>("refresh_tokens").updateMany(
      {
        userId: userObjectId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: now,
        },
      },
    );

    return res.status(200).json({
      success: true,
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    console.error("Error al cambiar la contraseña:", error);
    return res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  }
};
