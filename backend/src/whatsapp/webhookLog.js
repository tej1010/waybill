import { logger } from "../utils/logger.js";

export function summarizeWebhookPayload(body) {
  if (!body || typeof body !== "object") {
    return { empty: true };
  }

  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  return {
    object: body.object,
    entryId: entry?.id,
    field: change?.field,
    phoneNumberId: value?.metadata?.phone_number_id,
    displayPhone: value?.metadata?.display_phone_number,
    messageCount: value?.messages?.length ?? 0,
    statusCount: value?.statuses?.length ?? 0,
    errorsCount: value?.errors?.length ?? 0,
    messageTypes: value?.messages?.map((m) => ({
      type: m.type,
      from: m.from,
      id: m.id,
    })),
    statuses: value?.statuses?.map((s) => ({
      status: s.status,
      recipient: s.recipient_id,
    })),
  };
}

export function logWebhookPost(req) {
  const summary = summarizeWebhookPayload(req.body);

  logger.info("whatsapp", "━━━━ POST /webhook received ━━━━");
  logger.info("whatsapp", "Payload summary", summary);

  if (LOG_LEVEL_DEBUG()) {
    const raw = JSON.stringify(req.body, null, 2);
    const trimmed = raw.length > 4000 ? `${raw.slice(0, 4000)}…` : raw;
    logger.debug("whatsapp", "Full payload", { body: trimmed });
  }

  if (summary.messageCount === 0 && summary.statusCount > 0) {
    logger.info(
      "whatsapp",
      "Delivery/status update only (not a user message). Send a text from WhatsApp to the business number."
    );
  }

  if (summary.messageCount === 0 && summary.statusCount === 0) {
    logger.warn("whatsapp", "No messages or statuses in payload — check Meta webhook field subscription");
  }
}

function LOG_LEVEL_DEBUG() {
  const level = process.env.LOG_LEVEL || "debug";
  return level === "debug";
}
