import { useState } from "react";
import { login, setRefreshCredentials, setStoredAuth } from "../api/auth.js";

export default function LoginForm({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [gstin, setGstin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorDetails, setErrorDetails] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setErrorDetails("");
    setLoading(true);

    try {
      const data = await login({
        username: username.trim(),
        password: password.trim(),
        gstin: gstin.trim().toUpperCase(),
      });

      const trimmedUser = username.trim();
      const trimmedPass = password.trim();
      const trimmedGstin = gstin.trim().toUpperCase();

      setRefreshCredentials({
        username: trimmedUser,
        password: trimmedPass,
        gstin: trimmedGstin,
      });

      const auth = {
        access_token: data.access_token,
        expiry: data.expiry,
        transaction_id: data.transaction_id,
        lastRefreshedAt: data.lastRefreshedAt ?? Date.now(),
        gstin: trimmedGstin,
        username: trimmedUser,
      };

      setStoredAuth(auth);
      onSuccess(auth);
    } catch (err) {
      setError(err.message);
      if (err.details) {
        setErrorDetails(
          typeof err.details === "string"
            ? err.details
            : JSON.stringify(err.details, null, 2)
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <h2>Tax payer login</h2>
      <p className="login-subtitle">E-Way Bill authentication via Sandbox API</p>

      <label htmlFor="username">Username</label>
      <input
        id="username"
        type="text"
        autoComplete="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="ACME_IND_API_QCK"
        required
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <label htmlFor="gstin">GSTIN</label>
      <input
        id="gstin"
        type="text"
        autoComplete="off"
        value={gstin}
        onChange={(e) => setGstin(e.target.value.toUpperCase())}
        placeholder="29AAACQ3770E000"
        maxLength={15}
        pattern="[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}"
        title="15-character GSTIN"
        required
      />

      {error && (
        <div className="form-error">
          <p>{error}</p>
          {errorDetails && <pre className="error-details">{errorDetails}</pre>}
        </div>
      )}

      <button type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
