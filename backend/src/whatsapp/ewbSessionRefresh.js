import {
  applyEwbAuthRefresh,
  getEwbCredentials,
  refreshEwbAccessToken,
  shouldRefreshEwbToken,
} from "../services/ewbSession.js";
import { logger } from "../utils/logger.js";
import { forEachSession, getSession, saveSession } from "./sessionStore.js";

const SCHEDULER_TICK_MS = 60 * 1000;

export async function refreshWhatsAppSessionToken(phone, session) {
  const credentials = getEwbCredentials(session.auth);
  if (!credentials) {
    const err = new Error("No stored credentials for token refresh");
    err.status = 401;
    throw err;
  }

  const result = await refreshEwbAccessToken(credentials);
  session.auth = applyEwbAuthRefresh(session.auth, result);
  saveSession(phone, session);
  return session;
}

export async function ensureWhatsAppEwbToken(phone) {
  const session = getSession(phone);
  if (!session?.auth) return null;

  const credentials = getEwbCredentials(session.auth);
  if (!credentials) return session;

  if (!shouldRefreshEwbToken(session.auth)) {
    return session;
  }

  return refreshWhatsAppSessionToken(phone, session);
}

async function runScheduledRefresh() {
  forEachSession((phone, session) => {
    if (!session.auth || !shouldRefreshEwbToken(session.auth)) return;

    refreshWhatsAppSessionToken(phone, session).catch((err) => {
      logger.warn("whatsapp", "Scheduled EWB token refresh failed", {
        phone,
        message: err.message,
      });
    });
  });
}

export function startWhatsAppEwbRefreshScheduler() {
  setInterval(() => {
    runScheduledRefresh().catch((err) => {
      logger.error("whatsapp", "EWB refresh scheduler error", { message: err.message });
    });
  }, SCHEDULER_TICK_MS);

  logger.info("whatsapp", "EWB token refresh scheduler started", {
    intervalMs: SCHEDULER_TICK_MS,
    refreshEveryMs: 60 * 60 * 1000,
  });
}
