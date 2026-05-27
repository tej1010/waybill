const DEFAULT_SANDBOX_BASE_URL = "https://api.sandbox.co.in";

export function getSandboxBaseUrl() {
  const base = process.env.SANDBOX_BASE_URL?.trim() || DEFAULT_SANDBOX_BASE_URL;
  return base.replace(/\/$/, "");
}

export function getSandboxJwtUrl() {
  return `${getSandboxBaseUrl()}/authenticate`;
}

export function getSandboxTaxPayerAuthUrl() {
  return `${getSandboxBaseUrl()}/gst/compliance/e-way-bill/tax-payer/authenticate`;
}
