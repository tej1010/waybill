import { useEffect, useState } from "react";
import { fetchDashboardStats } from "../api/stats.js";

function formatDate(isoDate) {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function SummaryCards({ summary }) {
  if (!summary) return null;

  return (
    <div className="stats-summary">
      <div className="stats-card">
        <span className="stats-card-label">Total updates</span>
        <strong className="stats-card-value">{summary.totalOperations}</strong>
      </div>
      <div className="stats-card">
        <span className="stats-card-label">Active users</span>
        <strong className="stats-card-value">{summary.uniqueUsers}</strong>
      </div>
      <div className="stats-card">
        <span className="stats-card-label">Today</span>
        <strong className="stats-card-value">{summary.today}</strong>
      </div>
    </div>
  );
}

function ByUserTable({ rows }) {
  if (!rows?.length) return null;

  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            <th>User</th>
            <th>GSTIN</th>
            <th>Total</th>
            <th>Date-wise</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.gstin}:${row.username}`}>
              <td>{row.username}</td>
              <td className="mono">{row.gstin}</td>
              <td>{row.total}</td>
              <td>
                <div className="date-chips">
                  {row.byDate.map((day) => (
                    <span key={day.date} className="date-chip">
                      {formatDate(day.date)}: {day.count}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ByDateTable({ rows }) {
  if (!rows?.length) return null;

  return (
    <div className="stats-table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Total</th>
            <th>Users</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.date} className={row.count === 0 ? "stats-row-empty" : ""}>
              <td>{formatDate(row.date)}</td>
              <td>{row.count}</td>
              <td>
                {row.users?.length > 0 ? (
                  <div className="date-chips">
                    {row.users.map((user) => (
                      <span key={`${user.username}:${user.gstin}`} className="date-chip">
                        {user.username}: {user.count}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="dashboard-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeriodBlock({ title, period, showEmptyDates = false }) {
  if (!period) return null;

  const byDate = showEmptyDates
    ? period.byDate
    : period.byDate?.filter((row) => row.count > 0);

  return (
    <div className="stats-period">
      <h3 className="stats-period-title">{title}</h3>
      <SummaryCards summary={period.summary} />
      {byDate?.length > 0 && (
        <div className="stats-section">
          <h4>By date</h4>
          <ByDateTable rows={byDate} />
        </div>
      )}
      {period.byUser?.length > 0 && (
        <div className="stats-section">
          <h4>By user</h4>
          <ByUserTable rows={period.byUser} />
        </div>
      )}
      {period.summary?.totalOperations === 0 && (
        <p className="dashboard-muted">No updates in this period.</p>
      )}
    </div>
  );
}

export default function HomeDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await fetchDashboardStats({ days });
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const timer = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [days]);

  const mainTitle =
    days === 7 ? "Last 7 days" : days === 30 ? "Last 30 days" : `Last ${days} days`;

  return (
    <section className="home-dashboard">
      <div className="home-dashboard-header">
        <div>
          <h2>Operations dashboard</h2>
          <p className="home-dashboard-subtitle">
            E-Way Bill updates (Part B) per user — date wise
          </p>
        </div>
        <select
          className="dashboard-days-select"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="Extended date range"
        >
          <option value={30}>Extended: 30 days</option>
          <option value={90}>Extended: 90 days</option>
        </select>
      </div>

      {loading && !stats && <p className="dashboard-muted">Loading stats…</p>}
      {error && <p className="form-error-inline">{error}</p>}

      {stats && !stats.connected && (
        <p className="dashboard-muted">MongoDB not connected — stats unavailable.</p>
      )}

      {stats?.connected && (
        <>
          {days !== 7 && (
            <PeriodBlock
              title="Last 7 days"
              period={stats.last7}
              showEmptyDates
            />
          )}

          <PeriodBlock
            title={mainTitle}
            period={days === 7 ? stats.last7 : days === 30 ? stats.last30 : stats}
            showEmptyDates={days === 7}
          />
        </>
      )}
    </section>
  );
}
