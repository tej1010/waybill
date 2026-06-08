import { Router } from "express";
import { processWebhookBody } from "../whatsapp/processWebhook.js";
import { checkWhatsAppTokenHealth, isWhatsAppConfigured } from "../whatsapp/whatsappApi.js";
import { summarizeWebhookPayload } from "../whatsapp/webhookLog.js";
import { handleIncomingMessage } from "../whatsapp/conversation.js";
import { seedOnboardedUsers } from "../db/seedOnboardedUsers.js";
import { getRegistryStats } from "../db/registryStats.js";
import { isMongoConnected } from "../db/mongodb.js";
import { findOnboardedUser, syncOnboardedToRegistry } from "../whatsapp/onboardLookup.js";
import { getPhoneMapping } from "../whatsapp/phoneRegistry.js";
import { normalizePhone } from "../whatsapp/phoneRegistryUtils.js";
import { loginTaxPayer } from "../services/ewayAuth.js";
import { ewbErrorCode } from "../utils/ewbAuthErrors.js";
import { logger } from "../utils/logger.js";

const router = Router();

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && token && challenge) {
    if (token === verifyToken) {
      logger.info("whatsapp", "Webhook verified (Meta challenge OK)");
      return res.status(200).send(challenge);
    }
    logger.warn("whatsapp", "Webhook verify failed — verify token mismatch");
    return res.status(403).json({ error: "Invalid verify token" });
  }

  return res.status(200).json({
    status: "ok",
    message: "WhatsApp webhook is active.",
    configured: isWhatsAppConfigured(),
    verifyTokenSet: Boolean(verifyToken),
    publicUrl: process.env.PUBLIC_WEBHOOK_URL || null,
  });
});

router.post("/webhook", async (req, res) => {
  logger.info("whatsapp", "POST /webhook hit", {
    contentType: req.headers["content-type"],
    userAgent: req.headers["user-agent"]?.slice(0, 80),
  });

  res.sendStatus(200);
  logger.info("whatsapp", "Responded 200 OK to Meta (processing async)");

  try {
    await processWebhookBody(req.body);
  } catch (err) {
    logger.error("whatsapp", "Webhook processing error", {
      message: err.message,
      stack: err.stack,
    });
  }
});

