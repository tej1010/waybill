import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../utils/logger.js";
import { getAccountsCollection, getPhonesCollection, isMongoConnected } from "./mongodb.js";
import { makeAccountId, normalizePhone } from "../whatsapp/phoneRegistryUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_JSON_PATH = path.resolve(__dirname, "../../data/phone-registry.json");

function registryJsonPath() {
  return process.env.PHONE_REGISTRY_PATH?.trim() || DEFAULT_JSON_PATH;
}

function parseLegacyRegistry(raw) {
  if (raw?.version === 2) {
    return { accounts: raw.accounts || {}, phones: raw.phones || {} };
  }

  const accounts = {};
  const phones = {};

  for (const [key, entry] of Object.entries(raw || {})) {
    if (!entry?.username || !entry?.passwordEnc || !entry?.gstin) continue;
    const phone = normalizePhone(key);
    const accountId = makeAccountId(entry.username, entry.gstin);
    if (!accounts[accountId]) {
      accounts[accountId] = {
        username: entry.username.trim(),
        passwordEnc: entry.passwordEnc,
        gstin: entry.gstin.trim().toUpperCase(),
        phones: [],
        linkedAt: entry.linkedAt || Date.now(),
        updatedAt: entry.linkedAt || Date.now(),
      };
    }
    if (!accounts[accountId].phones.includes(phone)) {
      accounts[accountId].phones.push(phone);
    }
    phones[phone] = accountId;
  }

  return { accounts, phones };
}

export async function migrateJsonRegistryToMongo() {
  if (!isMongoConnected()) return;

  const existing = await getPhonesCollection().countDocuments();
  if (existing > 0) {
    logger.info("mongo", "Skip JSON migration — phones collection already has data", {
      count: existing,
    });
    return;
  }

  let raw;
  try {
    raw = JSON.parse(await fs.readFile(registryJsonPath(), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }

  const { accounts, phones } = parseLegacyRegistry(raw);
  const accountIds = Object.keys(accounts);
  if (accountIds.length === 0) return;

  const now = new Date();

  for (const accountId of accountIds) {
    const account = accounts[accountId];
    await getAccountsCollection().updateOne(
      { accountId },
      {
        $set: {
          accountId,
          username: account.username,
          passwordEnc: account.passwordEnc,
          gstin: account.gstin,
          phones: account.phones,
          linkedAt: new Date(account.linkedAt || Date.now()),
          updatedAt: new Date(account.updatedAt || Date.now()),
          lastLoginAt: new Date(account.updatedAt || Date.now()),
        },
      },
      { upsert: true }
    );
  }

  for (const [phone, accountId] of Object.entries(phones)) {
    await getPhonesCollection().updateOne(
      { phone },
      {
        $set: {
          phone,
          accountId,
          linkedAt: now,
        },
      },
      { upsert: true }
    );
  }

  logger.info("mongo", "Migrated phone-registry.json to MongoDB", {
    accounts: accountIds.length,
    phones: Object.keys(phones).length,
  });
}
