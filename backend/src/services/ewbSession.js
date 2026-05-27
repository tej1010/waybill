import { loginTaxPayer } from "./ewayAuth.js";
import { logger } from "../utils/logger.js";

export const EWB_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const EWB_EXPIRY_BUFFER_MS = 2 * 60 * 1000;

export function getEwbCredentials(auth) {
  if (!auth?.credentials?.username) return null;
  return {
    username: auth.credentials.username,
    password: auth.credentials.password,
    gstin: auth.credentials.gstin,
  };
}

export function shouldRefreshEwbToken(auth) {
  if (!auth?.access_token) return true;

  const lastRefresh = Number(auth.lastRefreshedAt || 0);
  if (!lastRefresh || Date.now() - lastRefresh >= EWB_REFRESH_INTERVAL_MS) {
    return true;
  }

  if (auth.expiry && Date.now() >= Number(auth.expiry) - EWB_EXPIRY_BUFFER_MS) {
    return true;
  }

  return false;
}

export function hasLoggedInAuth(session) {
  return Boolean(session?.auth?.access_token && getEwbCredentials(session.auth));
}

export function applyEwbAuthRefresh(auth, result) {
  return {
    ...auth,
    access_token: result.access_token,
    expiry: result.expiry,
    transaction_id: result.transaction_id,
    lastRefreshedAt: Date.now(),
  };
}

export async function refreshEwbAccessToken(credentials) {
  const result = await loginTaxPayer({
    username: credentials.username,
    password: credentials.password,
    gstin: credentials.gstin,
  });

  logger.info("ewb-session", "E-Way Bill token refreshed", {
    username: result.username,
    gstin: result.gstin,
    expiry: result.expiry,
  });

  return result;
}
