import { authenticateTaxPayer } from "./sandboxAuth.js";

export function validateGstin(gstin) {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    String(gstin).trim().toUpperCase()
  );
}

export async function loginTaxPayer({ username, password, gstin }) {
  const result = await authenticateTaxPayer({
    username: username.trim(),
    password: password.trim(),
    gstin: gstin.trim().toUpperCase(),
  });

  const ewbStatus = result.data?.Status ?? result.data?.status;
  const ewbOk = ewbStatus === 1 || ewbStatus === "1";

  if (result.code !== 200 || !ewbOk) {
    const errorCode = result.data?.error?.errorCodes;
    const err = new Error(
      errorCode
        ? `E-Way Bill authentication failed (error ${errorCode})`
        : "Invalid username, password, or GSTIN"
    );
    err.status = 401;
    err.data = result;
    throw err;
  }

  return {
    access_token: result.data.access_token,
    expiry: result.data.expiry,
    transaction_id: result.transaction_id,
    username: username.trim(),
    gstin: gstin.trim().toUpperCase(),
  };
}
