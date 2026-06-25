import express from "express";
import authenticateToken from "../config/authMiddleware";
import {
  createGroup,
  getUserGroups,
  getGroupUsers,
  getGroupTracking,
  joinGroupByInvite,
  deleteGroup,
} from "../controllers/groupController";
import {
  createGroupLayer,
  deleteGroupLayer,
  getGroupLayerPreference,
  getGroupLayers,
  updateGroupLayer,
  updateGroupLayerPreference,
} from "../controllers/groupLayerController";

const router = express.Router();

router.use(authenticateToken);

router.post("/", createGroup);
router.get("/", getUserGroups);
router.get("/:groupId/tracking", getGroupTracking);
router.get("/:groupId/users", getGroupUsers);
router.post("/join", joinGroupByInvite);
router.get("/:groupId/layers", getGroupLayers);
router.post("/:groupId/layers", createGroupLayer);
router.get("/:groupId/layer-preferences", getGroupLayerPreference);
router.patch("/:groupId/layer-preferences", updateGroupLayerPreference);
router.patch("/:groupId/layers/:layerId", updateGroupLayer);
router.delete("/:groupId/layers/:layerId", deleteGroupLayer);
router.delete("/:groupId", deleteGroup);

export default router;
