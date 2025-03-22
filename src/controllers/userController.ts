// src/controllers/userController.ts
import { Request, Response } from "express";
import User from "../models/User";
import { sendUserResponse } from "../utils/userUtils";

interface AuthRequest extends Request {
    user?: { telegramId: string };
}

export const getProfile = async (req: AuthRequest, res: Response) => {
    const user = await User.findOne({ telegramId: req.user!.telegramId });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(sendUserResponse(user)); // Используем стандартный ответ
};

export const connectTonWallet = async (req: AuthRequest, res: Response) => {
    const { tonWallet } = req.body;
    const user = await User.findOne({ telegramId: req.user!.telegramId });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.tonWallet = tonWallet;
    await user.save();
    res.json({ message: "TON wallet connected", ...sendUserResponse(user) }); // Добавляем полный ответ
};