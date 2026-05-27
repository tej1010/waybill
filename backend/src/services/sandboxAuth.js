import { getSandboxTaxPayerAuthUrl } from "../config/sandbox.js";
import { logger, maskSecret } from "../utils/logger.js";
import { getSandboxAccessToken } from "./sandboxToken.js";

export async function authenticateTaxPayer({ username, password, gstin }) {
  const apiKey = process.env.SANDBOX_API_KEY?.trim();

  if (!apiKey) {
    const err = new Error("SANDBOX_API_KEY is not configured in .env");
    err.status = 500;
    throw err;
  }

  const sandboxJwt = await getSandboxAccessToken();
  const authUrl = getSandboxTaxPayerAuthUrl();

  logger.info("sandbox", "E-Way Bill authenticate request", {
    url: authUrl,
    username,
    gstin,
    apiKeyPreview: maskSecret(apiKey),
    jwtPreview: maskSecret(sandboxJwt),
    apiVersion: process.env.SANDBOX_API_VERSION || "1.0.0",
    apiSource: process.env.SANDBOX_API_SOURCE || "primary",
  });

  const payload = { username, password, gstin };

  let response;
  try {
    response = await fetch(authUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: sandboxJwt,
        "x-api-key": apiKey,
        "x-api-version": process.env.SANDBOX_API_VERSION || "1.0.0",
        "x-source": process.env.SANDBOX_API_SOURCE || "primary",
      },
      body: JSON.stringify(payload),
    });
  } catch (networkErr) {
    logger.error("sandbox", "Network error calling Sandbox API", {
      message: networkErr.message,
    });
    const err = new Error(`Sandbox API unreachable: ${networkErr.message}`);
    err.status = 502;
    throw err;
  }

  const rawText = await response.text();
  let body;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { raw: rawText };
  }

  logger.info("sandbox", "Sandbox API response", {
    httpStatus: response.status,
    ok: response.ok,
    body,
  });

  if (!response.ok) {
    logger.warn("sandbox", "Sandbox returned HTTP error", {
      httpStatus: response.status,
      body,
    });
    const err = new Error(
      body.message || body.error || `Sandbox API error (HTTP ${response.status})`
    );
    err.status = response.status;
    err.data = body;
    throw err;
  }

  if (body.code !== 200 || body.data?.Status !== 1) {
    logger.warn("sandbox", "E-Way Bill auth failed", {
      code: body.code,
      status: body.data?.Status,
      body,
    });
  } else {
    logger.info("sandbox", "E-Way Bill authentication successful", {
      gstin,
      transaction_id: body.transaction_id,
      expiry: body.data?.expiry,
    });
  }

  return body;
}
