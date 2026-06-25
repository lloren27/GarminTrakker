import express from "express";
import { updateConnectIqLocation } from "../controllers/connectIqController";

const router = express.Router();

router.post("/live-update", updateConnectIqLocation);

export default router;
