export const TRANS_MODE_ROAD = "1";
export const TRANS_MODE_RAIL = "2";
export const TRANS_MODE_AIR = "3";

export const PART_B_REASONS = {
  1: "Due to Breakdown",
  2: "Due to Transshipment",
  3: "Others",
};

export function isRoadMode(transMode) {
  return String(transMode) === TRANS_MODE_ROAD;
}

export function requiresTransDocNo(transMode) {
  return [TRANS_MODE_RAIL, TRANS_MODE_AIR, "4"].includes(String(transMode));
}

export function todayTransDocDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function reasonRemForPartB(transMode, reasonCode) {
  const mode = String(transMode);
  if (mode === TRANS_MODE_RAIL) return "Rail Transport";
  if (mode === TRANS_MODE_AIR) return "Air Transport";
  if (mode === "4") return "Ship Transport";
  return PART_B_REASONS[String(reasonCode)] || String(reasonCode);
}
