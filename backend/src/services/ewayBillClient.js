import { getSandboxBaseUrl } from "../config/sandbox.js";
import { logger } from "../utils/logger.js";

export async function callEwayBillApi({ method, path, ewbAccessToken, body }) {
  const apiKey = process.env.SANDBOX_API_KEY?.trim();
  if (!apiKey) {
    const err = new Error("SANDBOX_API_KEY is not configured");
    err.status = 500;
    throw err;
  }
  if (!ewbAccessToken?.trim()) {
    const err = new Error("E-Way Bill access token is required");
    err.status = 401;
    throw err;
  }

  const url = `${getSandboxBaseUrl()}${path}`;

  logger.info("eway-bill", `${method} ${path}`, {
    hasBody: Boolean(body),
  });

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      authorization: ewbAccessToken.trim(),
      "x-api-key": apiKey,
      "x-api-version": process.env.SANDBOX_API_VERSION || "1.0.0",
      "x-source": process.env.SANDBOX_API_SOURCE || "primary",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawText = await response.text();
  let data;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { raw: rawText };
  }

  logger.info("eway-bill", `Response ${method} ${path}`, {
    httpStatus: response.status,
    code: data.code,
    status: data.data?.status,
    errorCodes: data.data?.error?.errorCodes,
  });

  return { response, data };
}

export function parseEwayBillResult(data) {
  const status = data.data?.status;
  const ok = status === "1" || status === 1;
  const errorCode = data.data?.error?.errorCodes;
  return { ok, errorCode, result: data.data };
}
