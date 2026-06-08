const EWB_AUTH_ERRORS = {
  108: "Invalid User ID or password for the E-Way Bill portal.",
  111: "GSTIN is not registered for this API provider.",
};

export function ewbErrorCode(err) {
  const raw = err?.data?.data?.error?.errorCodes;
  if (!raw) return null;
  return String(raw).replace(/,$/, "").trim();
}

export function formatEwbAuthFailure(err) {
  const code = ewbErrorCode(err);
  const hint = code && EWB_AUTH_ERRORS[code] ? EWB_AUTH_ERRORS[code] : err?.message;
  if (code === "108") {
    return (
      `❌ E-Way Bill login failed (error ${code}).\n\n` +
      `${hint}\n\n` +
      "Verify credentials at https://ewaybillgst.gov.in and ask admin to update the onboarded user on the server."
    );
  }
  if (code) {
    return `❌ E-Way Bill login failed (error ${code}).\n\n${hint || "Please contact support."}`;
  }
  return `❌ Auto-login failed.\n\n${err?.message || "Please contact support."}`;
}
