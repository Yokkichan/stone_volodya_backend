// utils/jwt.ts
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_12345"; // Укажите секретный ключ в .env

export const generateToken = (telegramId: string): string => {
    return jwt.sign({ telegramId }, JWT_SECRET, { expiresIn: "30d" });
};