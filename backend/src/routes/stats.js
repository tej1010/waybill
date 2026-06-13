import { Router } from "express";
import { getEwbDashboardStats } from "../db/ewbOperations.js";

const router = Router();

router.get("/dashboard", async (req, res) => {
  const days = Number(req.query.days) || 30;

  try {
    const stats = await getEwbDashboardStats({ days });
    return res.json({ ok: true, ...stats });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

export default router;
