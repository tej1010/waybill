import { callEwayBillApi, parseEwayBillResult } from "./ewayBillClient.js";

export async function fetchEwayBillDetails(ewbNo, ewbAccessToken) {
  const { response, data } = await callEwayBillApi({
    method: "GET",
    path: `/gst/compliance/e-way-bill/tax-payer/bill/${ewbNo}`,
    ewbAccessToken,
  });

  const { ok, errorCode } = parseEwayBillResult(data);

  if (!response.ok) {
    const err = new Error(data.message || "Failed to fetch e-Way Bill");
    err.status = response.status;
    err.data = data;
    throw err;
  }

  if (!ok) {
    const err = new Error(
      errorCode
        ? `E-Way Bill not available (error ${String(errorCode).replace(/,$/, "")})`
        : "E-Way Bill data not available"
    );
    err.status = 404;
    err.data = data;
    throw err;
  }

  return data.data?.data ?? data.data;
}
