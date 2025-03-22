import { Router } from "express";
import { claimAirdrop, addAirdropProgress } from "../controllers/airdropController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.post("/claim", authMiddleware, claimAirdrop);
router.post("/add-progress", authMiddleware, addAirdropProgress);

export default router;