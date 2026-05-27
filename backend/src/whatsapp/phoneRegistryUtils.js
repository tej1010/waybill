export function normalizePhone(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

export function makeAccountId(username, gstin) {
  return `${String(gstin).trim().toUpperCase()}:${String(username).trim()}`;
}

export function maxPhonesPerAccount() {
  const n = Number(process.env.MAX_PHONES_PER_ACCOUNT || 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}
