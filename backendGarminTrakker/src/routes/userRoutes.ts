import express from "express";
import authenticateToken from "../config/authMiddleware";
import {
  getUsers,
  getMe,
  updateUserLocation,
  updateRealTimeLocation,
} from "../controllers/userController";

const router = express.Router();

router.use(authenticateToken);

router.get("/", getUsers);
router.get("/me", getMe);
router.patch("/me/location", updateUserLocation);
router.patch("/me/real-time-location", updateRealTimeLocation);

export default router;
