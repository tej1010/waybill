export const EXTN_REASONS = {
  1: "Natural calamity",
  2: "Law and order",
  3: "Transshipment",
  4: "Accident",
  5: "Others",
};

export const EXTEND_TRANS_MODES = {
  1: "Road",
  2: "Rail",
  3: "Air",
  5: "In Transit",
};

const TRANS_DOC_DATE_PATTERN = /^[0-3][0-9]\/[0-1][0-9]\/[2][0][1-2][0-9]$/;

export function todayTransDocDate() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function validateTransDocDate(value) {
  const date = String(value ?? "").trim();
  if (!TRANS_DOC_DATE_PATTERN.test(date)) {
    return "Date must be DD/MM/YYYY (e.g. 12/06/2026)";
  }
  return null;
}

export function parseExtendReasonInput(input) {
  const key = String(input ?? "").trim().toLowerCase();
  const map = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    extn_1: 1,
    extn_2: 2,
    extn_3: 3,
    extn_4: 4,
    extn_5: 5,
  };
  return map[key] ?? null;
}

export function parseExtendTransModeInput(input) {
  const key = String(input ?? "").trim().toLowerCase();
  const map = {
    1: "1",
    2: "2",
    3: "3",
    5: "5",
    extend_mode_1: "1",
    extend_mode_2: "2",
    extend_mode_3: "3",
    extend_mode_5: "5",
    road: "1",
    rail: "2",
    air: "3",
  };
  return map[key] ?? null;
}
