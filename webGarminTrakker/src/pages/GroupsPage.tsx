import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getAccessToken } from "../services/apiClient";
import { getStoredUser, logout } from "../services/authService";
import {
  createGroup,
  getGroups,
  joinGroup,
  uploadGroupRoute,
  type Group,
} from "../services/groupService";
import { parseGpxToGeoJson } from "../shared/utils/gpx.utils";
import "./AppPages.css";

export default function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupName, setGroupName] = useState("Marcha de sábado");
  const [inviteCode, setInviteCode] = useState("LAGOS26");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [routeName, setRouteName] = useState("Recorrido principal");
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = getStoredUser();

  const loadGroups = async () => {
    setLoading(true);
    setError(null);

    try {
      const nextGroups = await getGroups();
      setGroups(nextGroups);

      if (!selectedGroupId && nextGroups[0]?._id) {
        setSelectedGroupId(nextGroups[0]._id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar grupos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getAccessToken()) {
      void loadGroups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!getAccessToken()) {
    return <Navigate to="/auth" replace />;
  }

  const handleCreateGroup = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const created = await createGroup(groupName);
      setMessage(`Grupo creado. Código: ${created.inviteCode}`);
      await loadGroups();
      setSelectedGroupId(created.groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el grupo");
    } finally {
      setSaving(false);
    }
  };

  const handleJoinGroup = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const joined = await joinGroup(inviteCode);
      setMessage(`Te has unido a ${joined.groupName}`);
      await loadGroups();
      setSelectedGroupId(joined.groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo unir al grupo");
    } finally {
      setSaving(false);
    }
  };

  const handleRouteFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setGpxFile(file);
    if (file) {
      setRouteName(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleUploadRoute = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGroupId || !gpxFile) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const content = await gpxFile.text();
      const geoJson = parseGpxToGeoJson(content, routeName || gpxFile.name);
      await uploadGroupRoute(selectedGroupId, routeName || gpxFile.name, geoJson);
      setMessage("Recorrido cargado correctamente");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el GPX");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="gt-page gt-dashboard">
      <header className="gt-topbar">
        <div>
          <div className="gt-kicker">GarminTrakker</div>
          <h1>Grupos y recorridos</h1>
        </div>
        <div className="gt-topbar-actions">
          <span>{user?.login ?? user?.email}</span>
          <button
            type="button"
            className="gt-secondary-button"
            onClick={() => {
              logout();
              navigate("/auth", { replace: true });
            }}
          >
            Salir
          </button>
        </div>
      </header>

      {message && <div className="gt-success">{message}</div>}
      {error && <div className="gt-error">{error}</div>}

      <section className="gt-grid">
        <div className="gt-panel">
          <h2>Mis grupos</h2>
          {loading ? (
            <div className="gt-muted">Cargando grupos...</div>
          ) : groups.length === 0 ? (
            <div className="gt-empty">Aún no perteneces a ningún grupo.</div>
          ) : (
            <div className="gt-group-list">
              {groups.map((group) => {
                const id = group._id ?? "";
                return (
                  <button
                    key={id || group.inviteCode}
                    type="button"
                    className={`gt-group-card ${selectedGroupId === id ? "is-selected" : ""}`}
                    onClick={() => setSelectedGroupId(id)}
                  >
                    <strong>{group.name}</strong>
                    <span>Código {group.inviteCode}</span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className="gt-primary-button"
            disabled={!selectedGroupId}
            onClick={() => navigate(`/track/${selectedGroupId}`)}
          >
            Abrir retransmisión
          </button>
        </div>

        <form className="gt-panel gt-form" onSubmit={handleJoinGroup}>
          <h2>Unirse a una ruta</h2>
          <label>
            Código de invitación
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              required
            />
          </label>
          <button className="gt-secondary-button" type="submit" disabled={saving}>
            Unirme al grupo
          </button>
        </form>

        <form className="gt-panel gt-form" onSubmit={handleCreateGroup}>
          <h2>Crear grupo</h2>
          <label>
            Nombre del grupo
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              required
            />
          </label>
          <button className="gt-secondary-button" type="submit" disabled={saving}>
            Crear grupo
          </button>
        </form>

        <form className="gt-panel gt-form" onSubmit={handleUploadRoute}>
          <h2>Cargar recorrido GPX</h2>
          <label>
            Grupo
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              required
            >
              <option value="" disabled>
                Selecciona grupo
              </option>
              {groups.map((group) => (
                <option key={group._id} value={group._id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nombre del recorrido
            <input
              value={routeName}
              onChange={(event) => setRouteName(event.target.value)}
              required
            />
          </label>
          <label>
            Archivo GPX
            <input type="file" accept=".gpx,application/gpx+xml" onChange={handleRouteFile} required />
          </label>
          <button className="gt-secondary-button" type="submit" disabled={saving || !gpxFile}>
            Subir GPX
          </button>
        </form>
      </section>
    </main>
  );
}
