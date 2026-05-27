export function logToTerminal(level, tag, message, meta) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [${tag}] ${message}`;
  if (meta !== undefined) {
    console.log(line);
    console.log(JSON.stringify(meta, null, 2));
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (tag, message, meta) => logToTerminal("DEBUG", tag, message, meta),
  info: (tag, message, meta) => logToTerminal("INFO", tag, message, meta),
  warn: (tag, message, meta) => logToTerminal("WARN", tag, message, meta),
  error: (tag, message, meta) => logToTerminal("ERROR", tag, message, meta),
};

export function maskSecret(value) {
  if (!value || typeof value !== "string") return "(empty)";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)} (${value.length} chars)`;
}
