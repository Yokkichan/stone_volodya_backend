import mongoose, { Schema } from "mongoose";

export interface IBoost {
    name: string;
    level: number;
    count?: number;
}

export interface IInvitedFriend {
    user: mongoose.Types.ObjectId;
    lastReferralStones: number;
}

export interface IUser {
    telegramId: string;
    username: string;
    photo_url: string;
    stones: number;
    energy: number;
    boosts: IBoost[];
    skins: string[];
    tasksCompleted: string[];
    league: string;
    tonWallet?: string;
    referralCode: string;
    referredBy?: string;
    invitedFriends: IInvitedFriend[];
    energyRegenRate: number;
    stonesPerClick: number;
    autoStonesPerSecond: number;
    maxEnergy: number;
    lastLogin?: Date;
    lastAutoBotUpdate: Date;
    lastOnline?: Date;
    isPremium: boolean;
    referralBonusClaimed: boolean;
    referralBonus: number;
    lastEnergyUpdate: Date;
    airdropProgress: number; // Добавляем прогресс аирдропа
}

const userSchema = new Schema<IUser>({
    telegramId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    photo_url: { type: String, default: "" },
    stones: { type: Number, default: 0 },
    energy: { type: Number, default: 1000 },
    boosts: [{
        name: { type: String, required: true },
        level: { type: Number, default: 0 },
        count: { type: Number, default: 0, required: false },
    }],
    skins: { type: [String], default: [] },
    tasksCompleted: { type: [String], default: [] },
    league: { type: String, default: "Pebble" },
    tonWallet: { type: String },
    referralCode: { type: String, unique: true, required: true },
    referredBy: { type: String },
    invitedFriends: [{
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        lastReferralStones: { type: Number, default: 0 },
    }],
    energyRegenRate: { type: Number, default: 1 },
    stonesPerClick: { type: Number, default: 1 },
    autoStonesPerSecond: { type: Number, default: 0 },
    maxEnergy: { type: Number, default: 1000 },
    lastLogin: { type: Date },
    lastAutoBotUpdate: { type: Date, default: Date.now },
    lastOnline: { type: Date },
    isPremium: { type: Boolean, default: false },
    referralBonusClaimed: { type: Boolean, default: false },
    referralBonus: { type: Number, default: 0 },
    lastEnergyUpdate: { type: Date, default: Date.now },
    airdropProgress: { type: Number, default: 0 }, // Прогресс аирдропа
});

export default mongoose.model<IUser>("User", userSchema);