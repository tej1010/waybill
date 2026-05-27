import {
  EWB_INCORRECT_MESSAGE,
  parseEwbInput,
} from "../utils/ewbNumber.js";
import { fetchEwayBillDetails } from "./fetchEwayBill.js";

export async function verifyEwayBillNumber(ewbNo, ewbAccessToken) {
  const parsed = parseEwbInput(ewbNo);
  if (parsed.error) {
    const err = new Error(parsed.error);
    err.status = 400;
    err.code = "EWB_FORMAT";
    throw err;
  }

  try {
    await fetchEwayBillDetails(parsed.digits, ewbAccessToken);
    return parsed.digits;
  } catch {
    const err = new Error(EWB_INCORRECT_MESSAGE);
    err.status = 400;
    err.code = "EWB_NOT_FOUND";
    throw err;
  }
}
