import { Request, Response } from "express";
import User from "../models/User";
import axios from "axios";
import logger from "../logger";

const fetchTelegramPhoto = async (photoUrl: string): Promise<string> => {
    try {
        if (!photoUrl || typeof photoUrl !== "string") {
            return "";
        }

        const botToken = process.env.TELEGRAM_BOT_TOKEN || "8199456151:AAEuzGhhlwopw8PcZVgY6foxx8iENtoou7Q";
        let filePath = "";

        if (photoUrl.includes(`/file/bot${botToken}/`)) {
            filePath = photoUrl.split(`/file/bot${botToken}/`)[1];
        } else if (photoUrl.includes("/file/")) {
            filePath = photoUrl.split("/file/")[1];
        } else {
            return photoUrl;
        }

        if (!filePath) {
            return "";
        }

        const telegramApiUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        const response = await axios.get(telegramApiUrl, { responseType: "arraybuffer" });
        const base64Image = Buffer.from(response.data, "binary").toString("base64");
        return `data:image/jpeg;base64,${base64Image}`;
    } catch (error) {
        return "";
    }
};

export const getLeaderboard = async (req: Request, res: Response) => {
    const { league } = req.query;

    try {
        const players = await User.find({ league })
            .sort({ stones: -1 })
            .limit(100)
            .select("telegramId username stones photo_url isPremium")
            .lean();

        logger.info(`Fetched ${players.length} players for league: ${league}`);

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
                    photo_url: photoBase64 || player.photo_url,
                    isPremium: player.isPremium || false,
                };
            })
        );

        res.json(playersWithPhotos);
    } catch (error) {
        logger.error(`Error in getLeaderboard: ${error instanceof Error ? error.message : String(error)}`);
        res.status(500).json({ message: "Error fetching leaderboard" });
    }
};