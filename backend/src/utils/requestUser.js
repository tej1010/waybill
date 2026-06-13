export function userContextFromRequest(req) {
  const username = req.headers["x-eway-username"]?.trim() || null;
  const gstin = req.headers["x-eway-gstin"]?.trim()?.toUpperCase() || null;
  return { username, gstin };
}
