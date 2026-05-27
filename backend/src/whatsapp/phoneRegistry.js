import { decryptSecret, encryptSecret } from "../utils/secretCrypto.js";
import { logger } from "../utils/logger.js";
import {
  getAccountsCollection,
  getPhonesCollection,
  isMongoConnected,
} from "../db/mongodb.js";
import {
  makeAccountId,
  maxPhonesPerAccount,
  normalizePhone,
} from "./phoneRegistryUtils.js";

export { normalizePhone, makeAccountId } from "./phoneRegistryUtils.js";

function credentialsFromAccount(account) {
  return {
    username: account.username,
    password: decryptSecret(account.passwordEnc),
    gstin: account.gstin,
  };
}

function requireMongo() {
  if (!isMongoConnected()) {
    const err = new Error("Database not available. Set MONGODB_URI in .env and restart the server.");
    err.status = 503;
    throw err;
  }
}

export async function hasPhoneMapping(phone) {
  requireMongo();
  const key = normalizePhone(phone);
  const link = await getPhonesCollection().findOne({ phone: key });
  return Boolean(link);
}

export async function getPhoneMapping(phone) {
  requireMongo();
  const key = normalizePhone(phone);
  const link = await getPhonesCollection().findOne({ phone: key });
  if (!link) return null;

  const account = await getAccountsCollection().findOne({ accountId: link.accountId });
  if (!account) {
    await getPhonesCollection().deleteOne({ phone: key });
    return null;
  }

  return credentialsFromAccount(account);
}

export async function getAccountForPhone(phone) {
  requireMongo();
  const key = normalizePhone(phone);
  const link = await getPhonesCollection().findOne({ phone: key });
  if (!link) return null;

  const account = await getAccountsCollection().findOne({ accountId: link.accountId });
  if (!account) return null;

  return {
    accountId: account.accountId,
    username: account.username,
    gstin: account.gstin,
    phones: [...(account.phones || [])],
  };
}

function validateCredentials({ username, password, gstin }) {
  if (!username?.trim()) {
    const err = new Error("User ID is required to save");
    err.status = 400;
    throw err;
  }
  if (!password?.trim()) {
    const err = new Error("Password is required to save");
    err.status = 400;
    throw err;
  }
  if (!gstin?.trim() || gstin.trim().length !== 15) {
    const err = new Error("Valid 15-character GSTIN is required to save");
    err.status = 400;
    throw err;
  }
}

export async function savePhoneMapping(phone, { username, password, gstin }) {
  requireMongo();
  validateCredentials({ username, password, gstin });

  const key = normalizePhone(phone);
  if (!key || key.length < 10) {
    const err = new Error("Invalid WhatsApp phone number");
    err.status = 400;
    throw err;
  }
  const accountId = makeAccountId(username, gstin);
  const maxPhones = maxPhonesPerAccount();
  const now = new Date();

  const accounts = getAccountsCollection();
  const phones = getPhonesCollection();

  const existingLink = await phones.findOne({ phone: key });
  if (existingLink && existingLink.accountId !== accountId) {
    await unlinkPhone(key, existingLink.accountId);
  }

  let account = await accounts.findOne({ accountId });

  if (!account) {
    account = {
      accountId,
      username: username.trim(),
      passwordEnc: encryptSecret(password.trim()),
      gstin: gstin.trim().toUpperCase(),
      phones: [key],
      linkedAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };
    await accounts.insertOne(account);
  } else {
    const phoneList = [...(account.phones || [])];
    if (!phoneList.includes(key)) {
      if (phoneList.length >= maxPhones) {
        const err = new Error(
          `This account already has ${maxPhones} linked phone numbers. Remove one device via Logout before adding another.`
        );
        err.status = 400;
        throw err;
      }
      phoneList.push(key);
    }

    await accounts.updateOne(
      { accountId },
      {
        $set: {
          username: username.trim(),
          passwordEnc: encryptSecret(password.trim()),
          gstin: gstin.trim().toUpperCase(),
          phones: phoneList,
          updatedAt: now,
          lastLoginAt: now,
        },
      }
    );
    account.phones = phoneList;
  }

  await phones.updateOne(
    { phone: key },
    {
      $set: {
        phone: key,
        accountId,
        username: username.trim(),
        gstin: gstin.trim().toUpperCase(),
        linkedAt: existingLink?.linkedAt || now,
        lastLoginAt: now,
      },
    },
    { upsert: true }
  );

  logger.info("whatsapp", "User saved to MongoDB", {
    phone: key,
    accountId,
    username: username.trim(),
    gstin: gstin.trim().toUpperCase(),
    phoneCount: account.phones?.length ?? 1,
  });
}

async function unlinkPhone(phone, accountId) {
  const accounts = getAccountsCollection();
  const phones = getPhonesCollection();

  await phones.deleteOne({ phone });

  const account = await accounts.findOne({ accountId });
  if (!account) return;

  const remaining = (account.phones || []).filter((p) => p !== phone);
  if (remaining.length === 0) {
    await accounts.deleteOne({ accountId });
    logger.info("whatsapp", "Account removed from MongoDB (no phones left)", { accountId });
    return;
  }

  await accounts.updateOne({ accountId }, { $set: { phones: remaining, updatedAt: new Date() } });
}

export async function deletePhoneMapping(phone) {
  requireMongo();
  const key = normalizePhone(phone);
  const link = await getPhonesCollection().findOne({ phone: key });
  if (!link) return false;

  await unlinkPhone(key, link.accountId);
  logger.info("whatsapp", "Phone unlinked from MongoDB", { phone: key, accountId: link.accountId });
  return true;
}

export async function listPhonesForCredentials(username, gstin) {
  requireMongo();
  const accountId = makeAccountId(username, gstin);
  const account = await getAccountsCollection().findOne({ accountId });
  return account ? [...(account.phones || [])] : [];
}

export async function listAllLinkedUsers({ limit = 100 } = {}) {
  requireMongo();
  return getPhonesCollection()
    .find({}, { projection: { passwordEnc: 0 } })
    .sort({ lastLoginAt: -1 })
    .limit(limit)
    .toArray();
}
