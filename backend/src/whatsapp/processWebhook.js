import { handleIncomingMessage } from "./conversation.js";
import { extractMessageInput } from "./messageInput.js";
import { logWebhookPost } from "./webhookLog.js";
import { logger } from "../utils/logger.js";

export async function processWebhookBody(body) {
  const fakeReq = { body };
  logWebhookPost(fakeReq);

  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messages = value?.messages;

  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const metaPhoneId = value?.metadata?.phone_number_id;
  if (envPhoneId && metaPhoneId && envPhoneId !== metaPhoneId) {
    logger.error("whatsapp", "PHONE_NUMBER_ID mismatch — fix .env", {
      envPhoneId,
      metaPhoneId,
    });
  }

  if (!messages?.length) {
    return { processed: 0 };
  }

  let processed = 0;
  for (const message of messages) {
    const { input, kind, title } = extractMessageInput(message);

    logger.info("whatsapp", "Processing message item", {
      id: message.id,
      type: message.type,
      kind,
      from: message.from,
      input,
      title,
    });

    if (!input) {
      logger.warn("whatsapp", "Unsupported message type", { type: message.type });
      continue;
    }

    const phone = message.from;

    logger.info("whatsapp", "▶ Incoming message", { from: phone, input, kind });

    await handleIncomingMessage(phone, input);
    processed += 1;

    logger.info("whatsapp", "▶ Finished handling message", { from: phone });
  }

  return { processed };
}
