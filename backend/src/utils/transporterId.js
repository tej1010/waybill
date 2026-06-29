// Sandbox schema: 15-digit Transporter GSTIN or TRANSIN
// https://developer.sandbox.co.in/api-reference/gst/compliance/endpoints/e-way-bill/consignor/update_transporter
const TRANSPORTER_ID_PATTERN = /^[0-9]{2}[0-9A-Z]{13}$/;

export function validateTransporterId(value) {
  return TRANSPORTER_ID_PATTERN.test(String(value ?? "").trim().toUpperCase());
}

export function normalizeTransporterId(value) {
  return String(value ?? "").trim().toUpperCase();
}
