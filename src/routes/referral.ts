// src/routes/referral.ts
import { Router, Request, Response } from "express";
import { getReferralFriends } from "../controllers/referralController";
import { authMiddleware } from "../middleware/authMiddleware";

const router = Router();

router.get("/friends", authMiddleware, async (req: Request, res: Response) => {
    try {
        const telegramId = (req as any).user.telegramId; // Используем authMiddleware
        if (!telegramId) return res.status(400).json({ error: "telegramId is required" });

        const data = await getReferralFriends(telegramId);
        res.status(200).json(data);
    } catch (error) {
        console.error("[referralRoutes] Error fetching invited friends:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;