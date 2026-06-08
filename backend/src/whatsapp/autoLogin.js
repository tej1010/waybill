import { loginTaxPayer } from "../services/ewayAuth.js";
import { logger } from "../utils/logger.js";
import { getPhoneMapping } from "./phoneRegistry.js";
import { syncOnboardedToRegistry } from "./onboardLookup.js";
import { normalizePhone } from "./phoneRegistryUtils.js";
import { createUserSession, saveSession } from "./sessionStore.js";

export async function autoLoginFromRegistry(phone) {
  const key = normalizePhone(phone);

  let credentials = await getPhoneMapping(phone).catch((err) => {
    logger.warn("whatsapp", "Registry lookup failed", { phone: key, message: err.message });
    return null;
  });

  if (!credentials) {
    await syncOnboardedToRegistry(phone);
    credentials = await getPhoneMapping(phone).catch(() => null);
  }

  if (!credentials) return null;

  try {
    const auth = await loginTaxPayer(credentials);
    const session = createUserSession(auth, credentials);
    saveSession(key, session);
    logger.info("whatsapp", "Auto-login from phone mapping", {
      phone: key,
      username: auth.username,
    });
    return session;
  } catch (err) {
    logger.warn("whatsapp", "Auto-login failed", { phone: key, message: err.message });
    return null;
  }
}

export async function completeWhatsAppLogin(phone, credentials) {
  const key = normalizePhone(phone);
  const auth = await loginTaxPayer(credentials);
  const session = createUserSession(auth, credentials);
  session.draft.login = {};
  saveSession(key, session);
  return { session, auth };
}
