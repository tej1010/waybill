export function normalizePhone(phone) {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
  return digits;
}

export function makeAccountId(username, gstin) {
  return `${String(gstin).trim().toUpperCase()}:${String(username).trim()}`;
}

export function maxPhonesPerAccount() {
  const n = Number(process.env.MAX_PHONES_PER_ACCOUNT || 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}
