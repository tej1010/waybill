const EXTEND_ERRORS = {
  382: "Validity can be only extended in last 8 hours",
  705: "Invalid transit type",
  311: "E-Way Bill validity has lapsed — cannot extend",
};

export function ewbExtendErrorCode(apiBody) {
  const raw = apiBody?.data?.error?.errorCodes;
  if (!raw) return null;
  return String(raw).replace(/,$/, "").trim();
}

export function formatEwbExtendFailure(apiBody) {
  const code = ewbExtendErrorCode(apiBody);
  if (code && EXTEND_ERRORS[code]) {
    return `${EXTEND_ERRORS[code]} (error ${code})`;
  }
  if (code) {
    return `Extension failed (error ${code})`;
  }
  return "Failed to extend e-Way Bill validity";
}
