import dotenv from "dotenv";
dotenv.config();

import { Telegraf } from "telegraf";
import User from "./models/User";
import { generateReferralCode } from "./utils/referralCode";
import { updateUserAndCache } from "./utils/userUtils";
import { userCache } from "./server";
import path from "path";
import fs from "fs";

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Путь к фото в папке assets (предполагается, что у вас есть файл, например, welcome.jpg в assets)
const welcomeImagePath = path.join(__dirname, "../assets/welcome.jpg");

bot.start(async (ctx) => {
    const referralCode = ctx.startPayload || "";
    const telegramId = ctx.from.id.toString();

    try {
        let user = await User.findOne({ telegramId });
        const now = new Date();

        // Функция для получения актуального photo_url
        const getPhotoUrl = async () => {
            try {
                const photos = await ctx.telegram.getUserProfilePhotos(ctx.from.id, 0, 1);
                if (photos.total_count > 0) {
                    const fileId = photos.photos[0][0].file_id;
                    const file = await ctx.telegram.getFile(fileId);
                    return `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
                }
                return "";
            } catch (error) {
                console.error("[bot] Error fetching user profile photos:", error);
                return "";
            }
        };

        if (!user) {
            const photoUrl = await getPhotoUrl();
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
                refillLastUsed: now,
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
            // Обновляем данные существующего пользователя
            user.username = ctx.from.username || ctx.from.first_name || user.username;
            user.isPremium = !!ctx.from.is_premium;
            user.lastOnline = now;
            user.photo_url = await getPhotoUrl(); // Обновляем photo_url при каждом входе

            // Возобновление бустов раз в сутки
            if (!user.refillLastUsed || (now.getTime() - user.refillLastUsed.getTime()) >= 24 * 60 * 60 * 1000) {
                user.refillLastUsed = now;
            }
            if (!user.boostLastUsed || (now.getTime() - user.boostLastUsed.getTime()) >= 24 * 60 * 60 * 1000) {
                user.boostLastUsed = now;
            }
        }

        await updateUserAndCache(user, userCache);

        const miniAppUrl = `https://t.me/StoneVolodyaCoinBot/stone_volodya_game?startapp=${user.referralCode}`;

        // Проверяем наличие изображения в assets и отправляем его с сообщением
        if (fs.existsSync(welcomeImagePath)) {
            await ctx.replyWithPhoto(
                { source: fs.createReadStream(welcomeImagePath) },
                {
                    caption: "Welcome to the Great Stone World of Wonders! Ancient treasures, mighty stones and incredible adventures await you here. Click the button below and start your journey to the top!",
                    reply_markup: {
                        inline_keyboard: [[{ text: "Join Stone World", url: miniAppUrl }]],
                    },
                }
            );
        } else {
            // Если изображения нет, отправляем только текст
            await ctx.reply(
                "Welcome to the Great Stone World of Wonders! Ancient treasures, mighty stones and incredible adventures await you here. Click the button below and start your journey to the top!",
                {
                    reply_markup: {
                        inline_keyboard: [[{ text: "Join Stone World", url: miniAppUrl }]],
                    },
                }
            );
        }
    } catch (error) {
        console.error("[bot] Error processing /start:", error);
        await ctx.reply("Something went wrong in Stone World. Try again!");
    }
});

bot.launch();
console.log("Telegram bot is running...");

export default bot;