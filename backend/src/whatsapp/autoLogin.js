import { loginTaxPayer } from "../services/ewayAuth.js";
import { logger } from "../utils/logger.js";
import { getPhoneMapping } from "./phoneRegistry.js";
import { createUserSession, saveSession } from "./sessionStore.js";

export async function autoLoginFromRegistry(phone) {
  const credentials = await getPhoneMapping(phone);
  if (!credentials) return null;

  try {
    const auth = await loginTaxPayer(credentials);
    const session = createUserSession(auth, credentials);
    saveSession(phone, session);
    logger.info("whatsapp", "Auto-login from phone mapping", {
      phone,
      username: auth.username,
    });
    return session;
  } catch (err) {
    logger.warn("whatsapp", "Auto-login failed", { phone, message: err.message });
    return null;
  }
}

export async function completeWhatsAppLogin(phone, credentials) {
  const auth = await loginTaxPayer(credentials);
  const session = createUserSession(auth, credentials);
  session.draft.login = {};
  saveSession(phone, session);
  return { session, auth };
}
