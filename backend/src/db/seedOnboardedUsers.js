import { ONBOARDED_USERS } from "../config/onboardedUsers.js";
import { logger } from "../utils/logger.js";
import { validateGstin } from "../services/ewayAuth.js";
import { isMongoConnected } from "./mongodb.js";
import { savePhoneMapping } from "../whatsapp/phoneRegistry.js";
import { normalizePhone } from "../whatsapp/phoneRegistryUtils.js";

function seedingEnabled() {
  const flag = process.env.SEED_ONBOARDED_USERS?.trim().toLowerCase();
  return flag !== "false" && flag !== "0";
}

export async function seedOnboardedUsers() {
  if (!seedingEnabled()) {
    logger.info("mongo", "Onboard user seed skipped (SEED_ONBOARDED_USERS=false)");
    return { seeded: 0, skipped: 0, failed: 0 };
  }

  if (!isMongoConnected()) {
    logger.warn("mongo", "Onboard user seed skipped — MongoDB not connected");
    return { seeded: 0, skipped: 0, failed: 0 };
  }

  if (!ONBOARDED_USERS?.length) {
    logger.info("mongo", "No onboarded users in config");
    return { seeded: 0, skipped: 0, failed: 0 };
  }

  let seeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of ONBOARDED_USERS) {
    const phone = normalizePhone(entry?.phone);
    const username = entry?.username?.trim();
    const password = entry?.password?.trim();
    const gstin = entry?.gstin?.trim()?.toUpperCase();

    if (!phone || phone.length < 10) {
      logger.warn("mongo", "Onboard skip — invalid phone", { phone: entry?.phone });
      skipped += 1;
      continue;
    }
    if (!username || !password || !gstin) {
      logger.warn("mongo", "Onboard skip — missing credentials", { phone });
      skipped += 1;
      continue;
    }
    if (!validateGstin(gstin)) {
      logger.warn("mongo", "Onboard skip — invalid GSTIN", { phone, gstin });
      skipped += 1;
      continue;
    }

    try {
      await savePhoneMapping(phone, { username, password, gstin });
      logger.info("mongo", "Onboarded user seeded", { phone, username, gstin });
      seeded += 1;
    } catch (err) {
      logger.error("mongo", "Onboard seed failed", { phone, message: err.message });
      failed += 1;
    }
  }

  logger.info("mongo", "Onboard user seed complete", { seeded, skipped, failed });
  return { seeded, skipped, failed };
}
