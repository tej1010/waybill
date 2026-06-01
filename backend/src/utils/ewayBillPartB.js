export const TRANS_MODE_ROAD = "1";
export const TRANS_MODE_RAIL = "2";
export const TRANS_MODE_AIR = "3";
export const TRANS_MODE_SHIP = "4";

export const PART_B_REASONS = {
  1: "Due to Breakdown",
  2: "Due to Transshipment",
  3: "Others",
};

export const DEFAULT_PART_B_REASON_CODE = "2";

export function isRoadMode(transMode) {
  return String(transMode) === TRANS_MODE_ROAD;
}

export function requiresTransDocNo(transMode) {
  return [TRANS_MODE_RAIL, TRANS_MODE_AIR, TRANS_MODE_SHIP].includes(String(transMode));
}

export function todayTransDocDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function reasonRemarksForCode(code) {
  return PART_B_REASONS[String(code)] || String(code);
}

export function reasonRemForPartB(transMode, reasonCode) {
  const mode = String(transMode);
  if (mode === TRANS_MODE_RAIL) return "Rail Transport";
  if (mode === TRANS_MODE_AIR) return "Air Transport";
  if (mode === TRANS_MODE_SHIP) return "Ship Transport";
  return reasonRemarksForCode(reasonCode);
}
