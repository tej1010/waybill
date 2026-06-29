import crypto from "crypto";

const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export const STATES = {
  LOGIN_USERNAME: "LOGIN_USERNAME",
  LOGIN_PASSWORD: "LOGIN_PASSWORD",
  LOGIN_GSTIN: "LOGIN_GSTIN",
  MENU: "MENU",
  PART_B_EWB: "PART_B_EWB",
  PART_B_MODE: "PART_B_MODE",
  PART_B_VEHICLE: "PART_B_VEHICLE",
  PART_B_PLACE: "PART_B_PLACE",
  PART_B_TRANSDOC: "PART_B_TRANSDOC",
  PART_B_REASON: "PART_B_REASON",
  UPDATE_TRANSPORTER_EWB: "UPDATE_TRANSPORTER_EWB",
  UPDATE_TRANSPORTER_ID: "UPDATE_TRANSPORTER_ID",
  EXTEND_EWB: "EXTEND_EWB",
  EXTEND_VEHICLE: "EXTEND_VEHICLE",
  EXTEND_FROM_PLACE: "EXTEND_FROM_PLACE",
  EXTEND_FROM_STATE: "EXTEND_FROM_STATE",
  EXTEND_FROM_PINCODE: "EXTEND_FROM_PINCODE",
  EXTEND_REMAINING_DISTANCE: "EXTEND_REMAINING_DISTANCE",
  EXTEND_TRANS_DOC_DATE: "EXTEND_TRANS_DOC_DATE",
  EXTEND_TRANS_DOC_DATE_INPUT: "EXTEND_TRANS_DOC_DATE_INPUT",
  EXTEND_TRANS_MODE: "EXTEND_TRANS_MODE",
  EXTEND_REASON: "EXTEND_REASON",
  EXTEND_REMARKS: "EXTEND_REMARKS",
};

function cleanup() {
  const now = Date.now();
  for (const [phone, session] of sessions) {
    if (now - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(phone);
    }
  }
}

export function getSession(phone) {
  cleanup();
  return sessions.get(phone) || null;
}

export function saveSession(phone, session) {
  sessions.set(phone, { ...session, updatedAt: Date.now() });
}

export function deleteSession(phone) {
  sessions.delete(phone);
}

export function createEmptySession() {
  return {
    state: STATES.LOGIN_USERNAME,
    draft: { login: {}, partB: {}, transporter: {}, extend: {} },
    auth: null,
    updatedAt: Date.now(),
  };
}

export function createUserSession(authData, credentials) {
  return {
    state: STATES.MENU,
    draft: { login: {}, partB: {}, transporter: {}, extend: {} },
    auth: {
      sessionToken: crypto.randomUUID(),
      username: authData.username,
      gstin: authData.gstin,
      access_token: authData.access_token,
      expiry: authData.expiry,
      transaction_id: authData.transaction_id,
      lastRefreshedAt: Date.now(),
      credentials: credentials
        ? {
            username: credentials.username,
            password: credentials.password,
            gstin: credentials.gstin,
          }
        : undefined,
    },
    updatedAt: Date.now(),
  };
}

export function forEachSession(callback) {
  cleanup();
  for (const [phone, session] of sessions) {
    callback(phone, session);
  }
}

export function isEwbTokenValid(session) {
  if (!session?.auth?.access_token) return false;
  if (!session.auth.expiry) return true;
  return Date.now() < Number(session.auth.expiry);
}
