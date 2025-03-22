// src/utils/telegramAuth.ts
import nacl from "tweetnacl";

interface TelegramUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    allows_write_to_pm?: boolean;
    is_premium?: boolean;
    language_code?: string;
}

interface VerificationResult {
    user: TelegramUser;
}

const TELEGRAM_PUBLIC_KEY = Buffer.from(process.env.TELEGRAM_PUBLIC_KEY || "e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d", "hex");
const BOT_ID = process.env.BOT_ID || "7930848670";
const MAX_AGE_SECONDS = 86400; // 24 часа

export const verifyTelegramInitData = async (initData: string, botToken: string): Promise<VerificationResult | null> => {
    if (!initData || typeof initData !== "string" || !initData.trim()) {
        console.log("[verifyTelegramInitData] Invalid or empty initData:", initData);
        return null;
    }

    if (!botToken || typeof botToken !== "string") {
        console.log("[verifyTelegramInitData] Invalid botToken:", botToken);
        return null;
    }

    const params = new URLSearchParams(initData);
    const signature = params.get("signature");
    if (!signature) {
        console.log("[verifyTelegramInitData] Missing signature in initData:", initData);
        return null;
    }

    const authDate = params.get("auth_date");
    if (!authDate) {
        console.log("[verifyTelegramInitData] Missing auth_date in initData:", initData);
        return null;
    }

    const authTimestamp = parseInt(authDate, 10);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp - authTimestamp > MAX_AGE_SECONDS) {
        console.log("[verifyTelegramInitData] initData too old:", currentTimestamp - authTimestamp);
        return null;
    }

    params.delete("hash");
    params.delete("signature");

    const dataCheckString = [`${BOT_ID}:WebAppData`, ...Array.from(params.entries()).sort().map(([key, value]) => `${key}=${value}`)].join("\n");
    if (!dataCheckString) {
        console.log("[verifyTelegramInitData] Empty dataCheckString:", initData);
        return null;
    }

    const isValid = nacl.sign.detached.verify(Buffer.from(dataCheckString), Buffer.from(signature, "base64url"), TELEGRAM_PUBLIC_KEY);
    if (!isValid) {
        console.log("[verifyTelegramInitData] Signature verification failed:", signature);
        return null;
    }

    const userString = params.get("user");
    if (!userString) {
        console.log("[verifyTelegramInitData] Missing user data in initData");
        return null;
    }

    try {
        const user: TelegramUser = JSON.parse(decodeURIComponent(userString));
        return { user };
    } catch (error) {
        console.log("[verifyTelegramInitData] Failed to parse user data:", error);
        return null;
    }
};