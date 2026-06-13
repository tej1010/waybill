import { MongoClient } from "mongodb";
import { logger } from "../utils/logger.js";

let client = null;
let db = null;

const ACCOUNTS_COLLECTION = "whatsapp_accounts";
const PHONES_COLLECTION = "whatsapp_phones";
const OPERATIONS_COLLECTION = "ewb_operations";

export function getAccountsCollection() {
  if (!db) {
    throw new Error("MongoDB is not connected. Set MONGODB_URI in .env");
  }
  return db.collection(ACCOUNTS_COLLECTION);
}

export function getPhonesCollection() {
  if (!db) {
    throw new Error("MongoDB is not connected. Set MONGODB_URI in .env");
  }
  return db.collection(PHONES_COLLECTION);
}

export function getOperationsCollection() {
  if (!db) {
    throw new Error("MongoDB is not connected. Set MONGODB_URI in .env");
  }
  return db.collection(OPERATIONS_COLLECTION);
}

export function isMongoConnected() {
  return Boolean(db);
}

async function ensureIndexes() {
  await getAccountsCollection().createIndex({ accountId: 1 }, { unique: true });
  await getAccountsCollection().createIndex({ gstin: 1 });
  await getAccountsCollection().createIndex({ username: 1 });
  await getPhonesCollection().createIndex({ phone: 1 }, { unique: true });
  await getPhonesCollection().createIndex({ accountId: 1 });
  await getOperationsCollection().createIndex({ createdAt: -1 });
  await getOperationsCollection().createIndex({ username: 1, createdAt: -1 });
  await getOperationsCollection().createIndex({ gstin: 1, createdAt: -1 });
}

export async function connectMongoDB() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    logger.warn("mongo", "MONGODB_URI not set — phone user records will not persist");
    return false;
  }

  if (db) return true;

  const dbName = process.env.MONGODB_DB_NAME?.trim() || "eway";

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  await ensureIndexes();

  logger.info("mongo", "Connected", { database: dbName });
  return true;
}

export async function closeMongoDB() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info("mongo", "Connection closed");
  }
}
