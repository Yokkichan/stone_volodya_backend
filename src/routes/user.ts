import { Router } from "express";
import { getProfile, connectTonWallet } from "../controllers/userController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get("/profile", authMiddleware, getProfile);
router.post("/connect-ton-wallet", authMiddleware, connectTonWallet);

export default router;