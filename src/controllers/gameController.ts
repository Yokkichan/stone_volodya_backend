import { Request, Response } from "express";
import { Document } from "mongoose";
import User, { IUser, IBoost, IInvitedFriend } from "../models/User";
import { io, userCache } from "../server";
import { updateUserAndCache, sendUserResponse } from "../utils/userUtils";

type UserDocument = IUser & Document;

export interface Boost {
    name: string;
    level: number;
    count?: number;
}

export type BoostName = "RechargeSpeed" | "BatteryPack" | "MultiTap" | "AutoBot" | "Refill" | "Boost";

// Расчёт стоимости буста
export const getBoostCost = (boostName: BoostName, level: number): number => {
    const costs: { [key in BoostName]?: number[] } = {
        MultiTap: [500, 700, 1000, 1400, 2000, 3400, 4700, 6500, 9000, 13000, 18000],
        AutoBot: [5000, 9000, 16000, 29000, 52000, 83000, 150000, 270000, 490000, 880000, 1300000],
        BatteryPack: [750, 1050, 1500, 2100, 3000, 7400, 10000, 14000, 20000, 28000, 38000],
        RechargeSpeed: [300, 400, 500, 700, 900, 2000, 2600, 3400, 4500, 6000, 13000],
        Refill: [0],
        Boost: [0],
    };
    return costs[boostName]?.[Math.min(level, costs[boostName].length - 1)] || 0;
};

// Получение бонуса от буста
export const getBoostBonus = (boostName: BoostName, level: number): string => {
    const nextLevel = level + 1;
    switch (boostName) {
        case "MultiTap": return `+${2 + 2 * nextLevel} stones/click`;
        case "AutoBot": return `+${1 + nextLevel} stones/sec (max 25,000/day)`;
        case "BatteryPack": return `+${1000 + 500 * nextLevel} max energy`;
        case "RechargeSpeed": return `+${1 + nextLevel} energy/sec`;
        case "Refill": return "Full energy refill";
        case "Boost": return "Double taps and auto-taps for 1 minute";
        default: return "";
    }
};

// Обновление энергии пользователя
const updateEnergy = (user: UserDocument, now: Date): void => {
    const timeDiff = Math.floor((now.getTime() - user.lastEnergyUpdate.getTime()) / 1000);
    user.energy = Math.min(user.maxEnergy, user.energy + timeDiff * user.energyRegenRate);
    user.lastEnergyUpdate = now;
};

// Обработка реферального бонуса
const handleReferralBonus = async (user: UserDocument, stonesEarned: number): Promise<void> => {
    if (!user.referredBy) return;

    const referrer = await User.findOne({ referralCode: user.referredBy }) as UserDocument | null;
    if (!referrer) return;

    const bonus = Math.floor(stonesEarned * 0.05);
    referrer.stones += bonus;
    referrer.referralBonus = (referrer.referralBonus || 0) + bonus;

    const invitedFriend = referrer.invitedFriends.find(
        (f: IInvitedFriend) => f.user.toString() === user._id.toString()
    );
    if (!invitedFriend) {
        referrer.invitedFriends.push({ user: user._id, lastReferralStones: bonus });
    } else {
        invitedFriend.lastReferralStones += bonus;
    }

    await updateUserAndCache(referrer, userCache);
    io.to(referrer.telegramId).emit("userUpdate", sendUserResponse(referrer));
};

