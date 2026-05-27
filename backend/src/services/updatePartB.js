import { callEwayBillApi, parseEwayBillResult } from "./ewayBillClient.js";
import { fetchEwayBillDetails } from "./fetchEwayBill.js";
import {
  isRoadMode,
  reasonRemForPartB,
  requiresTransDocNo,
  todayTransDocDate,
} from "../utils/ewayBillPartB.js";
import { validateEwbNumber } from "../utils/ewbNumber.js";

export function validatePartBInput(body, ewbNo) {
  const ewbError = validateEwbNumber(ewbNo);
  if (ewbError) return ewbError;
  if (!body.transMode) return "transMode is required";
  if (!body.fromPlace?.trim()) return "fromPlace is required";
  if (!body.reasonCode) return "reasonCode is required";

  const mode = String(body.transMode);

  if (isRoadMode(mode) && !body.vehicleNo?.trim()) {
    return "vehicleNo is required for Road transport";
  }

  if (requiresTransDocNo(mode) && !body.transDocNo?.trim()) {
    return "transDocNo is required for Rail, Air, or Ship transport";
  }

  const docDate = body.transDocDate?.trim() || todayTransDocDate();
  if (!/^[0-3][0-9]\/[0-1][0-9]\/[2][0][0-9]{2}$/.test(docDate)) {
    return "transDocDate must be DD/MM/YYYY";
  }

  return null;
}

function buildPayload(body, ewbNo) {
  const reasonCode = String(body.reasonCode).trim();
  const transMode = String(body.transMode).trim();

  const payload = {
    ewbNo: Number(body.ewbNo ?? ewbNo),
    fromPlace: String(body.fromPlace).trim(),
    fromState: Number(body.fromState),
    reasonCode,
    reasonRem: String(
      body.reasonRem || reasonRemForPartB(transMode, reasonCode)
    ).trim(),
    transMode,
    transDocDate: (body.transDocDate || todayTransDocDate()).trim(),
  };

  if (isRoadMode(transMode)) {
    payload.vehicleNo = body.vehicleNo.trim().toUpperCase();
    payload.vehicleType = (body.vehicleType || "R").trim().toUpperCase();
  } else if (requiresTransDocNo(transMode)) {
    payload.transDocNo = body.transDocNo.trim();
  }

  return payload;
}

async function resolveFromState(body, ewbNo, ewbToken) {
  if (body.fromState !== undefined && body.fromState !== "" && body.fromState !== null) {
    return Number(body.fromState);
  }
  const bill = await fetchEwayBillDetails(ewbNo, ewbToken);
  const state = bill.fromStateCode ?? bill.actFromStateCode;
  if (state == null || Number.isNaN(Number(state))) {
    const err = new Error("Could not resolve fromState from e-Way Bill");
    err.status = 400;
    throw err;
  }
  return Number(state);
}

export async function updatePartBVehicle(ewbNo, ewbAccessToken, body) {
  const validationError = validatePartBInput(body, ewbNo);
  if (validationError) {
    const err = new Error(validationError);
    err.status = 400;
    throw err;
  }

  const fromState = await resolveFromState(body, ewbNo, ewbAccessToken);
  const payload = buildPayload({ ...body, fromState }, ewbNo);

  const { response, data } = await callEwayBillApi({
    method: "PUT",
    path: `/gst/compliance/e-way-bill/consignor/bill/${ewbNo}/vehicle`,
    ewbAccessToken,
    body: payload,
  });

  const { ok, errorCode, result } = parseEwayBillResult(data);

  if (!response.ok) {
    const err = new Error(data.message || "Failed to update vehicle details");
    err.status = response.status;
    err.data = data;
    throw err;
  }

  if (!ok) {
    const err = new Error(
      errorCode
        ? `Update failed (error ${String(errorCode).replace(/,$/, "")})`
        : "Failed to update Part B"
    );
    err.status = 400;
    err.data = data;
    throw err;
  }

  return {
    validUpto: result?.data?.validUpto,
    vehUpdDate: result?.data?.vehUpdDate,
    alert: result?.alert,
    transaction_id: data.transaction_id,
  };
}
