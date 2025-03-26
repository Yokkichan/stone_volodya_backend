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

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/airdrop", airdropRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/earn", earnRoutes);

// Тестовый маршрут для проверки
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

        const user = await mongoose.model("User").findOne({ telegramId });
        if (user) {
            console.log(`User logged in: ${user.username}`);
            const cachedUser = userCache.get(telegramId) || {
                stones: user.stones,
                autoStonesPerSecond: user.autoStonesPerSecond,
                lastAutoBotUpdate: user.lastAutoBotUpdate,
                league: user.league,
            };

            const now = new Date();
            const timeDiff = Math.floor((now.getTime() - cachedUser.lastAutoBotUpdate.getTime()) / 1000);
            if (cachedUser.autoStonesPerSecond > 0 && timeDiff > 0) {
                const boostMultiplier = user.boostActiveUntil && now < user.boostActiveUntil ? 2 : 1;
                const offlineStones = Math.floor(cachedUser.autoStonesPerSecond * timeDiff * boostMultiplier);
                cachedUser.stones += offlineStones;
                cachedUser.lastAutoBotUpdate = now;
                user.stones = cachedUser.stones;
                user.lastAutoBotUpdate = now;
                await user.save();
            }

            await updateUserAndCache(user, userCache);
            io.to(telegramId).emit("userUpdate", sendUserResponse(user));
        }
    });

    socket.on("getLeaderboard", async ({ league }) => {
        const players = await mongoose.model("User").find({ league }).sort({ stones: -1 }).limit(100).select("telegramId username stones");
        socket.emit("leaderboard", players);
    });

    socket.on("disconnect", async () => {
        for (const [telegramId, socketId] of activeConnections.entries()) {
            if (socketId === socket.id) {
                const user = await mongoose.model("User").findOne({ telegramId });
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

// Обновление автобота каждую секунду для активных пользователей
setInterval(async () => {
    const now = new Date();
    for (const [telegramId, cachedUser] of userCache.entries()) {
        if (cachedUser.autoStonesPerSecond > 0) {
            const timeDiff = Math.floor((now.getTime() - cachedUser.lastAutoBotUpdate.getTime()) / 1000);
            if (timeDiff > 0) {
                const user = await mongoose.model("User").findOne({ telegramId });
                if (user) {
                    const boostMultiplier = user.boostActiveUntil && now < user.boostActiveUntil ? 2 : 1;
                    const newStones = Math.floor(cachedUser.autoStonesPerSecond * timeDiff * boostMultiplier);
                    cachedUser.stones += newStones;
                    cachedUser.lastAutoBotUpdate = now;
                    userCache.set(telegramId, cachedUser);

                    user.stones = cachedUser.stones;
                    user.lastAutoBotUpdate = now;
                    await user.save();
                    io.to(telegramId).emit("userUpdate", sendUserResponse(user));
                }
            }
        }
    }
}, 1000);

// Обновление всех пользователей каждые 30 минут
setInterval(async () => {
    const now = new Date();
    console.log("[Background Update] Starting leaderboard and league update for all users...");

    const users = await mongoose.model("User").find({});
    for (const user of users) {
        const timeDiff = Math.floor((now.getTime() - user.lastAutoBotUpdate.getTime()) / 1000);
        if (user.autoStonesPerSecond > 0 && timeDiff > 0) {
            const boostMultiplier = user.boostActiveUntil && now < user.boostActiveUntil ? 2 : 1;
            const newStones = Math.floor(user.autoStonesPerSecond * timeDiff * boostMultiplier);
            user.stones += newStones;
            user.lastAutoBotUpdate = now;

            if (user.referredBy) {
                const referrer = await mongoose.model("User").findOne({ referralCode: user.referredBy });
                if (referrer) {
                    const bonus = Math.floor(newStones * 0.05);
                    referrer.stones += bonus;
                    referrer.referralBonus = (referrer.referralBonus || 0) + bonus;
                    await referrer.save();
                }
            }
        }
        user.league = getLeagueByStones(user.stones);
        await user.save();
    }

    console.log("[Background Update] Leaderboard and leagues updated for all users.");
}, 30 * 60 * 1000);

// Лог количества онлайн-пользователей каждые 30 минут
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
        process.exit(1);
    }
};

start();