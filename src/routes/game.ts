// src/routes/game.ts
import { Router } from "express";
import { updateBalance, applyBoost, buySkin, completeTask } from "../controllers/gameController";

const router = Router();

router.post("/update-balance", updateBalance);
router.post("/apply-boost", applyBoost);
router.post("/buy-skin", buySkin);
router.post("/complete-task", completeTask);
// router.post("/auto-tap"); // Удаляем или реализуем позже

export default router;