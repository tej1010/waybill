import {
  applyEwbAuthRefresh,
  getEwbCredentials,
  refreshEwbAccessToken,
  shouldRefreshEwbToken,
} from "../services/ewbSession.js";
import { getPhoneMapping } from "./phoneRegistry.js";
import { getSession, saveSession } from "./sessionStore.js";

export async function refreshWhatsAppSessionToken(phone, session) {
  let credentials = getEwbCredentials(session.auth);
  if (!credentials) {
    credentials = await getPhoneMapping(phone).catch(() => null);
    if (!credentials) {
      const err = new Error("No stored credentials for token refresh");
      err.status = 401;
      throw err;
    }
    session.auth.credentials = {
      username: credentials.username,
      password: credentials.password,
      gstin: credentials.gstin,
    };
  }

  const result = await refreshEwbAccessToken(credentials);
  session.auth = applyEwbAuthRefresh(session.auth, result);
  session.auth.credentials = {
    username: credentials.username,
    password: credentials.password,
    gstin: credentials.gstin,
  };
  saveSession(phone, session);
  return session;
}

export async function ensureWhatsAppEwbToken(phone) {
  const session = getSession(phone);
  if (!session?.auth) return null;

  let credentials = getEwbCredentials(session.auth);
  if (!credentials) {
    credentials = await getPhoneMapping(phone).catch(() => null);
    if (!credentials) return session;
    session.auth.credentials = {
      username: credentials.username,
      password: credentials.password,
      gstin: credentials.gstin,
    };
    saveSession(phone, session);
  }

  if (!shouldRefreshEwbToken(session.auth)) {
    return session;
  }

  return refreshWhatsAppSessionToken(phone, session);
}
