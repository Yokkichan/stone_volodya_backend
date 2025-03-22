// src/utils/userUtils.ts
import { Document } from "mongoose";
import User, { IUser } from "../models/User";
import { userCache } from "../server";

// Расширяем IUser с Document для работы с методами Mongoose
type UserDocument = IUser & Document;

export const getLeagueByStones = (stones: number): string => {
    if (stones >= 100_000_000) return "Bedrock";
    if (stones >= 50_000_000) return "Marble";
    if (stones >= 10_000_000) return "Obsidian";
    if (stones >= 1_000_000) return "Granite";
    if (stones >= 500_000) return "Quartz";
    if (stones >= 100_000) return "Boulder";
    if (stones >= 50_000) return "Cobblestone";
    if (stones >= 5_000) return "Gravel";
    return "Pebble";
};

export const updateUserAndCache = async (
    user: UserDocument,
    userCache: Map<string, { stones: number; autoStonesPerSecond: number; lastAutoBotUpdate: Date; league: string }>
) => {
    user.league = getLeagueByStones(user.stones);
    user.lastAutoBotUpdate = new Date();
    await user.save();
    userCache.set(user.telegramId, {
        stones: user.stones,
        autoStonesPerSecond: user.autoStonesPerSecond,
        lastAutoBotUpdate: user.lastAutoBotUpdate,
        league: user.league,
    });
    return user;
};

export const sendUserResponse = (user: IUser) => ({
    telegramId: user.telegramId,
    username: user.username,
    stones: user.stones,
    energy: user.energy,
    boosts: user.boosts,
    skins: user.skins,
    tasksCompleted: user.tasksCompleted,
    league: user.league,
    referralCode: user.referralCode,
    energyRegenRate: user.energyRegenRate,
    stonesPerClick: user.stonesPerClick,
    autoStonesPerSecond: user.autoStonesPerSecond,
    maxEnergy: user.maxEnergy,
    lastAutoBotUpdate: user.lastAutoBotUpdate.toISOString(),
    referralBonus: user.referralBonus || 0,
});