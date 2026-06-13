import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getCorsOrigins } from "./config/cors.js";
import { getSandboxBaseUrl } from "./config/sandbox.js";
import authRouter from "./routes/auth.js";
import ewayBillRouter from "./routes/ewayBill.js";
import whatsappRouter from "./routes/whatsapp.js";
import statsRouter from "./routes/stats.js";
import { connectMongoDB, isMongoConnected } from "./db/mongodb.js";
import { migrateJsonRegistryToMongo } from "./db/migratePhoneRegistry.js";
import { seedOnboardedUsers } from "./db/seedOnboardedUsers.js";
import { getRegistryStats } from "./db/registryStats.js";
import { bootstrapWhatsApp } from "./whatsapp/whatsappSetup.js";
import { startWhatsAppEwbRefreshScheduler } from "./whatsapp/ewbSessionRefresh.js";
import { checkWhatsAppTokenHealth } from "./whatsapp/whatsappApi.js";
import { logger } from "./utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const frontendDist = path.resolve(repoRoot, "frontend/dist");

dotenv.config({ path: path.resolve(repoRoot, ".env") });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.set("trust proxy", 1);
}

const corsOrigins = getCorsOrigins();
app.use(
  cors({
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
  })
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      if (req.originalUrl?.includes("/api/whatsapp/webhook") && buf.length === 0) {
        logger.warn("whatsapp", "Webhook POST with empty body");
      }
    },
  })
);

app.use((req, res, next) => {
  const start = Date.now();
  logger.info("http", `→ ${req.method} ${req.originalUrl}`);
  res.on("finish", () => {
    logger.info("http", `← ${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

app.get("/api/health", async (_req, res) => {
  const registry = await getRegistryStats();
  const tokenHealth = await checkWhatsAppTokenHealth();
  const secret = process.env.PHONE_REGISTRY_SECRET?.trim() || "";
  const encryptionReady =
    secret.length >= 16 && !secret.toLowerCase().includes("change-this");

  res.json({
    status: "ok",
    environment: process.env.NODE_ENV || "development",
    message: "Backend is running",
    sandboxBaseUrl: getSandboxBaseUrl(),
    mongodb: registry.connected ? "connected" : "not configured",
    encryptionReady,
    whatsapp: {
      canSendMessages: tokenHealth.ok,
      tokenHealth,
    },
    whatsappUsers: {
      accounts: registry.accounts,
      phones: registry.phones,
    },
    frontendBundled: fs.existsSync(path.join(frontendDist, "index.html")),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/eway-bill", ewayBillRouter);
app.use("/api/whatsapp", whatsappRouter);
app.use("/api/stats", statsRouter);

function attachFrontend() {
  const indexHtml = path.join(frontendDist, "index.html");
  if (!fs.existsSync(indexHtml)) {
    logger.warn(
      "server",
      "frontend/dist not found — run npm run build before npm start for combined web+API hosting"
    );
    return;
  }

  app.use(express.static(frontendDist, { index: false }));

  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(indexHtml);
  });

  logger.info("server", "Serving frontend from frontend/dist");
}

attachFrontend();

const server = app.listen(PORT, async () => {
  try {
    await connectMongoDB();
    await migrateJsonRegistryToMongo();
    await seedOnboardedUsers();
    const registry = await getRegistryStats();
    logger.info("mongo", "User registry ready", {
      accounts: registry.accounts,
      phones: registry.phones,
    });
  } catch (err) {
    logger.error("mongo", "Startup connection failed", { message: err.message });
  }

  const secret = process.env.PHONE_REGISTRY_SECRET?.trim() || "";
  if (!secret || secret.length < 16) {
    logger.error("server", "PHONE_REGISTRY_SECRET missing or too short — cannot save user passwords");
  } else if (secret.toLowerCase().includes("change-this")) {
    logger.warn("server", "Replace PHONE_REGISTRY_SECRET in .env with a strong random value");
  }

  const tokenHealth = await checkWhatsAppTokenHealth();
  if (!tokenHealth.ok) {
    logger.error("whatsapp", "WhatsApp token invalid — users will not receive replies", {
      message: tokenHealth.message,
      fix: tokenHealth.fix,
    });
  }

  logger.info("server", `Listening on port ${PORT}`, {
    nodeEnv: process.env.NODE_ENV || "development",
    sandboxBaseUrl: getSandboxBaseUrl(),
    mongodb: isMongoConnected() ? "connected" : "not configured",
    corsOrigins,
    sandboxConfigured: Boolean(
      process.env.SANDBOX_API_KEY?.trim() &&
        (process.env.SANDBOX_API_SECRET?.trim() ||
          process.env.SANDBOX_AUTHORIZATION?.trim() ||
          process.env.SANDBOX_ACCESS_TOKEN?.trim())
    ),
    publicWebhook: process.env.PUBLIC_WEBHOOK_URL
      ? `${process.env.PUBLIC_WEBHOOK_URL.replace(/\/$/, "")}/api/whatsapp/webhook`
      : "(not set)",
    whatsappCanSend: tokenHealth.ok,
  });

  startWhatsAppEwbRefreshScheduler();

  try {
    await bootstrapWhatsApp();
  } catch (err) {
    logger.error("whatsapp", "Bootstrap failed", { message: err.message });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    logger.error("server", `Port ${PORT} is already in use. Set PORT in .env`);
  } else {
    logger.error("server", "Failed to start server", { message: err.message, code: err.code });
  }
  process.exit(1);
});
