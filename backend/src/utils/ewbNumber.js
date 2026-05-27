export const EWB_NUMBER_LENGTH = 12;

export const EWB_INCORRECT_MESSAGE = "Incorrect e-Way Bill number. Please enter again.";

export function normalizeEwbDigits(input) {
  return String(input ?? "").replace(/\D/g, "");
}

export function parseEwbInput(input) {
  const trimmed = String(input ?? "").trim();

  if (!trimmed) {
    return { error: "E-Way Bill number is required" };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      error: `Only numbers are allowed. Enter exactly ${EWB_NUMBER_LENGTH} digits.`,
    };
  }

  if (trimmed.length !== EWB_NUMBER_LENGTH) {
    return {
      error: `E-Way Bill number must be exactly ${EWB_NUMBER_LENGTH} digits. Please re-enter.`,
    };
  }

  return { digits: trimmed };
}

export function isValidEwbNumber(input) {
  return parseEwbInput(input).digits != null;
}

export function validateEwbNumber(input) {
  return parseEwbInput(input).error ?? null;
}
