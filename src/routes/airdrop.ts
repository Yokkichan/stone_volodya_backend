import { Router } from "express";
import { claimAirdrop } from "../controllers/airdropController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.post("/claim", authMiddleware, claimAirdrop);

export default router;