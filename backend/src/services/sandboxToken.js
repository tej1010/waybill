import { getSandboxJwtUrl } from "../config/sandbox.js";
import { logger, maskSecret } from "../utils/logger.js";

let cachedToken = null;
let cachedUntil = 0;

function getApiCredentials() {
  const apiKey = process.env.SANDBOX_API_KEY?.trim();
  const apiSecret =
    process.env.SANDBOX_API_SECRET?.trim() ||
    process.env.SANDBOX_AUTHORIZATION?.trim();

  return { apiKey, apiSecret };
}

export async function getSandboxAccessToken() {
  const manualToken = process.env.SANDBOX_ACCESS_TOKEN?.trim();
  if (manualToken) {
    logger.info("sandbox-jwt", "Using SANDBOX_ACCESS_TOKEN from .env");
    return manualToken;
  }

  if (cachedToken && Date.now() < cachedUntil) {
    logger.info("sandbox-jwt", "Using cached Sandbox JWT");
    return cachedToken;
  }

  const { apiKey, apiSecret } = getApiCredentials();

  if (!apiKey || !apiSecret) {
    const err = new Error(
      "Set SANDBOX_API_KEY and SANDBOX_API_SECRET in root .env (get JWT from Sandbox dashboard or /authenticate)"
    );
    err.status = 500;
    throw err;
  }

  const jwtUrl = getSandboxJwtUrl();

  logger.info("sandbox-jwt", "Fetching Sandbox JWT", {
    url: jwtUrl,
    apiKeyPreview: maskSecret(apiKey),
    apiSecretPreview: maskSecret(apiSecret),
  });

  const response = await fetch(jwtUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
      "x-api-secret": apiSecret,
      "x-api-version": process.env.SANDBOX_API_VERSION || "1.0.0",
    },
  });

  const rawText = await response.text();
  let body;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { raw: rawText };
  }

  logger.info("sandbox-jwt", "Sandbox JWT response", {
    httpStatus: response.status,
    code: body.code,
    transaction_id: body.transaction_id,
  });

  if (!response.ok || body.code !== 200 || !body.data?.access_token) {
    logger.error("sandbox-jwt", "Failed to obtain Sandbox JWT", { body });
    const err = new Error(
      body.message || "Failed to authenticate with Sandbox (check API key & secret)"
    );
    err.status = response.status || 502;
    err.data = body;
    throw err;
  }

  cachedToken = body.data.access_token;
  cachedUntil = Date.now() + 23 * 60 * 60 * 1000;

  logger.info("sandbox-jwt", "Sandbox JWT obtained", {
    tokenPreview: maskSecret(cachedToken),
    validForHours: 23,
  });

  return cachedToken;
}

export function clearSandboxTokenCache() {
  cachedToken = null;
  cachedUntil = 0;
}
