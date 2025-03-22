import { Request, Response } from "express";
import { Document } from "mongoose";
import User, { IUser, IBoost } from "../models/User";
import { io, userCache } from "../server";
import { updateUserAndCache, sendUserResponse } from "../utils/userUtils";

type UserDocument = IUser & Document;

// Обновление баланса пользователя
export const updateBalance = async (req: Request, res: Response) => {
    const { telegramId, stones } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        // Инициализация данных из кэша или базы
        const cachedUser = userCache.get(telegramId) || {
            stones: user.stones,
            autoStonesPerSecond: user.autoStonesPerSecond,
            lastAutoBotUpdate: user.lastAutoBotUpdate,
            league: user.league,
        };
        const now = new Date();

        // Начисление камней от автобота
        const timeDiff = Math.floor((now.getTime() - cachedUser.lastAutoBotUpdate.getTime()) / 1000);
        if (cachedUser.autoStonesPerSecond > 0 && timeDiff > 0) {
            cachedUser.stones += Math.floor(cachedUser.autoStonesPerSecond * timeDiff);
            cachedUser.lastAutoBotUpdate = now;
        }

        // Восстановление энергии
        const energyTimeDiff = Math.floor((now.getTime() - user.lastEnergyUpdate.getTime()) / 1000);
        user.energy = Math.min(user.maxEnergy, user.energy + energyTimeDiff * user.energyRegenRate);
        user.lastEnergyUpdate = now;

        // Добавление камней из запроса, если переданы
        if (typeof stones === "number") {
            cachedUser.stones += stones;
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

export interface Boost {
    name: string;
    level: number;
    count?: number;
}

export type BoostName = "RechargeSpeed" | "BatteryPack" | "MultiTap" | "AutoBot" | "Turbo";

// Расчёт стоимости буста
export const getBoostCost = (boostName: BoostName, level: number): number => {
    const levelCosts = [10, 100, 150, 250, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 250000, 500000, 1000000];
    const multipliers: { [key in BoostName]?: number } = {
        RechargeSpeed: 1,
        BatteryPack: 1.2,
        MultiTap: 1.5,
        AutoBot: 2
    };
    return Math.floor(levelCosts[Math.min(level, levelCosts.length - 1)] * (multipliers[boostName] || 1));
};

// Получение бонуса от буста
export const getBoostBonus = (boostName: BoostName, level: number, multiTapLevel: number = 0): string => {
    const nextLevel = level + 1;
    switch (boostName) {
        case "Turbo": return `+${Math.floor(500 * (1 + multiTapLevel * 0.5)).toLocaleString()} stones`;
        case "RechargeSpeed": return `+${nextLevel === 1 ? 2 : Math.floor(2 * Math.pow(1.1, nextLevel - 1))} energy/sec`;
        case "MultiTap": return `+${nextLevel === 1 ? 2 : Math.floor(2 * Math.pow(1.1, nextLevel - 1))} stones/click`;
        case "AutoBot": return `+${nextLevel === 1 ? 10 : Math.floor(10 * Math.pow(1.1, nextLevel - 1))} stones/sec`;
        case "BatteryPack": return `+${nextLevel === 1 ? 1500 : Math.floor(1500 * Math.pow(1.1, nextLevel - 1))} max energy`;
        default: return "";
    }
};

// Применение буста
export const applyBoost = async (req: Request, res: Response) => {
    const { telegramId, boostName } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });
    if (!boostName) return res.status(400).json({ error: "boostName is required" });

    try {
        const user = (await User.findOne({ telegramId })) as UserDocument | null;
        if (!user) return res.status(404).json({ error: "User not found" });

        const now = new Date();
        const timeDiff = Math.floor((now.getTime() - user.lastEnergyUpdate.getTime()) / 1000);
        user.energy = Math.min(user.maxEnergy, user.energy + timeDiff * user.energyRegenRate);
        user.lastEnergyUpdate = now;

        // Поиск или создание буста
        let boost = user.boosts.find((b) => b.name === boostName);
        if (!boost) {
            const newBoost: IBoost = { name: boostName, level: 0, count: boostName === "Turbo" ? 3 : 0 };
            user.boosts.push(newBoost);
            boost = user.boosts[user.boosts.length - 1];
        }

        // Расчёт стоимости буста
        const multipliers: { [key: string]: number } = {
            RechargeSpeed: 1.3,
            BatteryPack: 1.4,
            MultiTap: 1.5,
            AutoBot: 1.6,
        };
        const baseCosts: { [key: string]: number } = {
            RechargeSpeed: 100,
            BatteryPack: 200,
            MultiTap: 150,
            AutoBot: 500,
            Turbo: 500,
        };
        const level = boost.level;
        let cost = boostName === "Turbo" ? 500 : Math.floor(baseCosts[boostName] * Math.pow(multipliers[boostName] || 1, level));

        if (boostName === "RechargeSpeed" && level < 5) cost = Math.floor(cost * 0.7);
        if (boostName === "MultiTap" && level >= 10) return res.status(400).json({ error: "MultiTap max level reached, upgrade to AutoBot" });
        if (boostName === "Turbo" && (boost.count ?? 0) > 0) cost = 0;

        // Проверка наличия камней
        if (boostName === "Turbo" && (boost.count ?? 0) <= 0 && user.stones < cost) {
            return res.status(400).json({ error: `Not enough stones, required: ${cost}` });
        } else if (boostName !== "Turbo" && user.stones < cost) {
            return res.status(400).json({ error: `Not enough stones, required: ${cost}` });
        }

        // Применение буста
        if (boostName === "Turbo") {
            if ((boost.count ?? 0) > 0) boost.count = (boost.count ?? 0) - 1;
            else user.stones -= cost;

            const multiTapLevel = user.boosts.find((b) => b.name === "MultiTap")?.level || 0;
            let turboBonus = Math.floor(500 * (1 + 0.5 * multiTapLevel));
            if (multiTapLevel >= 3) turboBonus *= 2;
            user.stones += turboBonus;
        } else {
            user.stones -= cost;
            boost.level += 1;
        }

        // Пересчёт характеристик пользователя
        user.energyRegenRate = 1;
        user.stonesPerClick = 1;
        user.maxEnergy = 1000;
        user.autoStonesPerSecond = 0;

        user.boosts.forEach((b) => {
            const rechargeSpeedLevel = user.boosts.find((b) => b.name === "RechargeSpeed")?.level || 0;
            const multiTapLevel = user.boosts.find((b) => b.name === "MultiTap")?.level || 0;
            const batteryPackLevel = user.boosts.find((b) => b.name === "BatteryPack")?.level || 0;

            if (b.name === "RechargeSpeed") {
                user.energyRegenRate = Math.floor(1 + 0.1 * b.level);
                if (batteryPackLevel >= 3) user.energyRegenRate += 1;
            }
            if (b.name === "MultiTap") user.stonesPerClick = Math.floor(1 + 0.2 * b.level);
            if (b.name === "BatteryPack") user.maxEnergy = Math.floor(1000 * Math.pow(1.1, b.level));
            if (b.name === "AutoBot") {
                user.autoStonesPerSecond = Math.floor(10 * Math.pow(1.15, b.level));
                if (rechargeSpeedLevel >= 5) user.autoStonesPerSecond = Math.floor(user.autoStonesPerSecond * 1.2);
            }
        });

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