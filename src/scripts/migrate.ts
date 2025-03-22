import mongoose, { Schema } from "mongoose";

interface IUser {
    telegramId: string;
    username: string;
    stones: number;
    energy: number;
    boosts: { name: string; level: number; count?: number }[];
    skins: string[];
    tasksCompleted: string[];
    league: string;
    tonWallet?: string;
    referralCode: string;
    referredBy?: string;
    invitedFriends: string[];
}

const userSchema = new Schema<IUser>({
    telegramId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    stones: { type: Number, default: 0 },
    energy: { type: Number, default: 1000 },
    boosts: [
        {
            name: { type: String, required: true },
            level: { type: Number, default: 0 },
            count: { type: Number },
        },
    ],
    skins: { type: [String], default: [] },
    tasksCompleted: { type: [String], default: [] },
    league: { type: String, default: "Pebble" },
    tonWallet: { type: String },
    referralCode: { type: String, unique: true, required: true },
    referredBy: { type: String },
    invitedFriends: { type: [String], default: [] },
});

const User = mongoose.model<IUser>("User", userSchema);

const generateReferralCode = async (): Promise<string> => {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
        code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    const existingUser = await User.findOne({ referralCode: code });
    if (existingUser) {
        return generateReferralCode();
    }
    return code;
};

const migrateUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/stone-volodya", {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        } as mongoose.ConnectOptions);
        console.log("Connected to MongoDB for migration");

        const users = await User.find();

        for (const user of users) {
            let needsUpdate = false;

            if (!user.referralCode) {
                user.referralCode = await generateReferralCode();
                needsUpdate = true;
            }

            if (user.referredBy === undefined) {
                user.referredBy = undefined;
                needsUpdate = true;
            }

            if (!user.invitedFriends) {
                user.invitedFriends = [];
                needsUpdate = true;
            }

            if (needsUpdate) {
                await user.save();
                console.log(`Updated user ${user.telegramId} with new fields`);
            } else {
                console.log(`User ${user.telegramId} already up-to-date`);
            }
        }

        console.log("Migration completed successfully");
    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        await mongoose.connection.close();
        console.log("MongoDB connection closed");
    }
};

migrateUsers();