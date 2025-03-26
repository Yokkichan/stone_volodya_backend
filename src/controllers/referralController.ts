import User from "../models/User";

interface Friend {
    telegramId: string;
    username: string;
    stones: number;
    isPremium: boolean;
    photo_url: string;
}

export const getReferralFriends = async (telegramId: string): Promise<{ invitedFriends: Friend[]; totalBonus: number }> => {
    const user = await User.findOne({ telegramId }).populate<{ invitedFriends: { user: any; lastReferralStones: number }[] }>("invitedFriends.user");
    if (!user) {
        throw new Error("User not found");
    }

    const friendsData: Friend[] = [];
    for (const friendEntry of user.invitedFriends) {
        if (!friendEntry.user) {
            continue;
        }
        const friend = friendEntry.user;
        friendsData.push({
            telegramId: friend.telegramId,
            username: friend.username,
            stones: friend.stones,
            isPremium: friend.isPremium || false,
            photo_url: friend.photo_url || "",
        });
    }

    const totalBonus = user.referralBonus || 0;

    return { invitedFriends: friendsData, totalBonus };
};