router.post("/simulate", async (req, res) => {
  const phone = (req.body?.phone || "919999999999").replace(/\D/g, "");
  const text = req.body?.text || "hi";

  const sample = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "SIMULATED",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "0000000000",
                phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || "0",
              },
              messages: [
                {
                  from: phone,
                  id: `sim_${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: req.body?.asButton ? "interactive" : "text",
                  ...(req.body?.asButton
                    ? {
                        interactive: {
                          type: "button_reply",
                          button_reply: { id: text, title: text },
                        },
                      }
                    : { text: { body: text } }),
                },
              ],
            },
          },
        ],
      },
    ],
  };

  logger.info("whatsapp", "Simulating Meta webhook", { phone, text });
  const result = await processWebhookBody(sample);
  return res.json({ ok: true, ...result });
});

router.post("/sync-onboard", async (req, res) => {
  try {
    const phone = req.body?.phone ? normalizePhone(req.body.phone) : null;
    if (phone) {
      const synced = await syncOnboardedToRegistry(phone);
      return res.json({ ok: synced, phone, synced });
    }
    const result = await seedOnboardedUsers();
    return res.json({ ok: result.failed === 0, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

router.post("/test-auto-login", async (req, res) => {
  const phone = normalizePhone(req.body?.phone || "");
  if (!phone) {
    return res.status(400).json({ message: "Provide phone in body (e.g. 917990453769)" });
  }

  try {
    await syncOnboardedToRegistry(phone);
    const credentials =
      (await getPhoneMapping(phone).catch(() => null)) ||
      (() => {
        const entry = findOnboardedUser(phone);
        if (!entry) return null;
        return {
          username: entry.username?.trim(),
          password: entry.password?.trim(),
          gstin: entry.gstin?.trim()?.toUpperCase(),
        };
      })();

    if (!credentials?.username) {
      return res.status(404).json({
        ok: false,
        phone,
        message: "No onboarded user or registry entry for this phone",
      });
    }

    const auth = await loginTaxPayer(credentials);
    return res.json({
      ok: true,
      phone,
      username: auth.username,
      gstin: auth.gstin,
      message: "Portal login OK — auto-login should work after user sends hi",
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      phone,
      message: err.message,
      errorCode: ewbErrorCode(err),
      details: err.data?.data?.error || err.data?.message || null,
    });
  }
});

async function checkPortalLoginForPhone(phone) {
  await syncOnboardedToRegistry(phone);
  const credentials =
    (await getPhoneMapping(phone).catch(() => null)) ||
    (() => {
      const entry = findOnboardedUser(phone);
      if (!entry) return null;
      return {
        username: entry.username?.trim(),
        password: entry.password?.trim(),
        gstin: entry.gstin?.trim()?.toUpperCase(),
      };
    })();

  if (!credentials?.username) {
    return { checked: false, reason: "not_onboarded" };
  }

  try {
    const auth = await loginTaxPayer(credentials);
    return { checked: true, ok: true, username: auth.username, gstin: auth.gstin };
  } catch (err) {
    return {
      checked: true,
      ok: false,
      message: err.message,
      errorCode: ewbErrorCode(err),
    };
  }
}

router.post("/test", async (req, res) => {
  const phone = normalizePhone(req.body?.phone || process.env.WHATSAPP_TEST_PHONE || "");
  const text = req.body?.text || "hi";

  if (!phone) {
    return res.status(400).json({
      message: "Provide phone in body or set WHATSAPP_TEST_PHONE in .env (e.g. 919876543210)",
    });
  }

  logger.info("whatsapp", "Manual test trigger", { phone, text });

  try {
    const portalLogin = await checkPortalLoginForPhone(phone);
    await handleIncomingMessage(phone, text);
    return res.json({
      ok: true,
      message:
        portalLogin.checked && !portalLogin.ok
          ? "Bot processed message, but E-Way Bill portal login failed — see portalLogin"
          : "Processed — check logs and WhatsApp",
      portalLogin,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
});

router.get("/registry", async (_req, res) => {
  const stats = await getRegistryStats();
  res.json({
    mongodb: stats.connected ? "connected" : "not configured",
    collections: {
      whatsapp_accounts: stats.accounts,
      whatsapp_phones: stats.phones,
    },
    records: stats.samplePhones.map((row) => ({
      phone: row.phone,
      userId: row.username,
      gstin: row.gstin,
      accountId: row.accountId,
      lastLoginAt: row.lastLoginAt,
      passwordStored: stats.connected
        ? "encrypted in whatsapp_accounts.passwordEnc"
        : "n/a",
    })),
  });
});

router.get("/status", async (_req, res) => {
  const tokenHealth = await checkWhatsAppTokenHealth();
  res.json({
    configured: isWhatsAppConfigured(),
    canSendMessages: tokenHealth.ok,
    tokenHealth,
    mongodb: isMongoConnected() ? "connected" : "not configured",
    verifyTokenSet: Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim()),
    publicWebhookUrl: process.env.PUBLIC_WEBHOOK_URL
      ? `${process.env.PUBLIC_WEBHOOK_URL}/api/whatsapp/webhook`
      : null,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    checklist: [
      "PUBLIC_WEBHOOK_URL in .env = your ngrok URL (no trailing slash)",
      "Meta → Webhook → subscribed to messages",
      "Your phone added as test recipient",
      "Message business number in WhatsApp app",
      "Watch logs: POST /webhook hit",
    ],
  });
});

router.get("/debug/last-payload-shape", (_req, res) => {
  res.json({
    expectedShape: summarizeWebhookPayload({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "..." },
                messages: [{ from: "91...", type: "text", text: { body: "hi" } }],
              },
            },
          ],
        },
      ],
    }),
  });
});

export default router;
