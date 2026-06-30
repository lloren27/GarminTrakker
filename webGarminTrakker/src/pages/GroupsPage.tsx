import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getAccessToken } from "../services/apiClient";
import { getStoredUser, logout } from "../services/authService";
import {
  createGroup,
  getGroupMembers,
  getGroups,
  joinGroup,
  uploadGroupRoute,
  type Group,
  type GroupMember,
} from "../services/groupService";
import {
  getGarminDevices,
  pairGarmin,
  unlinkGarminDevice,
  type GarminDevice,
} from "../services/garminService";
import { parseGpxToGeoJson } from "../shared/utils/gpx.utils";
import "./AppPages.css";

type GroupAction = "create" | "join";

function formatRelativeTime(value?: string): string {
  if (!value) return "Sin conexión reciente";

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Sin conexión reciente";

  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Ahora";
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
  return `Hace ${Math.floor(seconds / 86400)} días`;
}

export default function GroupsPage() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [devices, setDevices] = useState<GarminDevice[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupAction, setGroupAction] = useState<GroupAction>("create");
  const [groupName, setGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [routeName, setRouteName] = useState("");
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedGroup = useMemo(
    () => groups.find((group) => group._id === selectedGroupId),
    [groups, selectedGroupId],
  );

  const loadGroups = async (preferredGroupId?: string) => {
    const nextGroups = await getGroups();
    setGroups(nextGroups);
    setSelectedGroupId((current) => {
      const nextId = preferredGroupId || current;
      if (nextGroups.some((group) => group._id === nextId)) return nextId;
      return nextGroups[0]?._id ?? "";
    });
  };

  const loadDevices = async () => {
    setDevices(await getGarminDevices());
  };

  useEffect(() => {
    if (!getAccessToken()) return;

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadGroups(), loadDevices()]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "No se pudo cargar el panel",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, []);

  useEffect(() => {
    if (!selectedGroupId) {
      setMembers([]);
      return;
    }

    const loadMembers = async () => {
      try {
        const response = await getGroupMembers(selectedGroupId);
        setMembers([response.owner, ...response.participants]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los participantes",
        );
      }
    };

    void loadMembers();
  }, [selectedGroupId]);

  if (!getAccessToken()) {
    return <Navigate to="/auth" replace />;
  }

  const clearFeedback = () => {
    setError(null);
    setMessage(null);
  };

  const handleCreateGroup = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    clearFeedback();

    try {
      const created = await createGroup(groupName);
      setGroupName("");
      setMessage(`Grupo creado. Código de invitación: ${created.inviteCode}`);
      await loadGroups(created.groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el grupo");
    } finally {
      setSaving(false);
    }
  };

  const handleJoinGroup = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    clearFeedback();

    try {
      const joined = await joinGroup(inviteCode);
      setInviteCode("");
      setMessage(`Te has unido a ${joined.groupName}`);
      await loadGroups(joined.groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo unir al grupo");
    } finally {
      setSaving(false);
    }
  };

  const handlePairGarmin = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    clearFeedback();

    try {
      await pairGarmin(pairingCode);
      setPairingCode("");
      setMessage("Garmin vinculado. El Edge confirmará la conexión en unos segundos.");
      await loadDevices();
      if (selectedGroupId) {
        const response = await getGroupMembers(selectedGroupId);
        setMembers([response.owner, ...response.participants]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo vincular el Garmin",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkGarmin = async (deviceId: string) => {
    setSaving(true);
    clearFeedback();

    try {
      await unlinkGarminDevice(deviceId);
      setMessage("Garmin desvinculado");
      await loadDevices();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo desvincular el Garmin",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRouteFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setGpxFile(file);
    if (file && !routeName) {
      setRouteName(file.name.replace(/\.[^.]+$/, ""));
    }
  };

  const handleUploadRoute = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGroupId || !gpxFile) return;

    setSaving(true);
    clearFeedback();

    try {
      const content = await gpxFile.text();
      const name = routeName.trim() || gpxFile.name.replace(/\.[^.]+$/, "");
      const geoJson = parseGpxToGeoJson(content, name);
      await uploadGroupRoute(selectedGroupId, name, geoJson);
      setRouteName("");
      setGpxFile(null);
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
          <h1>Centro de carrera</h1>
          <p className="gt-muted">Grupos, corredores y dispositivos preparados para salir.</p>
        </div>
        <div className="gt-topbar-actions">
          <span>{user?.login ?? user?.email}</span>
          <button
            type="button"
            className="gt-secondary-button gt-compact-button"
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

      <section className="gt-race-console">
        <aside className="gt-panel gt-groups-panel">
          <div className="gt-section-heading">
            <div>
              <span className="gt-section-label">Temporada</span>
              <h2>Mis grupos</h2>
            </div>
            <span className="gt-count">{groups.length}</span>
          </div>

          {loading ? (
            <div className="gt-empty">Cargando grupos...</div>
          ) : groups.length === 0 ? (
            <div className="gt-empty">Todavía no perteneces a ningún grupo.</div>
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
        </aside>

        <section className="gt-panel gt-roster-panel">
          <div className="gt-section-heading gt-roster-heading">
            <div>
              <span className="gt-section-label">Alineación</span>
              <h2>{selectedGroup?.name ?? "Selecciona un grupo"}</h2>
            </div>
            {selectedGroup && (
              <button
                type="button"
                className="gt-primary-button gt-compact-button"
                onClick={() => navigate(`/track/${selectedGroupId}`)}
              >
                Abrir retransmisión
              </button>
            )}
          </div>

          {selectedGroup ? (
            <>
              <div className="gt-invite-strip">
                <span>Código de invitación</span>
                <strong>{selectedGroup.inviteCode}</strong>
              </div>
              <div className="gt-member-list">
                {members.map((member) => (
                  <div className="gt-member-row" key={member._id}>
                    <div className="gt-member-avatar">
                      {member.login.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="gt-member-identity">
                      <strong>{member.login}</strong>
                      <span>
                        {member.role === "owner" ? "Organizador" : "Corredor"}
                      </span>
                    </div>
                    <div className="gt-device-state">
                      <span
                        className={`gt-status-dot ${
                          member.garminOnline
                            ? "is-online"
                            : member.garminPaired
                              ? "is-paired"
                              : ""
                        }`}
                      />
                      <div>
                        <strong>
                          {member.garminOnline
                            ? "Garmin en directo"
                            : member.garminPaired
                              ? "Garmin vinculado"
                              : "Sin Garmin"}
                        </strong>
                        <span>{formatRelativeTime(member.garminLastSeenAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {members.length === 0 && (
                  <div className="gt-empty">Cargando participantes...</div>
                )}
              </div>
            </>
          ) : (
            <div className="gt-empty gt-empty-large">
              Crea un grupo o únete con un código para preparar la salida.
            </div>
          )}
        </section>
      </section>

      <section className="gt-tools-grid">
        <section className="gt-panel gt-form">
          <div className="gt-section-heading">
            <div>
              <span className="gt-section-label">Connect IQ</span>
              <h2>Mi Garmin</h2>
            </div>
            <span className={`gt-connection-badge ${devices.some((device) => device.online) ? "is-online" : ""}`}>
              {devices.some((device) => device.online) ? "En directo" : "Preparación"}
            </span>
          </div>

          <form className="gt-form" onSubmit={handlePairGarmin}>
            <label>
              Código mostrado en el Edge
              <input
                value={pairingCode}
                onChange={(event) =>
                  setPairingCode(event.target.value.toUpperCase())
                }
                placeholder="ABCD-EFGH"
                maxLength={9}
                required
              />
            </label>
            <button
              className="gt-secondary-button"
              type="submit"
              disabled={saving}
            >
              Vincular Garmin
            </button>
          </form>

          <div className="gt-device-list">
            {devices.map((device) => (
              <div className="gt-device-row" key={device.id}>
                <div>
                  <strong>{device.model}</strong>
                  <span>
                    {device.online
                      ? "Transmitiendo ahora"
                      : formatRelativeTime(device.lastSeenAt)}
                  </span>
                </div>
                <button
                  type="button"
                  className="gt-text-button"
                  disabled={saving}
                  onClick={() => void handleUnlinkGarmin(device.id)}
                >
                  Desvincular
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="gt-panel gt-group-actions">
          <div className="gt-segmented" role="tablist" aria-label="Acciones de grupo">
            <button
              type="button"
              className={groupAction === "create" ? "is-active" : ""}
              onClick={() => setGroupAction("create")}
            >
              Crear grupo
            </button>
            <button
              type="button"
              className={groupAction === "join" ? "is-active" : ""}
              onClick={() => setGroupAction("join")}
            >
              Unirme
            </button>
          </div>

          {groupAction === "create" ? (
            <form className="gt-form" onSubmit={handleCreateGroup}>
              <label>
                Nombre del grupo
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Marcha del sábado"
                  required
                />
              </label>
              <button
                className="gt-secondary-button"
                type="submit"
                disabled={saving}
              >
                Crear grupo
              </button>
            </form>
          ) : (
            <form className="gt-form" onSubmit={handleJoinGroup}>
              <label>
                Código de invitación
                <input
                  value={inviteCode}
                  onChange={(event) =>
                    setInviteCode(event.target.value.toUpperCase())
                  }
                  placeholder="A1B2C3"
                  maxLength={6}
                  required
                />
              </label>
              <button
                className="gt-secondary-button"
                type="submit"
                disabled={saving}
              >
                Unirme al grupo
              </button>
            </form>
          )}
        </section>

        <form className="gt-panel gt-form" onSubmit={handleUploadRoute}>
          <div>
            <span className="gt-section-label">Recorrido</span>
            <h2>Cargar GPX</h2>
          </div>
          <label>
            Grupo
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              required
            >
              <option value="" disabled>
                Selecciona un grupo
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
              placeholder="Recorrido principal"
            />
          </label>
          <label>
            Archivo GPX
            <input
              type="file"
              accept=".gpx,application/gpx+xml"
              onChange={handleRouteFile}
              required
            />
          </label>
          <button
            className="gt-secondary-button"
            type="submit"
            disabled={saving || !gpxFile || !selectedGroupId}
          >
            Subir GPX
          </button>
        </form>
      </section>
    </main>
  );
}
