// src/controllers/gameController.ts
import { Request, Response } from "express";
import { Document } from "mongoose";
import User, { IUser, IBoost } from "../models/User";
import { userCache } from "../server";
import { updateUserAndCache, sendUserResponse } from "../utils/userUtils";

type UserDocument = IUser & Document;

export const updateBalance = async (req: Request, res: Response) => {
    const { telegramId, stones, useEnergy = true } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });
    if (typeof stones !== "number" || stones <= 0) return res.status(400).json({ error: "Invalid stones value" });

    try {
        let user = (await User.findOne({ telegramId })) || new User({ telegramId, username: "Player_" + telegramId, stones: 0, energy: 1000, referralCode: "code_" + telegramId });
        user.stones += stones;
        if (useEnergy) user.energy = (user.energy || 1000) - 1;

        if (user.referredBy) {
            const referrer = (await User.findOne({ telegramId: user.referredBy })) as UserDocument | null;
            if (referrer) {
                const friendEntry = referrer.invitedFriends.find((f) => f.user.toString() === user._id.toString());
                if (friendEntry) {
                    const newStones = user.stones - (friendEntry.lastReferralStones || 0);
                    if (newStones > 0) {
                        const bonus = Math.floor(newStones * (user.isPremium ? 0.1 : 0.05));
                        referrer.stones += bonus;
                        referrer.referralBonus = (referrer.referralBonus || 0) + bonus;
                        friendEntry.lastReferralStones = user.stones;
                        await updateUserAndCache(referrer, userCache);
                    }
                }
            }
        }

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[updateBalance] Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const applyBoost = async (req: Request, res: Response) => {
    const { telegramId, boostName } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });
    if (!boostName) return res.status(400).json({ error: "boostName is required" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        let boost = user.boosts.find((b) => b.name === boostName);
        if (!boost) {
            const newBoost: IBoost = { name: boostName, level: 0, count: boostName === "Turbo" || boostName === "Refills" ? 3 : 0 };
            user.boosts.push(newBoost);
            boost = user.boosts[user.boosts.length - 1]; // Получаем добавленный буст
        }

        if (boost.name === "Turbo" || boost.name === "Refills") {
            if ((boost.count ?? 0) <= 0) return res.status(400).json({ error: "No boost uses left" });
            boost.count = (boost.count ?? 0) - 1;
            if (boost.name === "Turbo") {
                const multiTapLevel = user.boosts.find((b) => b.name === "MultiTap")?.level || 0;
                user.stones += Math.floor(500 * (1 + multiTapLevel * 0.5));
            } else {
                user.energy = user.maxEnergy || 1000;
            }
        } else {
            const levelCosts = [10, 100, 150, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 250000, 500000, 1000000];
            const difficulty: { [key: string]: number } = { RechargeSpeed: 1, BatteryPack: 1.2, MultiTap: 1.5, AutoBot: 2 };
            const cost = Math.floor(levelCosts[Math.min(boost.level, levelCosts.length - 1)] * (difficulty[boost.name] || 1));
            if (user.stones < cost) return res.status(400).json({ error: `Not enough stones, required: ${cost}` });
            user.stones -= cost;
            boost.level += 1;
        }

        user.energyRegenRate = 1;
        user.stonesPerClick = 1;
        user.maxEnergy = 1000;
        user.autoStonesPerSecond = 0;
        user.boosts.forEach((b) => {
            const baseValues = { RechargeSpeed: [1, 2], MultiTap: [1, 2], BatteryPack: [1000, 1500], AutoBot: [0, 10] };
            const value =
                b.level === 0
                    ? baseValues[b.name as keyof typeof baseValues]?.[0]
                    : b.level === 1
                        ? baseValues[b.name as keyof typeof baseValues]?.[1]
                        : Math.floor((baseValues[b.name as keyof typeof baseValues]?.[1] || 0) * Math.pow(1.1, b.level - 1));
            if (b.name === "RechargeSpeed") user.energyRegenRate = value ?? 1;
            if (b.name === "MultiTap") user.stonesPerClick = value ?? 1;
            if (b.name === "BatteryPack") user.maxEnergy = value ?? 1000;
            if (b.name === "AutoBot") user.autoStonesPerSecond = value ?? 0;
        });

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[applyBoost] Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const buySkin = async (req: Request, res: Response) => {
    const { telegramId, skinName } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });
    if (!skinName) return res.status(400).json({ error: "skinName is required" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.skins.includes(skinName)) return res.status(400).json({ error: "Skin already owned" });

        const cost = 1000;
        if (user.stones < cost) return res.status(400).json({ error: "Not enough stones" });

        user.stones -= cost;
        user.skins.push(skinName);

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[buySkin] Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const completeTask = async (req: Request, res: Response) => {
    const { telegramId, taskName, reward } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });
    if (!taskName) return res.status(400).json({ error: "taskName is required" });
    if (typeof reward !== "number" || reward <= 0) return res.status(400).json({ error: "Invalid reward value" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });
        if (user.tasksCompleted.includes(taskName)) return res.status(400).json({ error: "Task already completed" });

        user.tasksCompleted.push(taskName);
        user.stones += reward;

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[completeTask] Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};