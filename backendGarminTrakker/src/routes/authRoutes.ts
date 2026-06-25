import express from "express";
import {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  requestPasswordReset,
  resetPassword,
  deleteMyAccount,
  changePassword,
} from "../controllers/authController";
import authenticateToken from "../config/authMiddleware";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh-token", refreshToken);
router.post("/logout", logoutUser);
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.post("/change-password", authenticateToken, changePassword);
router.delete("/delete-account", authenticateToken, deleteMyAccount);

export default router;
