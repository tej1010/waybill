export function getCorsOrigins() {
  const origins = new Set();

  const primary = process.env.FRONTEND_URL?.trim();
  if (primary) origins.add(primary);

  const extra = process.env.CORS_ORIGINS?.trim();
  if (extra) {
    for (const origin of extra.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return [...origins];
}
