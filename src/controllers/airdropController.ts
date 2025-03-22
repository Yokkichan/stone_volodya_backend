// src/controllers/airdropController.ts
import { Request, Response } from "express";
import User from "../models/User";
import { TonClient, WalletContractV4, internal, JettonMaster, JettonWallet, Address, toNano, beginCell } from "@ton/ton";
import { mnemonicToPrivateKey } from "ton-crypto";
import { updateUserAndCache, sendUserResponse } from "../utils/userUtils";
import { userCache } from "../server"; // Добавляем импорт

interface AuthRequest extends Request {
    user?: { telegramId: string };
}

const AIRDROP_AMOUNT = 50;
const airdropLocks: { [telegramId: string]: boolean } = {};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const claimAirdrop = async (req: AuthRequest, res: Response) => {
    const telegramId = req.user!.telegramId;
    if (airdropLocks[telegramId]) return res.status(429).json({ message: "Another Airdrop claim is in progress" });

    airdropLocks[telegramId] = true;

    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ message: "User not found" });
        if (!user.tonWallet) return res.status(400).json({ message: "TON wallet not connected" });
        if (user.tasksCompleted.includes("airdrop")) return res.status(400).json({ message: "Airdrop already claimed" });

        const client = new TonClient({
            endpoint: "https://toncenter.com/api/v2/jsonRPC",
            apiKey: process.env.TONCENTER_API_KEY,
        });

        const OWNER_MNEMONIC = process.env.OWNER_MNEMONIC!;
        const SV_COIN_CONTRACT_ADDRESS = process.env.SV_COIN_CONTRACT_ADDRESS!;
        const mnemonicWords = OWNER_MNEMONIC.split(" ");
        const keyPair = await mnemonicToPrivateKey(mnemonicWords);
        const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
        const walletContract = client.open(wallet);

        const jettonMaster = JettonMaster.create(Address.parse(SV_COIN_CONTRACT_ADDRESS));
        const jettonContract = client.open(jettonMaster);

        await sleep(1000);
        const ownerJettonWalletAddress = await jettonContract.getWalletAddress(wallet.address);
        const ownerJettonWallet = client.open(JettonWallet.create(ownerJettonWalletAddress));

        await sleep(1000);
        const userJettonWalletAddress = await jettonContract.getWalletAddress(Address.parse(user.tonWallet));

        const transferBody = beginCell()
            .storeUint(0xf8a7ea5, 32)
            .storeUint(0, 64)
            .storeCoins(BigInt(AIRDROP_AMOUNT * 10 ** 9))
            .storeAddress(Address.parse(user.tonWallet))
            .storeAddress(wallet.address)
            .storeMaybeRef(null)
            .storeCoins(toNano("0"))
            .storeMaybeRef(null)
            .endCell();

        await sleep(1000);
        const seqno = await walletContract.getSeqno();
        await walletContract.sendTransfer({
            seqno,
            secretKey: keyPair.secretKey,
            messages: [internal({ to: ownerJettonWalletAddress, value: toNano("0.05"), body: transferBody })],
        });

        user.tasksCompleted.push("airdrop");
        await updateUserAndCache(user, userCache);
        res.json(sendUserResponse(user));
    } catch (error) {
        console.error("[claimAirdrop] Failed to send Airdrop transaction:", error);
        res.status(500).json({ message: "Failed to send Airdrop transaction" });
    } finally {
        delete airdropLocks[telegramId];
    }
};