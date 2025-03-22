import { Request, Response } from "express";
import User, { IUser } from "../models/User";
import { userCache } from "../server";
import { updateUserAndCache, sendUserResponse } from "../utils/userUtils";

// Список доступных задач (можно вынести в отдельный конфиг)
const availableTasks: { [key: string]: number } = {
    "join_telegram": 1000,
    "follow_twitter": 1000,
    "vote_coinmarketcap": 1200,
    "join_reddit": 1000,
    "share_tiktok": 1000,
};

export const completeTask = async (req: Request, res: Response) => {
    const { telegramId, taskName } = req.body;

    if (!telegramId) return res.status(400).json({ error: "telegramId is required" });
    if (!taskName) return res.status(400).json({ error: "taskName is required" });
    if (!availableTasks[taskName]) return res.status(400).json({ error: "Invalid task name" });

    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "User not found" });

        // Проверка, завершена ли задача
        if (user.tasksCompleted.includes(taskName)) {
            return res.status(400).json({ error: "Task already completed" });
        }

        // Восстановление энергии
        const now = new Date();
        const timeDiff = Math.floor((now.getTime() - user.lastEnergyUpdate.getTime()) / 1000);
        user.energy = Math.min(user.maxEnergy, user.energy + timeDiff * user.energyRegenRate);
        user.lastEnergyUpdate = now;

        // Начисление награды и отметка задачи
        const reward = availableTasks[taskName];
        user.stones += reward;
        user.tasksCompleted.push(taskName);

        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[completeTask] Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};