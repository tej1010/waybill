import { EWB_INCORRECT_MESSAGE, parseEwbInput } from "../utils/ewbNumber.js";

const API_BASE = import.meta.env.VITE_API_URL || "";

function authHeaders(accessToken, user) {
  const headers = { authorization: accessToken };
  if (user?.username) headers["X-Eway-Username"] = user.username;
  if (user?.gstin) headers["X-Eway-Gstin"] = user.gstin;
  return headers;
}

export async function verifyEwayBillNumber(ewbNo, accessToken) {
  const parsed = parseEwbInput(ewbNo);
  if (parsed.error) {
    const err = new Error(parsed.error);
    throw err;
  }

  const url = `${API_BASE}/api/eway-bill/${parsed.digits}`;
  const response = await fetch(url, { headers: authHeaders(accessToken) });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      response.status === 400 || response.status === 404
        ? EWB_INCORRECT_MESSAGE
        : data.message || EWB_INCORRECT_MESSAGE
    );
  }

  return parsed.digits;
}

export async function updateVehicleDetails(ewbNo, accessToken, payload, user) {
  const url = `${API_BASE}/api/eway-bill/${ewbNo}/vehicle`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken, user),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("[eway-bill] update failed", { status: response.status, data });
    const err = new Error(data.message || "Failed to update Part B");
    err.details = data.details;
    throw err;
  }

  return data;
}

export async function updateEwbTransporter(ewbNo, accessToken, payload, user) {
  const url = `${API_BASE}/api/eway-bill/${ewbNo}/transporter`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken, user),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.message || "Failed to update transporter");
    err.details = data.details;
    throw err;
  }

  return data;
}

export async function extendEwayBillValidity(ewbNo, accessToken, payload, user) {
  const url = `${API_BASE}/api/eway-bill/${ewbNo}/extend`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(accessToken, user),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(data.message || "Failed to extend validity");
    err.details = data.details;
    throw err;
  }

  return data;
}

export async function downloadEwayBillPdf(ewbNo, accessToken) {
  const url = `${API_BASE}/api/eway-bill/${ewbNo}/pdf`;
  const response = await fetch(url, { headers: authHeaders(accessToken) });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Failed to download PDF");
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = `eway-bill-${ewbNo}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
}
