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
    airdropProgress: number;
    refillLastUsed?: Date;
    boostLastUsed?: Date;
    boostActiveUntil?: Date;
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
    airdropProgress: { type: Number, default: 0 },
    refillLastUsed: { type: Date },
    boostLastUsed: { type: Date },
    boostActiveUntil: { type: Date },
});

const User = mongoose.model<IUser>("User", userSchema);

const resetBoostsMigration = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/stone-volodya", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        } as mongoose.ConnectOptions);
        console.log("Connected to MongoDB for boost reset migration");

        const users = await User.find();

        for (const user of users) {
            let needsUpdate = false;

            // Проверяем, нужно ли обнулять бусты
            if (user.boosts.length > 0 || user.refillLastUsed || user.boostLastUsed || user.boostActiveUntil) {
                user.boosts = []; // Обнуляем массив бустов
                user.refillLastUsed = undefined; // Сбрасываем время последнего использования Refill
                user.boostLastUsed = undefined; // Сбрасываем время последнего использования Boost
                user.boostActiveUntil = undefined; // Сбрасываем время окончания Boost
                needsUpdate = true;
            }

            // Сбрасываем связанные характеристики, зависящие от бустов
            if (user.energyRegenRate !== 1 || user.stonesPerClick !== 1 || user.autoStonesPerSecond !== 0 || user.maxEnergy !== 1000) {
                user.energyRegenRate = 1;
                user.stonesPerClick = 1;
                user.autoStonesPerSecond = 0;
                user.maxEnergy = 1000;
                needsUpdate = true;
            }

            if (needsUpdate) {
                await user.save();
                console.log(`Reset boosts and related fields for user ${user.telegramId}`);
            } else {
                console.log(`User ${user.telegramId} already has no boosts`);
            }
        }

        console.log("Boost reset migration completed successfully");
    } catch (error) {
        console.error("Boost reset migration failed:", error);
    } finally {
        await mongoose.connection.close();
        console.log("MongoDB connection closed");
    }
};

resetBoostsMigration();