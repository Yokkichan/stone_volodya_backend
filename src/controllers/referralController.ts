import User from "../models/User";

interface Friend {
    telegramId: string;
    username: string;
    stones: number;
    isPremium: boolean;
    photo_url: string;
}

export const getReferralFriends = async (telegramId: string): Promise<{ invitedFriends: Friend[]; bonus: number; totalBonus: number }> => {
    const user = await User.findOne({ telegramId }).populate<{ invitedFriends: { user: any; lastReferralStones: number }[] }>("invitedFriends.user");
    if (!user) {
        throw new Error("User not found");
    }

    console.log("[getReferralFriends] User after populate:", JSON.stringify(user, null, 2));
    console.log("[getReferralFriends] Raw invitedFriends:", JSON.stringify(user.invitedFriends, null, 2));

    const friendsData: Friend[] = [];
    for (const friendEntry of user.invitedFriends) {
        if (!friendEntry.user) {
            console.error("[getReferralFriends] Failed to populate user for friendEntry:", JSON.stringify(friendEntry, null, 2));
            continue;
        }
        const friend = friendEntry.user;
        console.log("[getReferralFriends] Friend entry user:", JSON.stringify(friend, null, 2));
        friendsData.push({
            telegramId: friend.telegramId,
            username: friend.username,
            stones: friend.stones,
            isPremium: friend.isPremium || false,
            photo_url: friend.photo_url || "",
        });
    }

    console.log("[getReferralFriends] Friends data:", friendsData);

    let baseBonus = 0;
    friendsData.forEach((friend) => {
        const bonus = friend.isPremium ? 10000 : 1000;
        baseBonus += bonus;
    });

    const totalBonus = (user.referralBonus || 0) + baseBonus;

    return { invitedFriends: friendsData, bonus: baseBonus, totalBonus };
};