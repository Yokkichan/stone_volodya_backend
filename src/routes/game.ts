import { Router } from "express";
import { updateBalance, applyBoost, buySkin, completeTask, useRefill, useBoost } from "../controllers/gameController";

const router = Router();

router.post("/update-balance", updateBalance);
router.post("/apply-boost", applyBoost);
router.post("/buy-skin", buySkin);
router.post("/complete-task", completeTask);
router.post("/use-refill", useRefill);
router.post("/use-boost", useBoost);

export default router;