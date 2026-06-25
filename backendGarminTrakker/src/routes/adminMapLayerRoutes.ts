import express from "express";
import authenticateToken from "../config/authMiddleware";
import {
  createAdminMapLayer,
  deleteAdminMapLayer,
  getActiveAdminMapLayers,
  getAdminMapLayers,
  refreshAdminMapLayer,
  updateAdminMapLayer,
} from "../controllers/adminMapLayerController";

const router = express.Router();

router.get("/map-layers", authenticateToken, getActiveAdminMapLayers);
router.get("/admin/map-layers", authenticateToken, getAdminMapLayers);
router.post("/admin/map-layers", authenticateToken, createAdminMapLayer);
router.patch("/admin/map-layers/:layerId", authenticateToken, updateAdminMapLayer);
router.post(
  "/admin/map-layers/:layerId/refresh",
  authenticateToken,
  refreshAdminMapLayer,
);
router.delete(
  "/admin/map-layers/:layerId",
  authenticateToken,
  deleteAdminMapLayer,
);

export default router;
