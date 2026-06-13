const API_BASE = import.meta.env.VITE_API_URL || "";

export async function fetchDashboardStats({ days = 30 } = {}) {
  const url = `${API_BASE}/api/stats/dashboard?days=${days}`;
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Failed to load dashboard stats");
  }

  return data;
}
