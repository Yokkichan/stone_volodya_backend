import { Request, Response } from "express";
import User from "../models/User";
import axios from "axios";

// Функція для завантаження фото з Telegram і конвертації в base64
const fetchTelegramPhoto = async (photoUrl: string): Promise<string> => {
    try {
        const botToken = "8199456151:AAEuzGhhlwopw8PcZVgY6foxx8iENtoou7Q"; // Ваш токен бота (зберігайте в .env)
        const filePath = photoUrl.split("/file/")[1]; // Отримуємо шлях файлу
        const telegramApiUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        const response = await axios.get(telegramApiUrl, { responseType: "arraybuffer" });
        const base64Image = Buffer.from(response.data, "binary").toString("base64");
        return `data:image/jpeg;base64,${base64Image}`; // Повертаємо зображення у форматі base64
    } catch (error) {
        console.error("[fetchTelegramPhoto] Error fetching photo:", error);
        return ""; // Повертаємо порожній рядок у разі помилки
    }
};

export const getLeaderboard = async (req: Request, res: Response) => {
    const { league } = req.query;

    try {
        const players = await User.find({ league })
            .sort({ stones: -1 })
            .limit(100)
            .select("telegramId username stones photo_url isPremium") // Додаємо photo_url і isPremium
            .lean(); // Використовуємо .lean() для швидшого виконання

        // Конвертуємо photo_url у base64 для кожного гравця
        const playersWithPhotos = await Promise.all(
            players.map(async (player) => {
                let photoBase64 = "";
                if (player.photo_url) {
                    photoBase64 = await fetchTelegramPhoto(player.photo_url);
                }
                return {
                    telegramId: player.telegramId,
                    username: player.username,
                    stones: player.stones,
                    photo_url: photoBase64 || player.photo_url, // Якщо base64 не вдалося отримати, повертаємо оригінальний URL
                    isPremium: player.isPremium || false,
                };
            })
        );

        res.json(playersWithPhotos);
    } catch (error) {
        console.error("[getLeaderboard] Error:", error);
        res.status(500).json({ message: "Error fetching leaderboard" });
    }
};