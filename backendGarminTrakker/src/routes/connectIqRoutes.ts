import express from "express";
import {
  deleteConnectIqDevice,
  getConnectIqDevices,
  getConnectIqPairingStatus,
  pairConnectIqDevice,
  startConnectIqPairing,
  updateConnectIqLocation,
} from "../controllers/connectIqController";
import authenticateToken from "../config/authMiddleware";

const router = express.Router();

router.post("/pairing/start", startConnectIqPairing);
router.post("/pairing/status", getConnectIqPairingStatus);
router.post("/pair", authenticateToken, pairConnectIqDevice);
router.get("/devices", authenticateToken, getConnectIqDevices);
router.delete(
  "/devices/:deviceId",
  authenticateToken,
  deleteConnectIqDevice,
);
router.post("/live-update", updateConnectIqLocation);

export default router;
