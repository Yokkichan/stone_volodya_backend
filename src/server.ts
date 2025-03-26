import express from "express";
import mongoose from "mongoose";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/user";
import gameRoutes from "./routes/game";
import leaderboardRoutes from "./routes/leaderboard";
import airdropRoutes from "./routes/airdrop";
import referralRoutes from "./routes/referral";
import earnRoutes from "./routes/earn";
import User, { IInvitedFriend } from "./models/User"; // Добавляем импорт User и IInvitedFriend
import "./bot";
import { getLeagueByStones, updateUserAndCache, sendUserResponse } from "./utils/userUtils";

dotenv.config();

const app = express();
const server = createServer(app);
export const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
});

export const userCache = new Map<string, { stones: number; autoStonesPerSecond: number; lastAutoBotUpdate: Date; league: string }>();
const activeConnections = new Map<string, string>();
const leaderboardCache = new Map<string, any[]>();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/airdrop", airdropRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/earn", earnRoutes);

app.get("/", (req, res) => {
    res.send("Server is running!");
});

io.on("connection", (socket) => {
    let hasJoined = false;

    socket.on("join", async (telegramId: string) => {
        if (!telegramId || hasJoined) return;
        hasJoined = true;

        const existingSocketId = activeConnections.get(telegramId);
        if (existingSocketId && existingSocketId !== socket.id) {
            io.sockets.sockets.get(existingSocketId)?.disconnect(true);
        }

        activeConnections.set(telegramId, socket.id);
        socket.join(telegramId);

        const user = await User.findOne({ telegramId }); // Используем импортированный User
        if (user) {
            console.log(`User logged in: ${user.username}`);
            await updateUserAndCache(user, userCache);
            io.to(telegramId).emit("userUpdate", sendUserResponse(user));
        }
    });

    socket.on("getLeaderboard", async ({ league }) => {
        if (leaderboardCache.has(league)) {
            socket.emit("leaderboard", leaderboardCache.get(league));
        } else {
            const players = await User.find({ league }).sort({ stones: -1 }).limit(100).select("telegramId username stones"); // Используем User
            leaderboardCache.set(league, players);
            socket.emit("leaderboard", players);
        }
    });

    socket.on("disconnect", async () => {
        for (const [telegramId, socketId] of activeConnections.entries()) {
            if (socketId === socket.id) {
                const user = await User.findOne({ telegramId }); // Используем User
                if (user) {
                    const cachedUser = userCache.get(telegramId);
                    if (cachedUser) {
                        user.stones = cachedUser.stones;
                        user.league = cachedUser.league;
                        user.lastAutoBotUpdate = cachedUser.lastAutoBotUpdate;
                    }
                    user.lastOnline = new Date();
                    await user.save();
                }
                activeConnections.delete(telegramId);
                userCache.delete(telegramId);
                break;
            }
        }
    });
});

// Обновление лидерборда каждые 5 минут
setInterval(async () => {
    const leagues = ["Pebble", "Gravel", "Cobblestone", "Boulder", "Quartz", "Granite", "Obsidian", "Marble", "Bedrock"];
    for (const league of leagues) {
        const players = await User.find({ league }).sort({ stones: -1 }).limit(100).select("telegramId username stones"); // Используем User
        leaderboardCache.set(league, players);
    }
    console.log("[Leaderboard Update] Cached leaderboards refreshed.");
}, 5 * 60 * 1000);

// Фоновая обработка всех пользователей (раз в 30 минут) с батчами
const updateAllUsers = async () => {
    const now = new Date();
    console.log("[Background Update] Starting user update...");

    const batchSize = 100;
    const users = await User.find({}); // Используем User
    for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await Promise.all(batch.map(async (user) => {
            const timeDiff = Math.floor((now.getTime() - user.lastAutoBotUpdate.getTime()) / 1000);
            if (user.autoStonesPerSecond > 0 && timeDiff > 0) {
                const boostMultiplier = user.boostActiveUntil && now < user.boostActiveUntil ? 2 : 1;
                const newStones = Math.floor(user.autoStonesPerSecond * timeDiff * boostMultiplier);
                user.stones += newStones;
                user.lastAutoBotUpdate = now;

                if (user.referredBy) {
                    const referrer = await User.findOne({ referralCode: user.referredBy }); // Используем User
                    if (referrer) {
                        const bonus = Math.floor(newStones * 0.05);
                        referrer.stones += bonus;
                        referrer.referralBonus = (referrer.referralBonus || 0) + bonus;

                        const invitedFriend = referrer.invitedFriends.find((f: IInvitedFriend) => f.user.toString() === user._id.toString());
                        if (!invitedFriend) {
                            referrer.invitedFriends.push({ user: user._id, lastReferralStones: bonus });
                        } else {
                            invitedFriend.lastReferralStones += bonus;
                        }
                        await referrer.save();
                        io.to(referrer.telegramId).emit("userUpdate", sendUserResponse(referrer));
                    }
                }
            }
            user.league = getLeagueByStones(user.stones);
            await user.save();
        }));
    }
    console.log("[Background Update] All users updated.");
};

// Запуск фонового обновления каждые 30 минут
setInterval(updateAllUsers, 30 * 60 * 1000);

// Лог онлайна каждые 30 минут
setInterval(() => {
    const onlineCount = activeConnections.size;
    console.log(`Online users: ${onlineCount}`);
}, 30 * 60 * 1000);

const start = async () => {
    try {
        console.log("Attempting to connect to MongoDB:", process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI!);
        console.log("Connected to MongoDB");
        server.listen(process.env.PORT || 3000, () => {
            console.log(`Server running on port ${process.env.PORT || 3000}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
    }
};

start();