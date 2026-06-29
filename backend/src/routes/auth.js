import { Router } from "express";
import { loginTaxPayer, validateGstin } from "../services/ewayAuth.js";
import { logger } from "../utils/logger.js";

const router = Router();

function validateLoginBody(body) {
  const { username, password, gstin } = body;
  if (!username?.trim() || !password?.trim() || !gstin?.trim()) {
    return "username, password, and gstin are required";
  }
  if (!validateGstin(gstin)) {
    return "Invalid GSTIN format";
  }
  return null;
}

router.post("/login", async (req, res) => {
  const { username, password, gstin } = req.body;

  logger.info("auth", "Login attempt", {
    username: username?.trim(),
    gstin: gstin?.trim()?.toUpperCase(),
    passwordLength: password?.length ?? 0,
    ip: req.ip,
  });

  const validationError = validateLoginBody(req.body);
  if (validationError) {
    logger.warn("auth", "Validation failed", { reason: validationError });
    return res.status(400).json({ message: validationError });
  }

  try {
    const result = await loginTaxPayer({ username, password, gstin });

    logger.info("auth", "Login success", {
      username: result.username,
      gstin: result.gstin,
      transaction_id: result.transaction_id,
    });

    return res.json({
      access_token: result.access_token,
      expiry: result.expiry,
      transaction_id: result.transaction_id,
      lastRefreshedAt: Date.now(),
    });
  } catch (err) {
    logger.error("auth", "Login error", {
      message: err.message,
      status: err.status,
      details: err.data,
    });

    return res.status(err.status || 502).json({
      message: err.message || "Unable to reach authentication service",
      details: err.data,
    });
  }
});

router.post("/refresh", async (req, res) => {
  const validationError = validateLoginBody(req.body);
  if (validationError) {
    return res.status(400).json({ message: validationError });
  }

  const { username, password, gstin } = req.body;

  logger.info("auth", "Token refresh attempt", {
    username: username?.trim(),
    gstin: gstin?.trim()?.toUpperCase(),
  });

  try {
    const result = await loginTaxPayer({ username, password, gstin });

    logger.info("auth", "Token refresh success", {
      username: result.username,
      gstin: result.gstin,
      transaction_id: result.transaction_id,
    });

    return res.json({
      access_token: result.access_token,
      expiry: result.expiry,
      transaction_id: result.transaction_id,
      lastRefreshedAt: Date.now(),
    });
  } catch (err) {
    logger.error("auth", "Token refresh error", {
      message: err.message,
      status: err.status,
    });

    return res.status(err.status || 502).json({
      message: err.message || "Unable to refresh session",
      details: err.data,
    });
  }
});

export default router;
