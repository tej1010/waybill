import { logger } from "../utils/logger.js";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";

export function getAccessToken() {
  return (
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() || process.env.WHATSAPP_TOKEN?.trim()
  );
}

export function isWhatsAppConfigured() {
  return Boolean(getAccessToken() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim());
}

export async function checkWhatsAppTokenHealth() {
  const token = getAccessToken();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!token || !phoneNumberId) {
    return { ok: false, reason: "WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set in .env" };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const expired = data.error?.code === 190 || data.error?.error_subcode === 463;
    return {
      ok: false,
      httpStatus: response.status,
      message: data.error?.message || "Token validation failed",
      code: data.error?.code,
      expired,
      fix: expired
        ? "Generate a new access token in Meta Developer Console → WhatsApp → API Setup, update WHATSAPP_TOKEN in .env, restart server."
        : "Check WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env",
    };
  }

  return {
    ok: true,
    phoneNumberId,
    displayPhone: data.display_phone_number,
    verifiedName: data.verified_name,
  };
}

async function sendWhatsAppPayload(to, payload) {
  const token = getAccessToken();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

  if (!token || !phoneNumberId) {
    logger.warn("whatsapp", "WhatsApp not configured — message not sent", { to });
    return { skipped: true };
  }

  const url = `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: to.replace(/\D/g, ""),
      ...payload,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    logger.error("whatsapp", "◀ Send FAILED", {
      to,
      type: payload.type,
      status: response.status,
      error: data.error,
    });
    throw new Error(data.error?.message || "Failed to send WhatsApp message");
  }

  logger.info("whatsapp", "◀ Reply sent to WhatsApp", {
    to,
    type: payload.type,
    messageId: data.messages?.[0]?.id,
  });

  return data;
}

export async function sendWhatsAppText(to, text) {
  return sendWhatsAppPayload(to, {
    type: "text",
    text: { preview_url: false, body: text },
  });
}

export async function sendInteractiveList(to, bodyText, buttonText, rows) {
  const actionRows = rows.slice(0, 10).map((row) => ({
    id: String(row.id).slice(0, 200),
    title: String(row.title).slice(0, 24),
    ...(row.description ? { description: String(row.description).slice(0, 72) } : {}),
  }));

  return sendWhatsAppPayload(to, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText.slice(0, 1024) },
      action: {
        button: String(buttonText).slice(0, 20),
        sections: [{ title: "Options", rows: actionRows }],
      },
    },
  });
}

export async function sendInteractiveButtons(to, bodyText, buttons) {
  const actionButtons = buttons.slice(0, 3).map((btn) => ({
    type: "reply",
    reply: {
      id: String(btn.id).slice(0, 256),
      title: String(btn.title).slice(0, 20),
    },
  }));

  return sendWhatsAppPayload(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText.slice(0, 1024) },
      action: { buttons: actionButtons },
    },
  });
}
