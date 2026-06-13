import { getOperationsCollection, isMongoConnected } from "./mongodb.js";
import { logger } from "../utils/logger.js";

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(date) {
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildStatsFromRows(rows, windowDays) {
  const dateMap = new Map();
  const userMap = new Map();
  const todayKey = dateKey(new Date());

  for (const row of rows) {
    const day = dateKey(row.createdAt);
    const userKey = `${row.gstin}:${row.username}`;

    if (!dateMap.has(day)) {
      dateMap.set(day, { date: day, count: 0, users: new Map() });
    }
    const dayEntry = dateMap.get(day);
    dayEntry.count += 1;

    const dayUserKey = `${row.username}|${row.gstin}`;
    dayEntry.users.set(dayUserKey, {
      username: row.username,
      gstin: row.gstin,
      count: (dayEntry.users.get(dayUserKey)?.count || 0) + 1,
    });

    if (!userMap.has(userKey)) {
      userMap.set(userKey, {
        username: row.username,
        gstin: row.gstin,
        total: 0,
        byDate: new Map(),
      });
    }
    const userEntry = userMap.get(userKey);
    userEntry.total += 1;
    userEntry.byDate.set(day, (userEntry.byDate.get(day) || 0) + 1);
  }

  const byDateRaw = [...dateMap.values()]
    .map((entry) => ({
      date: entry.date,
      count: entry.count,
      users: [...entry.users.values()].sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const byDate = fillDateRange(byDateRaw, windowDays);

  const byUser = [...userMap.values()]
    .map((entry) => ({
      username: entry.username,
      gstin: entry.gstin,
      total: entry.total,
      byDate: fillDateRange(
        [...entry.byDate.entries()].map(([date, count]) => ({
          date,
          count,
          users: [],
        })),
        windowDays
      ).filter((d) => d.count > 0),
    }))
    .sort((a, b) => b.total - a.total);

  return {
    days: windowDays,
    summary: {
      totalOperations: rows.length,
      uniqueUsers: userMap.size,
      today: dateMap.get(todayKey)?.count || 0,
    },
    byDate,
    byUser,
  };
}

function fillDateRange(byDate, windowDays) {
  const map = new Map(byDate.map((entry) => [entry.date, entry]));
  const filled = [];

  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = dateKey(d);
    filled.push(
      map.get(key) || {
        date: key,
        count: 0,
        users: [],
      }
    );
  }

  return filled.sort((a, b) => b.date.localeCompare(a.date));
}

async function fetchOperationsSince(days) {
  const windowDays = Math.min(Math.max(Number(days) || 30, 1), 365);
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (windowDays - 1));

  const rows = await getOperationsCollection()
    .find({ success: true, createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .toArray();

  return { windowDays, rows };
}

export async function recordEwbOperation({
  username,
  gstin,
  ewbNo,
  operationType,
  source = "web",
  success = true,
}) {
  if (!success || !isMongoConnected()) return;

  const user = String(username || "").trim();
  const taxId = String(gstin || "").trim().toUpperCase();
  const billNo = String(ewbNo || "").replace(/\D/g, "");

  if (!user || !taxId || !billNo || !operationType) return;

  try {
    await getOperationsCollection().insertOne({
      username: user,
      gstin: taxId,
      ewbNo: billNo,
      operationType,
      source,
      success: true,
      createdAt: new Date(),
    });
  } catch (err) {
    logger.warn("stats", "Failed to record e-way bill operation", {
      username: user,
      ewbNo: billNo,
      message: err.message,
    });
  }
}

const EMPTY_PERIOD = {
  days: 0,
  summary: { totalOperations: 0, uniqueUsers: 0, today: 0 },
  byDate: [],
  byUser: [],
};

export async function getEwbDashboardStats({ days = 30 } = {}) {
  if (!isMongoConnected()) {
    return {
      connected: false,
      days,
      ...EMPTY_PERIOD,
      last7: { ...EMPTY_PERIOD, days: 7 },
      last30: { ...EMPTY_PERIOD, days: 30 },
    };
  }

  const mainDays = Math.min(Math.max(Number(days) || 30, 1), 365);
  const fetchDays = Math.max(mainDays, 30, 7);
  const { rows } = await fetchOperationsSince(fetchDays);

  const last7Rows = rows.filter((row) => {
    const since7 = new Date();
    since7.setHours(0, 0, 0, 0);
    since7.setDate(since7.getDate() - 6);
    return row.createdAt >= since7;
  });

  const last30Rows = rows.filter((row) => {
    const since30 = new Date();
    since30.setHours(0, 0, 0, 0);
    since30.setDate(since30.getDate() - 29);
    return row.createdAt >= since30;
  });

  const mainRows =
    mainDays <= 7
      ? last7Rows
      : mainDays <= 30
        ? last30Rows
        : rows;

  const period = buildStatsFromRows(mainRows, mainDays);

  return {
    connected: true,
    ...period,
    last7: buildStatsFromRows(last7Rows, 7),
    last30: buildStatsFromRows(last30Rows, 30),
  };
}
