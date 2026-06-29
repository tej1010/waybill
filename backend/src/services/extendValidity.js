import { callEwayBillApi, parseEwayBillResult } from "./ewayBillClient.js";
import { formatEwbExtendFailure } from "../utils/ewbExtendErrors.js";
import { validateTransDocDate } from "../utils/ewayExtend.js";
import { validateEwbNumber } from "../utils/ewbNumber.js";

export function validateExtendBody(body, ewbNo) {
  const required = [
    "fromPlace",
    "fromState",
    "fromPincode",
    "remainingDistance",
    "transMode",
    "extnRsnCode",
    "extnRemarks",
  ];
  for (const field of required) {
    if (body[field] === undefined || body[field] === "") {
      return `${field} is required`;
    }
  }
  const ewbError = validateEwbNumber(ewbNo);
  if (ewbError) return ewbError;
  if (body.transDocDate) {
    const dateError = validateTransDocDate(body.transDocDate);
    if (dateError) return dateError;
  }
  return null;
}

export function buildExtendPayload(body, ewbNo) {
  const payload = {
    ewbNo: Number(body.ewbNo ?? ewbNo),
    fromPlace: String(body.fromPlace).trim(),
    fromState: Number(body.fromState),
    fromPincode: Number(body.fromPincode),
    remainingDistance: Number(body.remainingDistance),
    transMode: String(body.transMode).trim(),
    extnRsnCode: Number(body.extnRsnCode),
    extnRemarks: String(body.extnRemarks).trim(),
  };

  if (body.vehicleNo?.trim()) payload.vehicleNo = body.vehicleNo.trim().toUpperCase();
  if (body.transDocNo?.trim()) payload.transDocNo = body.transDocNo.trim();
  if (body.transDocDate?.trim()) payload.transDocDate = body.transDocDate.trim();
  if (body.consignmentStatus?.trim()) payload.consignmentStatus = body.consignmentStatus.trim();
  if (body.transitType?.trim()) payload.transitType = body.transitType.trim();
  if (body.addressLine1?.trim()) payload.addressLine1 = body.addressLine1.trim();
  if (body.addressLine2?.trim()) payload.addressLine2 = body.addressLine2.trim();
  if (body.addressLine3?.trim()) payload.addressLine3 = body.addressLine3.trim();

  return payload;
}

export async function extendEwayBillValidity(ewbNo, ewbAccessToken, body) {
  const validationError = validateExtendBody(body, ewbNo);
  if (validationError) {
    const err = new Error(validationError);
    err.status = 400;
    throw err;
  }

  const payload = buildExtendPayload(body, ewbNo);

  const { response, data } = await callEwayBillApi({
    method: "POST",
    path: `/gst/compliance/e-way-bill/transporter/bill/${ewbNo}/extend`,
    ewbAccessToken,
    body: payload,
  });

  const { ok, errorCode, result } = parseEwayBillResult(data);

  if (!response.ok) {
    const err = new Error(data.message || "Failed to extend validity");
    err.status = response.status;
    err.data = data;
    throw err;
  }

  if (!ok) {
    const err = new Error(formatEwbExtendFailure({ data }));
    err.status = 400;
    err.data = data;
    throw err;
  }

  return {
    ewayBillNo: result?.data?.ewayBillNo,
    updatedDate: result?.data?.updatedDate,
    validUpto: result?.data?.validUpto,
    alert: result?.alert,
    transaction_id: data.transaction_id,
  };
}
