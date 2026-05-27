import { useEffect, useState } from "react";
import { ensureValidAuth, getStoredAuth } from "./api/auth.js";
import Dashboard from "./components/Dashboard.jsx";
import LoginForm from "./components/LoginForm.jsx";
import "./App.css";

const REFRESH_CHECK_MS = 60 * 1000;

function App() {
  const [auth, setAuth] = useState(() => getStoredAuth());

  useEffect(() => {
    if (!auth) return undefined;

    let cancelled = false;

    async function refreshIfNeeded() {
      try {
        const updated = await ensureValidAuth();
        if (!cancelled && updated) {
          setAuth(updated);
        }
      } catch (err) {
        console.warn("[auth] background refresh failed", err.message);
      }
    }

    refreshIfNeeded();
    const timer = setInterval(refreshIfNeeded, REFRESH_CHECK_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [auth?.username, auth?.gstin]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Eway</h1>
        <p>E-Way Bill tax payer portal</p>
      </header>
      <main className="app-main">
        {auth ? (
          <Dashboard auth={auth} onLogout={() => setAuth(null)} onAuthUpdate={setAuth} />
        ) : (
          <LoginForm onSuccess={setAuth} />
        )}
      </main>
    </div>
  );
}

export default App;
