import { ONBOARDED_USERS } from "../config/onboardedUsers.js";
import { validateGstin } from "../services/ewayAuth.js";
import { logger } from "../utils/logger.js";
import { isMongoConnected } from "../db/mongodb.js";
import { savePhoneMapping } from "./phoneRegistry.js";
import { normalizePhone } from "./phoneRegistryUtils.js";

export function findOnboardedUser(phone) {
  const key = normalizePhone(phone);
  if (!key) return null;

  return (
    ONBOARDED_USERS.find((entry) => normalizePhone(entry?.phone) === key) ?? null
  );
}

export async function syncOnboardedToRegistry(phone) {
  const entry = findOnboardedUser(phone);
  if (!entry) return false;

  if (!isMongoConnected()) {
    logger.warn("whatsapp", "Onboard sync skipped — MongoDB not connected", {
      phone: normalizePhone(phone),
    });
    return false;
  }

  const username = entry.username?.trim();
  const password = entry.password?.trim();
  const gstin = entry.gstin?.trim()?.toUpperCase();

  if (!username || !password || !gstin || !validateGstin(gstin)) {
    logger.warn("whatsapp", "Onboard sync skipped — invalid entry", {
      phone: normalizePhone(phone),
    });
    return false;
  }

  try {
    await savePhoneMapping(phone, { username, password, gstin });
    logger.info("whatsapp", "Onboarded user synced to registry", {
      phone: normalizePhone(phone),
      username,
      gstin,
    });
    return true;
  } catch (err) {
    logger.error("whatsapp", "Onboard sync failed", {
      phone: normalizePhone(phone),
      message: err.message,
    });
    return false;
  }
}
