import express from "express";
import cors from "cors";
import helmet from "helmet";
import userRoutes from "./routes/userRoutes";
import groupRoutes from "./routes/groupRoutes";
import authRoutes from "./routes/authRoutes";
import adminMapLayerRoutes from "./routes/adminMapLayerRoutes";
import connectIqRoutes from "./routes/connectIqRoutes";
import { authLimiter } from "./utils/rateLimit";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? true : true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  }),
);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "25mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/users", userRoutes);
app.use("/groups", groupRoutes);
app.use("/", adminMapLayerRoutes);
app.use("/auth", authLimiter, authRoutes);
app.use("/api/connect-iq", connectIqRoutes);

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Ruta no encontrada",
  });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);

    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
    });
  },
);

export default app;
