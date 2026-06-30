import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getAccessToken } from "../services/apiClient";
import { login, register } from "../services/authService";
import "./AppPages.css";

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginValue, setLoginValue] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (getAccessToken()) {
    return <Navigate to="/groups" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "login") {
        await login(loginValue, password);
      } else {
        await register({
          login: loginValue,
          email,
          password,
        });
      }

      navigate("/groups", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="gt-page gt-auth-page">
      <section className="gt-auth-panel" aria-label="Acceso GarminTrakker">
        <div className="gt-kicker">GarminTrakker</div>
        <h1>Control de carrera</h1>
        <p className="gt-muted">
          Gestiona grupos, invita corredores y carga recorridos antes de abrir
          la retransmisión.
        </p>

        <div className="gt-segmented" role="tablist">
          <button
            type="button"
            className={mode === "login" ? "is-active" : ""}
            onClick={() => setMode("login")}
          >
            Entrar
          </button>
          <button
            type="button"
            className={mode === "register" ? "is-active" : ""}
            onClick={() => setMode("register")}
          >
            Registro
          </button>
        </div>

        <form className="gt-form" onSubmit={handleSubmit}>
          <label>
            Usuario o email
            <input
              value={loginValue}
              onChange={(event) => setLoginValue(event.target.value)}
              autoComplete="username"
              placeholder="Usuario o correo"
              required
            />
          </label>

          {mode === "register" && (
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="nombre@correo.com"
                required
              />
            </label>
          )}

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Contraseña"
              required
            />
          </label>

          {error && <div className="gt-error">{error}</div>}

          <button className="gt-primary-button" type="submit" disabled={loading}>
            {loading ? "Procesando..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
      </section>
    </main>
  );
}
