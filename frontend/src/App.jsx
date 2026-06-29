import { useState } from "react";
import { getStoredAuth } from "./api/auth.js";
import Dashboard from "./components/Dashboard.jsx";
import HomeDashboard from "./components/HomeDashboard.jsx";
import LoginForm from "./components/LoginForm.jsx";
import "./App.css";

function App() {
  const [auth, setAuth] = useState(() => getStoredAuth());

  return (
    <div className="app">
      <header className="app-header">
        <h1>Eway</h1>
        <p>E-Way Bill tax payer portal</p>
      </header>
      <main className={`app-main ${auth ? "" : "app-main-home"}`}>
        {auth ? (
          <Dashboard auth={auth} onLogout={() => setAuth(null)} onAuthUpdate={setAuth} />
        ) : (
          <>
            <HomeDashboard />
            <LoginForm onSuccess={setAuth} />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
