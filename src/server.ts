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
            console.log(`User logged in: ${user.username}`); // Лог ника при входе
            const cachedUser = userCache.get(telegramId) || {
                stones: user.stones,
                autoStonesPerSecond: user.autoStonesPerSecond,
                lastAutoBotUpdate: user.lastAutoBotUpdate,
                league: user.league,
            };

            const now = new Date();
            const timeDiff = Math.floor((now.getTime() - cachedUser.lastAutoBotUpdate.getTime()) / 1000);
            if (cachedUser.autoStonesPerSecond > 0 && timeDiff > 0) {
                const offlineStones = Math.floor(cachedUser.autoStonesPerSecond * timeDiff);
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
                const newStones = Math.floor(cachedUser.autoStonesPerSecond * timeDiff);
                cachedUser.stones += newStones;
                cachedUser.lastAutoBotUpdate = now;
                userCache.set(telegramId, cachedUser);

                const user = await mongoose.model("User").findOne({ telegramId });
                if (user) {
                    user.stones = cachedUser.stones;
                    user.lastAutoBotUpdate = now;
                    await user.save();
                    io.to(telegramId).emit("userUpdate", sendUserResponse(user));
                }
            }
        }
    }
}, 1000);

// Лог количества онлайн-пользователей каждые 30 минут
setInterval(() => {
    const onlineCount = activeConnections.size;
    console.log(`Online users: ${onlineCount}`);
}, 30 * 60 * 1000); // 30 минут в миллисекундах

const start = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI!);
        server.listen(process.env.PORT || 3000, () => {});
    } catch (error) {}
};

start();