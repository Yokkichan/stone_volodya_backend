import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { verifyTelegramInitData } from "../utils/telegramAuth";

export const login = async (req: Request, res: Response) => {
    const { initData } = req.body;
    // Добавляем await для получения результата Promise
    const result = await verifyTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN!);
    if (!result) return res.status(401).json({ message: "Invalid Telegram data" });

    // Теперь result имеет тип VerificationResult | null, и мы можем безопасно получить user
    const { user } = result;
    const telegramId = user.id.toString();
    const username = user.username || user.first_name;

    let dbUser = await User.findOne({ telegramId });
    if (!dbUser) {
        dbUser = new User({
            telegramId,
            username,
            stones: 100, // Начальные камни
            boosts: [
                { name: "Turbo", count: 3 },
                { name: "Refills", count: 3 },
            ],
        });
        await dbUser.save();
    }

    const token = jwt.sign({ telegramId }, process.env.JWT_SECRET!, { expiresIn: "30d" });
    res.json({ token, user: { telegramId, username, stones: dbUser.stones } });
};