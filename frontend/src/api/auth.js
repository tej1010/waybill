const AUTH_STORAGE_KEY = "eway_auth";
const REFRESH_CREDS_KEY = "eway_refresh";
const EWB_EXPIRY_BUFFER_MS = 2 * 60 * 1000;

export function getStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(data) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
}

export function clearStoredAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(REFRESH_CREDS_KEY);
}

export function setRefreshCredentials({ username, password, gstin }) {
  localStorage.setItem(
    REFRESH_CREDS_KEY,
    JSON.stringify({
      username: username.trim(),
      password: password.trim(),
      gstin: gstin.trim().toUpperCase(),
    })
  );
}

export function getRefreshCredentials() {
  try {
    const raw = localStorage.getItem(REFRESH_CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function needsTokenRefresh(auth) {
  if (!auth?.access_token) return true;
  if (!auth.expiry) return false;
  return Date.now() >= Number(auth.expiry) - EWB_EXPIRY_BUFFER_MS;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function login({ username, password, gstin }) {
  const url = `${API_BASE}/api/auth/login`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, gstin }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.message || "Login failed");
    err.status = response.status;
    err.details = data.details;
    throw err;
  }

  return data;
}

export async function refreshSession(credentials) {
  const url = `${API_BASE}/api/auth/refresh`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.message || "Session refresh failed");
    err.status = response.status;
    err.details = data.details;
    throw err;
  }

  return data;
}

export async function ensureValidAuth() {
  const auth = getStoredAuth();
  const credentials = getRefreshCredentials();

  if (!auth || !credentials) return null;
  if (!needsTokenRefresh(auth)) return auth;

  const refreshed = await refreshSession(credentials);
  const updated = {
    ...auth,
    access_token: refreshed.access_token,
    expiry: refreshed.expiry,
    transaction_id: refreshed.transaction_id,
    lastRefreshedAt: refreshed.lastRefreshedAt ?? Date.now(),
  };

  setStoredAuth(updated);
  return updated;
}
