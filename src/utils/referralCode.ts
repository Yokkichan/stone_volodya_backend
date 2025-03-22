// src/utils/referralCode.ts
import { customAlphabet } from "nanoid/non-secure";
import User from "../models/User";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const nanoid = customAlphabet(alphabet, 8);

export const generateReferralCode = async (): Promise<string> => {
    let referralCode: string;
    let isUnique = false;

    do {
        referralCode = nanoid();
        const existingUser = await User.findOne({ referralCode });
        isUnique = !existingUser;
    } while (!isUnique);

    return referralCode;
};