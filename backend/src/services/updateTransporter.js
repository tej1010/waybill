import { callEwayBillApi, parseEwayBillResult } from "./ewayBillClient.js";
import { normalizeTransporterId, validateTransporterId } from "../utils/transporterId.js";
import { validateEwbNumber } from "../utils/ewbNumber.js";

const TRANSPORTER_ERRORS = {
  222: "Invalid transporter ID (error 222).",
  446: "Transport details cannot be updated — E-Way Bill was generated on the NIC portal (error 446).",
};

function transporterErrorMessage(errorCode) {
  const code = String(errorCode || "").replace(/,$/, "").trim();
  return TRANSPORTER_ERRORS[code] || `Update transporter failed (error ${code})`;
}

export function validateUpdateTransporterInput(body, ewbNo) {
  const ewbError = validateEwbNumber(ewbNo);
  if (ewbError) return ewbError;

  const transporterId = normalizeTransporterId(body.transporterId);
  if (!transporterId) return "transporterId is required";
  if (!validateTransporterId(transporterId)) {
    return "transporterId must be a 15-character GSTIN or TRANSIN";
  }

  return null;
}

export async function updateTransporter(ewbNo, ewbAccessToken, body) {
  const validationError = validateUpdateTransporterInput(body, ewbNo);
  if (validationError) {
    const err = new Error(validationError);
    err.status = 400;
    throw err;
  }

  const transporterId = normalizeTransporterId(body.transporterId);
  const payload = {
    ewbNo: Number(body.ewbNo ?? ewbNo),
    transporterId,
  };

  const { response, data } = await callEwayBillApi({
    method: "PUT",
    path: `/gst/compliance/e-way-bill/consignor/bill/${ewbNo}/transporter`,
    ewbAccessToken,
    body: payload,
  });

  const { ok, errorCode, result } = parseEwayBillResult(data);

  if (!response.ok) {
    const err = new Error(data.message || "Failed to update transporter");
    err.status = response.status;
    err.data = data;
    throw err;
  }

  if (!ok) {
    const err = new Error(transporterErrorMessage(errorCode));
    err.status = 400;
    err.data = data;
    throw err;
  }

  return {
    ewayBillNo: result?.data?.ewayBillNo,
    transUpdateDate: result?.data?.transUpdateDate,
    transporterId: result?.data?.transporterId || transporterId,
    alert: result?.alert,
    transaction_id: data.transaction_id,
  };
}
