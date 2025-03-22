// src/routes/auth.ts
import { Router, Request, Response } from "express";
import User from "../models/User";
import { generateReferralCode } from "../utils/referralCode";
import { generateToken } from "../utils/jwt";
import { updateUserAndCache } from "../utils/userUtils";
import { userCache } from "../server";

const router = Router();

const parseInitData = (initData: string) => {
    const params = new URLSearchParams(initData);
    const userStr = params.get("user");
    if (!userStr) throw new Error("User data not found in initData");
    return JSON.parse(decodeURIComponent(userStr));
};

router.post("/login", async (req: Request, res: Response) => {
    const { initData, referralCode: bodyReferralCode } = req.body;
    if (!initData) return res.status(400).json({ error: "initData is required" });

    let telegramUser;
    try {
        telegramUser = parseInitData(initData);
    } catch (error) {
        console.error("[authRoutes] Failed to parse initData:", error);
        return res.status(400).json({ error: "Invalid initData" });
    }

    const telegramId = telegramUser.id.toString();
    let user = await User.findOne({ telegramId });
    let referralCode = bodyReferralCode || new URLSearchParams(initData).get("start_param");

    if (!user) {
        const newReferralCode = await generateReferralCode();
        user = new User({
            telegramId,
            username: telegramUser.username || telegramUser.first_name || `Miner_${Math.random().toString(36).substring(7)}`,
            photo_url: telegramUser.photo_url || "",
            referralCode: newReferralCode,
            referredBy: referralCode || undefined,
            isPremium: !!telegramUser.is_premium || telegramUser.allows_write_to_pm === true,
        });

        if (referralCode) {
            const referrer = await User.findOne({ referralCode });
            if (referrer) {
                const bonus = user.isPremium ? 10000 : 1000;
                referrer.invitedFriends.push({ user: user._id, lastReferralStones: 0 });
                referrer.stones += bonus;
                referrer.referralBonus = (referrer.referralBonus || 0) + bonus;
                user.stones += bonus;
                await updateUserAndCache(referrer, userCache); // Используем утилиту
            }
        }
        await updateUserAndCache(user, userCache); // Сохраняем нового пользователя
    }

    const token = generateToken(telegramId);
    res.status(200).json({ token, user });
});

export default router;