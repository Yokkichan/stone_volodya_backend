import User from "../models/User";
import logger from "../logger"; // Import the Winston logger

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
        logger.error(`User not found for telegramId: ${telegramId}`);
        throw new Error("User not found");
    }

    // Log user data after population
    logger.info("[getReferralFriends] User after populate:", {
        telegramId: user.telegramId,
        invitedFriendsCount: user.invitedFriends.length,
        invitedFriends: user.invitedFriends.map(f => ({
            userId: f.user?._id?.toString(),
            lastReferralStones: f.lastReferralStones
        }))
    });

    const friendsData: Friend[] = [];
    for (const friendEntry of user.invitedFriends) {
        if (!friendEntry.user) {
            logger.error("[getReferralFriends] Failed to populate user for friendEntry:", {
                friendEntry: {
                    userId: friendEntry.user?._id?.toString() || "missing",
                    lastReferralStones: friendEntry.lastReferralStones
                }
            });
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

    // Log the final friends data
    logger.info("[getReferralFriends] Friends data:", {
        friendsCount: friendsData.length,
        friends: friendsData.map(f => ({ telegramId: f.telegramId, username: f.username }))
    });

    const totalBonus = user.referralBonus || 0;

    return { invitedFriends: friendsData, totalBonus };
};