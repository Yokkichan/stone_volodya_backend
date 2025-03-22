import { Router } from "express";
import { completeTask } from "../controllers/earnController";

const router = Router();

router.post("/completeTask", completeTask);

export default router;