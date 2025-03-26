import { Request, Response } from "express";
import { Document } from "mongoose";
import User, { IUser, IBoost } from "../models/User";
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

// Обновление баланса пользователя
export const updateBalance = async (req: Request, res: Response) => {
    const { telegramId, stones, energy } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        const cachedUser = userCache.get(telegramId) || {
            stones: user.stones,
            autoStonesPerSecond: user.autoStonesPerSecond,
            lastAutoBotUpdate: user.lastAutoBotUpdate,
            league: user.league,
        };
        const now = new Date();

        // Проверка действия Boost
        let boostMultiplier = 1;
        if (user.boostActiveUntil && now < user.boostActiveUntil) {
            boostMultiplier = 2; // Удвоение тапов и автотапов
        }

        // Автобот: начисление камней
        const timeDiff = Math.floor((now.getTime() - user.lastAutoBotUpdate.getTime()) / 1000);
        if (user.autoStonesPerSecond > 0 && timeDiff > 0) {
            const stonesEarned = Math.min(Math.floor(user.autoStonesPerSecond * timeDiff * boostMultiplier), 25000 - (user.stones - cachedUser.stones));
            cachedUser.stones += stonesEarned;

            if (user.referredBy) {
                const referrer = await User.findOne({ referralCode: user.referredBy });
                if (referrer) {
                    const bonus = Math.floor(stonesEarned * 0.05);
                    referrer.stones += bonus;
                    referrer.referralBonus = (referrer.referralBonus || 0) + bonus;
                    await referrer.save();
                    updateUserAndCache(referrer, userCache);
                }
            }
            user.lastAutoBotUpdate = now;
        }

        // Восстановление энергии
        const energyTimeDiff = Math.floor((now.getTime() - user.lastEnergyUpdate.getTime()) / 1000);
        user.energy = Math.min(user.maxEnergy, user.energy + energyTimeDiff * user.energyRegenRate);
        user.lastEnergyUpdate = now;

        // Ручное обновление камней и энергии
        if (typeof stones === "number" && stones > 0) {
            const stonesEarned = stones * boostMultiplier;
            cachedUser.stones += stonesEarned;

            if (user.referredBy) {
                const referrer = await User.findOne({ referralCode: user.referredBy });
                if (referrer) {
                    const bonus = Math.floor(stonesEarned * 0.05);
                    referrer.stones += bonus;
                    referrer.referralBonus = (referrer.referralBonus || 0) + bonus;
                    await referrer.save();
                    updateUserAndCache(referrer, userCache);
                }
            }
            user.energy = Math.max(0, user.energy - user.stonesPerClick);
        }
        if (typeof energy === "number") {
            user.energy = Math.max(0, energy);
        }

        user.stones = cachedUser.stones;
        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};

// Применение платного буста
export const applyBoost = async (req: Request, res: Response) => {
    const { telegramId, boostName } = req.body;
    if (!telegramId || !boostName) return res.status(400).json({ error: "telegramId and boostName required" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        const now = new Date();
        let boost = user.boosts.find(b => b.name === boostName);
        if (!boost) {
            boost = { name: boostName, level: 0 };
            user.boosts.push(boost);
        }

        const cost = getBoostCost(boostName, boost.level);
        if (cost > 0 && user.stones < cost) return res.status(400).json({ error: `Not enough stones, required: ${cost}` });

        if (boostName === "MultiTap" && boost.level >= 10) return res.status(400).json({ error: "MultiTap max level reached" });
        if (boostName === "AutoBot" && boost.level >= 10) return res.status(400).json({ error: "AutoBot max level reached" });
        if (boostName === "BatteryPack" && boost.level >= 10) return res.status(400).json({ error: "BatteryPack max level reached" });
        if (boostName === "RechargeSpeed" && boost.level >= 10) return res.status(400).json({ error: "RechargeSpeed max level reached" });

        if (cost > 0) user.stones -= cost;
        boost.level += 1;

        // Пересчёт характеристик
        user.energyRegenRate = 1;
        user.stonesPerClick = 1;
        user.maxEnergy = 1000;
        user.autoStonesPerSecond = 0;

        user.boosts.forEach(b => {
            if (b.name === "RechargeSpeed") user.energyRegenRate = 1 + b.level;
            if (b.name === "MultiTap") user.stonesPerClick = 2 + 2 * b.level;
            if (b.name === "BatteryPack") user.maxEnergy = 1000 + 500 * b.level;
            if (b.name === "AutoBot") user.autoStonesPerSecond = 1 + b.level;
        });

        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};

// Использование Refill
export const useRefill = async (req: Request, res: Response) => {
    const { telegramId } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId required" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        const now = new Date();
        if (user.refillLastUsed && (now.getTime() - user.refillLastUsed.getTime()) < 24 * 60 * 60 * 1000) {
            return res.status(400).json({ error: "Refill available once per day" });
        }

        user.energy = user.maxEnergy;
        user.refillLastUsed = now;

        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};

// Использование Boost
export const useBoost = async (req: Request, res: Response) => {
    const { telegramId } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId required" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        const now = new Date();
        if (user.boostLastUsed && (now.getTime() - user.boostLastUsed.getTime()) < 24 * 60 * 60 * 1000) {
            return res.status(400).json({ error: "Boost available once per day" });
        }

        user.boostLastUsed = now;
        user.boostActiveUntil = new Date(now.getTime() + 60 * 1000); // 1 минута

        await updateUserAndCache(user, userCache);
        const response = sendUserResponse(user);
        res.json(response);
        io.to(telegramId).emit("userUpdate", response);
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};


// Покупка скина
export const buySkin = async (req: Request, res: Response) => {
    const { telegramId, skinName } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });
    if (!skinName) return res.status(400).json({ error: "skinName is required" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        // Обновление энергии
        const now = new Date();
        const timeDiff = Math.floor((now.getTime() - user.lastEnergyUpdate.getTime()) / 1000);
        user.energy = Math.min(user.maxEnergy, user.energy + timeDiff * user.energyRegenRate);
        user.lastEnergyUpdate = now;

        // Проверка владения скином и стоимости
        if (user.skins.includes(skinName)) return res.status(400).json({ error: "Skin already owned" });
        const cost = 1000;
        if (user.stones < cost) return res.status(400).json({ error: "Not enough stones" });

        // Применение покупки
        user.stones -= cost;
        user.skins.push(skinName);

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};

// Выполнение задания
export const completeTask = async (req: Request, res: Response) => {
    const { telegramId, taskName, reward } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });
    if (!taskName) return res.status(400).json({ error: "taskName is required" });
    if (typeof reward !== "number" || reward <= 0) return res.status(400).json({ error: "Invalid reward value" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        // Обновление энергии
        const now = new Date();
        const timeDiff = Math.floor((now.getTime() - user.lastEnergyUpdate.getTime()) / 1000);
        user.energy = Math.min(user.maxEnergy, user.energy + timeDiff * user.energyRegenRate);
        user.lastEnergyUpdate = now;

        // Проверка и выполнение задания
        if (user.tasksCompleted.includes(taskName)) return res.status(400).json({ error: "Task already completed" });
        user.tasksCompleted.push(taskName);
        user.stones += reward;

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
};