// Обновление баланса пользователя
export const updateBalance = async (req: Request, res: Response) => {
    const { telegramId, stones, energy, isAutobot = false } = req.body;

    if (!telegramId || typeof telegramId !== "string") {
        return res.status(400).json({ error: "Valid telegramId is required" });
    }

    try {
        const user = await User.findOne({ telegramId }) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        const cachedUser = userCache.get(telegramId) || {
            stones: user.stones,
            autoStonesPerSecond: user.autoStonesPerSecond,
            lastAutoBotUpdate: user.lastAutoBotUpdate,
            league: user.league,
        };
        const now = new Date();

        const boostMultiplier = user.boostActiveUntil && now < user.boostActiveUntil ? 2 : 1;

        // Проверка на частоту кликов (макс 5 кликов/сек)
        if (!isAutobot && user.lastClickTime) {
            const timeSinceLastClick = (now.getTime() - user.lastClickTime.getTime()) / 1000;
            if (timeSinceLastClick < 0.2) {
                return res.status(400).json({ error: "Clicking too fast!" });
            }
        }
        user.lastClickTime = now;

        // Обновление энергии
        updateEnergy(user, now);

        // Пассивная добыча от AutoBot
        if (user.autoStonesPerSecond > 0) {
            const timeDiff = Math.floor((now.getTime() - user.lastAutoBotUpdate.getTime()) / 1000);
            if (timeDiff > 0) {
                const stonesEarned = Math.floor(user.autoStonesPerSecond * timeDiff * boostMultiplier);
                cachedUser.stones += stonesEarned;
                await handleReferralBonus(user, stonesEarned);
                user.lastAutoBotUpdate = now;
            }
        }

        // Обработка кликов
        if (typeof stones === "number" && stones > 0) {
            const stonesEarned = stones * boostMultiplier;
            if (isAutobot) {
                cachedUser.stones += stonesEarned;
            } else {
                const energyCostPerClick = Math.ceil(Math.pow(user.stonesPerClick, 1.2) / 10);
                if (user.energy < energyCostPerClick) {
                    return res.status(400).json({ error: `Not enough energy, required: ${energyCostPerClick}` });
                }
                cachedUser.stones += stonesEarned;
                user.energy -= energyCostPerClick;
                await handleReferralBonus(user, stonesEarned);
            }
        }

        // Обновление энергии, если передано
        if (typeof energy === "number") {
            user.energy = Math.max(0, Math.min(energy, user.maxEnergy));
        }

        user.stones = cachedUser.stones;
        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        console.error("[updateBalance] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Применение платного буста
export const applyBoost = async (req: Request, res: Response) => {
    const { telegramId, boostName } = req.body;

    if (!telegramId || !boostName || !Object.values(["RechargeSpeed", "BatteryPack", "MultiTap", "AutoBot"]).includes(boostName)) {
        return res.status(400).json({ error: "Valid telegramId and boostName required" });
    }

    try {
        const user = await User.findOne({ telegramId }) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        let boost = user.boosts.find(b => b.name === boostName);
        if (!boost) {
            boost = { name: boostName as BoostName, level: 0 };
            user.boosts.push(boost);
        }

        const cost = getBoostCost(boostName as BoostName, boost.level);
        if (cost > 0 && user.stones < cost) {
            return res.status(400).json({ error: `Not enough stones, required: ${cost}` });
        }

        const maxLevel = 10;
        if (boost.level >= maxLevel) {
            return res.status(400).json({ error: `${boostName} max level (${maxLevel}) reached` });
        }

        if (cost > 0) user.stones -= cost;
        boost.level += 1;

        // Пересчет характеристик
        user.energyRegenRate = 1 + (user.boosts.find(b => b.name === "RechargeSpeed")?.level || 0);
        user.stonesPerClick = 2 + 2 * (user.boosts.find(b => b.name === "MultiTap")?.level || 0);
        user.maxEnergy = 1000 + 500 * (user.boosts.find(b => b.name === "BatteryPack")?.level || 0);
        user.autoStonesPerSecond = 1 + (user.boosts.find(b => b.name === "AutoBot")?.level || 0);

        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        console.error("[applyBoost] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Использование Refill
export const useRefill = async (req: Request, res: Response) => {
    const { telegramId } = req.body;

    if (!telegramId) return res.status(400).json({ error: "telegramId required" });

    try {
        const user = await User.findOne({ telegramId }) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        const now = new Date();
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (user.refillLastUsed && (now.getTime() - user.refillLastUsed.getTime()) < oneDayMs) {
            return res.status(400).json({ error: "Refill available once per day" });
        }

        user.energy = user.maxEnergy;
        user.refillLastUsed = now;

        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        console.error("[useRefill] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Использование Boost
export const useBoost = async (req: Request, res: Response) => {
    const { telegramId } = req.body;

    if (!telegramId) return res.status(400).json({ error: "telegramId required" });

    try {
        const user = await User.findOne({ telegramId }) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        const now = new Date();
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (user.boostLastUsed && (now.getTime() - user.boostLastUsed.getTime()) < oneDayMs) {
            return res.status(400).json({ error: "Boost available once per day" });
        }

        user.boostLastUsed = now;
        user.boostActiveUntil = new Date(now.getTime() + 60 * 1000); // 1 минута

        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        console.error("[useBoost] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Покупка скина
export const buySkin = async (req: Request, res: Response) => {
    const { telegramId, skinName } = req.body;

    if (!telegramId || !skinName) {
        return res.status(400).json({ error: "telegramId and skinName are required" });
    }

    try {
        const user = await User.findOne({ telegramId }) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        updateEnergy(user, new Date());

        if (user.skins.includes(skinName)) {
            return res.status(400).json({ error: "Skin already owned" });
        }

        const cost = 1000;
        if (user.stones < cost) {
            return res.status(400).json({ error: `Not enough stones, required: ${cost}` });
        }

        user.stones -= cost;
        user.skins.push(skinName);

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[buySkin] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Выполнение задания
export const completeTask = async (req: Request, res: Response) => {
    const { telegramId, taskName, reward } = req.body;

    if (!telegramId || !taskName || typeof reward !== "number" || reward <= 0) {
        return res.status(400).json({ error: "telegramId, taskName, and valid reward are required" });
    }

    try {
        const user = await User.findOne({ telegramId }) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        updateEnergy(user, new Date());

        if (user.tasksCompleted.includes(taskName)) {
            return res.status(400).json({ error: "Task already completed" });
        }

        user.tasksCompleted.push(taskName);
        user.stones += reward;

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[completeTask] Error:", error instanceof Error ? error.message : error);
        res.status(500).json({ error: "Internal server error" });
    }
};