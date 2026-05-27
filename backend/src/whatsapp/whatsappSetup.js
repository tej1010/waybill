import { getAccessToken, isWhatsAppConfigured } from "./whatsappApi.js";
import { logger } from "../utils/logger.js";

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";

async function graphGet(path, token) {
  const url = `https://graph.facebook.com/${API_VERSION}${path}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function graphPost(path, token, body) {
  const url = `https://graph.facebook.com/${API_VERSION}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function verifyPhoneNumberId(token, phoneNumberId) {
  const { response, data } = await graphGet(`/${phoneNumberId}`, token);
  if (!response.ok) {
    const expired = data.error?.code === 190;
    logger.error("whatsapp", "WHATSAPP_TOKEN invalid — bot cannot reply on WhatsApp", {
      status: response.status,
      error: data.error,
      action:
        expired
          ? "Token expired. Meta → Developers → your app → WhatsApp → API Setup → create new token → update WHATSAPP_TOKEN in .env → restart npm run dev"
          : "Check WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env",
    });
    return null;
  }
  logger.info("whatsapp", "Phone number OK", {
    id: phoneNumberId,
    display: data.display_phone_number,
    verifiedName: data.verified_name,
  });
  return data;
}

async function getAppAndWabaIds(token) {
  const appId = process.env.WHATSAPP_APP_ID?.trim();
  const wabaId = process.env.WHATSAPP_WABA_ID?.trim();
  if (appId && wabaId) return { appId, wabaId };

  const { response, data } = await graphGet(
    `/debug_token?input_token=${encodeURIComponent(token)}`,
    token
  );

  if (!response.ok) {
    logger.warn("whatsapp", "Could not debug token", { error: data.error });
    return { appId: appId || null, wabaId: wabaId || null };
  }

  const resolvedAppId = appId || data.data?.app_id;
  let resolvedWabaId = wabaId;
  const scopes = data.data?.granular_scopes || [];
  for (const scope of scopes) {
    if (
      scope.scope?.includes("whatsapp") &&
      scope.target_ids?.length
    ) {
      resolvedWabaId = resolvedWabaId || scope.target_ids[0];
    }
  }

  return { appId: resolvedAppId, wabaId: resolvedWabaId };
}

async function subscribeWaba(token, wabaId) {
  const { response, data } = await graphPost(`/${wabaId}/subscribed_apps`, token, {});
  if (response.ok && data.success) {
    logger.info("whatsapp", "WABA subscribed_apps OK", { wabaId });
    return true;
  }
  logger.warn("whatsapp", "WABA subscribed_apps", {
    wabaId,
    status: response.status,
    data,
  });
  return false;
}

async function registerAppWebhook(token, appId, callbackUrl, verifyToken) {
  const params = new URLSearchParams({
    access_token: token,
    object: "whatsapp_business_account",
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: "messages",
  });

  const url = `https://graph.facebook.com/${API_VERSION}/${appId}/subscriptions?${params}`;
  const response = await fetch(url, { method: "POST" });
  const data = await response.json().catch(() => ({}));

  if (response.ok) {
    logger.info("whatsapp", "App webhook subscription registered", {
      appId,
      callbackUrl,
    });
    return true;
  }

  logger.warn("whatsapp", "App webhook subscription", {
    status: response.status,
    error: data.error,
  });
  return false;
}

export async function bootstrapWhatsApp() {
  if (!isWhatsAppConfigured()) {
    logger.warn("whatsapp", "Bootstrap skipped — set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID");
    return;
  }

  const token = getAccessToken();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  const publicUrl = process.env.PUBLIC_WEBHOOK_URL?.trim()?.replace(/\/$/, "");

  logger.info("whatsapp", "━━━━ Bootstrap starting ━━━━");

  await verifyPhoneNumberId(token, phoneNumberId);

  const { appId, wabaId } = await getAppAndWabaIds(token);
  logger.info("whatsapp", "IDs resolved", { appId, wabaId });

  if (wabaId) {
    await subscribeWaba(token, wabaId);
  }

  if (publicUrl && appId && verifyToken) {
    const callbackUrl = `${publicUrl}/api/whatsapp/webhook`;
    await registerAppWebhook(token, appId, callbackUrl, verifyToken);
    logger.info("whatsapp", "Webhook URL for Meta", { callbackUrl });
  } else if (!publicUrl) {
    logger.warn(
      "whatsapp",
      "Set PUBLIC_WEBHOOK_URL in .env (your ngrok URL) to auto-register webhook on startup"
    );
  }

  logger.info("whatsapp", "━━━━ Bootstrap done ━━━━");
  logger.info("whatsapp", "To test: message the business number in WhatsApp, or run POST /api/whatsapp/test");
}
