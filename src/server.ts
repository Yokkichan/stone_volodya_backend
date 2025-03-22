// src/server.ts
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
import "./bot";
import { getLeagueByStones, updateUserAndCache } from "./utils/userUtils";

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
});

export const userCache = new Map<string, { stones: number; autoStonesPerSecond: number; lastAutoBotUpdate: Date; league: string }>();
const activeConnections = new Map<string, string>();

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log(`Received request: ${req.method} ${req.url}`);
    next();
});

app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/airdrop", airdropRoutes);
app.use("/api/referral", referralRoutes);

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

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
            await updateUserAndCache(user, userCache);
            io.to(telegramId).emit("userUpdate", {
                stones: user.stones,
                league: user.league,
                lastAutoBotUpdate: user.lastAutoBotUpdate,
            });
        }
    });

    socket.on("getLeaderboard", async ({ league }) => {
        const players = await mongoose.model("User").find({ league }).sort({ stones: -1 }).limit(100).select("telegramId username stones");
        socket.emit("leaderboard", players);
    });

    socket.on("disconnect", async () => {
        console.log("User disconnected:", socket.id);
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

setInterval(async () => {
    console.log("[Cache Sync] Syncing user cache to database");
    const updates = Array.from(userCache.entries()).map(([telegramId, cachedUser]) => ({
        updateOne: {
            filter: { telegramId },
            update: { $set: { stones: cachedUser.stones, league: cachedUser.league, lastAutoBotUpdate: cachedUser.lastAutoBotUpdate } },
        },
    }));

    if (updates.length > 0) {
        await mongoose.model("User").bulkWrite(updates);
        console.log(`[Cache Sync] Updated ${updates.length} users in database`);
    }
}, 60 * 1000);

const start = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI!);
        console.log("Connected to MongoDB");
        server.listen(process.env.PORT || 3000, () => {
            console.log(`Server running on port ${process.env.PORT || 3000}`);
        });
    } catch (error) {
        console.error("Error starting server:", error);
    }
};

start();