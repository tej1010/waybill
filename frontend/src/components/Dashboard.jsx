import { clearStoredAuth, ensureValidAuth } from "../api/auth.js";
import DownloadPdfCard from "./DownloadPdfCard.jsx";
import ExtendValidityForm from "./ExtendValidityForm.jsx";
import UpdateVehicleForm from "./UpdateVehicleForm.jsx";

function formatExpiry(expiry) {
  if (!expiry) return "—";
  return new Date(expiry).toLocaleString();
}

export default function Dashboard({ auth, onLogout, onAuthUpdate }) {
  function handleLogout() {
    clearStoredAuth();
    onLogout();
  }

  async function resolveAccessToken() {
    const valid = await ensureValidAuth();
    if (valid) {
      onAuthUpdate?.(valid);
      return valid.access_token;
    }
    return auth.access_token;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h2>Welcome, {auth.username}</h2>
          <p className="dashboard-meta">GSTIN {auth.gstin}</p>
        </div>
        <button type="button" className="btn-secondary btn-compact" onClick={handleLogout}>
          Sign out
        </button>
      </div>

      <dl className="auth-details auth-details-compact">
        <div>
          <dt>Session expires</dt>
          <dd>{formatExpiry(auth.expiry)}</dd>
        </div>
      </dl>

      <UpdateVehicleForm getAccessToken={resolveAccessToken} user={auth} />
      <ExtendValidityForm getAccessToken={resolveAccessToken} user={auth} />
      <DownloadPdfCard getAccessToken={resolveAccessToken} />
    </div>
  );
}
