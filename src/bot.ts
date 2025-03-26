import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";
import User from "./models/User";
import { generateReferralCode } from "./utils/referralCode";
import { updateUserAndCache } from "./utils/userUtils";
import { userCache } from "./server";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

bot.start(async (ctx) => {
    const referralCode = ctx.startPayload || "";
    const telegramId = ctx.from.id.toString();

    try {
        let user = await User.findOne({ telegramId });
        const now = new Date();

        if (!user) {
            let photoUrl = "";
            try {
                const photos = await ctx.telegram.getUserProfilePhotos(ctx.from.id, 0, 1);
                if (photos.total_count > 0) {
                    const fileId = photos.photos[0][0].file_id;
                    const file = await ctx.telegram.getFile(fileId);
                    photoUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
                }
            } catch (error) {
                console.error("[bot] Error fetching user profile photos:", error);
            }

            user = await User.create({
                telegramId,
                username: ctx.from.username || ctx.from.first_name || `Miner_${Math.random().toString(36).substring(7)}`,
                photo_url: photoUrl,
                referralCode: await generateReferralCode(),
                referredBy: referralCode || undefined,
                isPremium: !!ctx.from.is_premium,
                stones: 0,
                energy: 1000,
                league: "Pebble",
                lastAutoBotUpdate: now,
                lastOnline: now,
                refillLastUsed: now, // Инициализируем с возможностью немедленного использования
                boostLastUsed: now,
            });

            if (referralCode) {
                const referrer = await User.findOne({ referralCode });
                if (referrer) {
                    const bonus = user.isPremium ? 10000 : 1000;
                    referrer.invitedFriends.push({ user: user._id, lastReferralStones: 0 });
                    referrer.stones += bonus;
                    referrer.referralBonus = (referrer.referralBonus || 0) + bonus;
                    await referrer.save();
                    await updateUserAndCache(referrer, userCache);
                    user.stones += bonus;
                }
            }
        } else {
            user.username = ctx.from.username || ctx.from.first_name || user.username;
            user.isPremium = !!ctx.from.is_premium;
            user.lastOnline = now;

            // Возобновление бустов раз в сутки
            if (!user.refillLastUsed || (now.getTime() - user.refillLastUsed.getTime()) >= 24 * 60 * 60 * 1000) {
                user.refillLastUsed = now; // Разрешаем использование Refill
            }
            if (!user.boostLastUsed || (now.getTime() - user.boostLastUsed.getTime()) >= 24 * 60 * 60 * 1000) {
                user.boostLastUsed = now; // Разрешаем использование Boost
            }
        }

        await updateUserAndCache(user, userCache);

        const miniAppUrl = `https://t.me/StoneVolodyaCoinBot/stone_volodya_game?startapp=${user.referralCode}`;
        await ctx.reply("Welcome to Stone Volodya Game! Click the button below to start playing:", {
            reply_markup: {
                inline_keyboard: [[{ text: "Open Game", url: miniAppUrl }]],
            },
        });
    } catch (error) {
        console.error("[bot] Error processing /start:", error);
        await ctx.reply("Something went wrong. Please try again.");
    }
});

bot.launch();
console.log("Telegram bot is running...");

export default bot;