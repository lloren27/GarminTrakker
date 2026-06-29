import { CorsOptions } from "cors";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080",
  "https://webgarmintrakker-production.up.railway.app",
];

const normalizeOrigin = (origin: string): string =>
  origin.trim().replace(/\/+$/, "");

const getAllowedOrigins = (): string[] =>
  Array.from(
    new Set([
      ...DEFAULT_ALLOWED_ORIGINS,
      ...(process.env.CORS_ORIGINS || "").split(","),
    ]),
  )
    .map(normalizeOrigin)
    .filter(Boolean);

export const corsOrigin: NonNullable<CorsOptions["origin"]> = (
  origin,
  callback,
) => {
  if (!origin || getAllowedOrigins().includes(normalizeOrigin(origin))) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origen no permitido por CORS: ${origin}`));
};

export const corsOptions: CorsOptions = {
  origin: corsOrigin,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
};
