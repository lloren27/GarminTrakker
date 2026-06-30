import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { LiveUser } from "../types/user";
import type { TrackingParticipant } from "../types/tracking";

interface Props {
  users: LiveUser[];
  participants?: TrackingParticipant[];
  selectedUserId?: string | null;
  totalDistanceKm?: number;
  onSelectUser?: (user: LiveUser) => void;
}

type RaceRow = {
  userId: string;
  username?: string;
  email?: string;
  bib?: string;
  team?: string;
  isOwner: boolean;
  lat: number;
  lng: number;
  updatedAt: number;
  hasLivePosition: boolean;
  progressMeters: number;
  speedKmH?: number;
  currentSpeedKmH?: number;
  liveUser?: LiveUser;
};

function formatLastSeen(updatedAt?: number): string {
  if (!updatedAt) return "Sin señal";

  const seconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));

  if (seconds < 5) return "Directo";
  if (seconds < 60) return `+${seconds}s señal`;
  if (seconds >= 24 * 60 * 60) {
    return `+${Math.floor(seconds / (24 * 60 * 60))} d señal`;
  }

  return `+${Math.floor(seconds / 60)} min señal`;
}

function formatDistanceGap(deltaMeters: number): string {
  if (deltaMeters <= 0) return "0 m";
  if (deltaMeters >= 1000) return `${(deltaMeters / 1000).toFixed(1)} km`;

  return `${Math.round(deltaMeters)} m`;
}

function formatTimeGap(
  deltaMeters: number,
  ...speedsKmH: Array<number | undefined>
): string {
  if (deltaMeters <= 0) return "0s";

  const validSpeeds = speedsKmH.filter(
    (speed): speed is number =>
      typeof speed === "number" && Number.isFinite(speed) && speed > 0,
  );
  const referenceSpeedKmH =
    validSpeeds.length > 0
      ? validSpeeds.reduce((total, speed) => total + speed, 0) /
        validSpeeds.length
      : 28.8;
  const speedMetersPerSecond = referenceSpeedKmH / 3.6;
  const seconds = Math.round(deltaMeters / speedMetersPerSecond);

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${minutes}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function getDisplayName(user: {
  userId: string;
  username?: string;
  email?: string;
}): string {
  const username = user.username?.trim();
  if (username) return username;

  const email = user.email?.trim();
  if (email) return email;

  return `Rider ${user.userId.slice(0, 4)}`;
}

function classifyRaceGroup(gapMeters: number, index: number): string {
  if (index === 0 || gapMeters <= 120) return "Grupo de cabeza";
  if (gapMeters <= 750) return "Perseguidores";
  return "Peloton";
}

export default function ActiveUsersPanel({
  users,
  participants = [],
  selectedUserId,
  totalDistanceKm,
  onSelectUser,
}: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const nextIsMobile = window.innerWidth < 768;
      setIsMobile(nextIsMobile);
      setIsOpen(!nextIsMobile);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const raceRows = useMemo<RaceRow[]>(() => {
    const usersMap = new Map(users.map((user) => [user.userId, user]));
    const acceptedParticipants = participants.filter(
      (participant) =>
        participant.status == null || participant.status === "accepted",
    );

    const mergedFromParticipants: RaceRow[] = acceptedParticipants.map(
      (participant) => {
        const liveUser = usersMap.get(participant.userId);
        const location = liveUser
          ? {
              lat: liveUser.lat,
              lng: liveUser.lng,
              updatedAt: liveUser.updatedAt,
            }
          : participant.location
            ? {
                lat: participant.location.lat,
                lng: participant.location.lng,
                updatedAt: new Date(participant.location.updatedAt).getTime(),
              }
            : null;

        return {
          userId: participant.userId,
          username: liveUser?.username ?? participant.username,
          email: liveUser?.email ?? participant.email,
          bib: liveUser?.bib ?? participant.bib,
          team: liveUser?.team ?? participant.team,
          isOwner:
            typeof liveUser?.isOwner === "boolean"
              ? liveUser.isOwner
              : participant.role === "owner",
          lat: location?.lat ?? 0,
          lng: location?.lng ?? 0,
          updatedAt: location?.updatedAt ?? 0,
          hasLivePosition: Boolean(location),
          progressMeters:
            liveUser?.progressMeters ?? participant.progressMeters ?? 0,
          speedKmH: liveUser?.speedKmH ?? participant.speedKmH,
          currentSpeedKmH:
            liveUser?.currentSpeedKmH ?? participant.currentSpeedKmH,
          liveUser,
        };
      },
    );

    const orphanLiveUsers: RaceRow[] = users
      .filter(
        (user) =>
          !acceptedParticipants.some(
            (participant) => participant.userId === user.userId,
          ),
      )
      .map((user) => ({
        userId: user.userId,
        username: user.username,
        email: user.email,
        bib: user.bib,
        team: user.team,
        isOwner: user.isOwner ?? false,
        lat: user.lat,
        lng: user.lng,
        updatedAt: user.updatedAt,
        hasLivePosition: true,
        progressMeters: user.progressMeters ?? 0,
        speedKmH: user.speedKmH,
        currentSpeedKmH: user.currentSpeedKmH,
        liveUser: user,
      }));

    return [...mergedFromParticipants, ...orphanLiveUsers].sort(
      (a, b) => b.progressMeters - a.progressMeters,
    );
  }, [participants, users]);

  const leader = raceRows[0];
  const leaderProgress = leader?.progressMeters ?? 0;
  const totalDistanceMeters = totalDistanceKm ? totalDistanceKm * 1000 : null;

  const raceGroups = useMemo(() => {
    return raceRows.reduce<Record<string, RaceRow[]>>((groups, row, index) => {
      const gapMeters = Math.max(0, leaderProgress - row.progressMeters);
      const groupName = classifyRaceGroup(gapMeters, index);

      return {
        ...groups,
        [groupName]: [...(groups[groupName] ?? []), row],
      };
    }, {});
  }, [leaderProgress, raceRows]);

  return (
    <section
      style={{
        ...styles.wrapper,
        ...(isMobile ? styles.wrapperMobile : {}),
      }}
      aria-label="Clasificacion de carrera"
    >
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        style={{
          ...styles.toggleButton,
          ...(isMobile ? styles.toggleButtonMobile : {}),
        }}
      >
        {isOpen ? "Ocultar carrera" : `Carrera (${raceRows.length})`}
      </button>

      {isOpen && (
        <div
          style={{
            ...styles.container,
            ...(isMobile ? styles.containerMobile : {}),
          }}
        >
          <div style={styles.header}>
            <div>
              <div style={styles.eyebrow}>Radio carrera</div>
              <h2 style={styles.title}>GarminTrakker Live</h2>
            </div>
            <div style={styles.livePill}>
              <span style={styles.liveDot} />
              Directo
            </div>
          </div>

          <div style={styles.raceStrip}>
            <div>
              <span style={styles.stripLabel}>Cabeza</span>
              <strong style={styles.stripValue}>
                {leader ? getDisplayName(leader) : "--"}
              </strong>
            </div>
            <div>
              <span style={styles.stripLabel}>En carrera</span>
              <strong style={styles.stripValue}>{raceRows.length}</strong>
            </div>
            <div>
              <span style={styles.stripLabel}>Km líder</span>
              <strong style={styles.stripValue}>
                {(leaderProgress / 1000).toFixed(1)}
              </strong>
            </div>
          </div>

          {Object.entries(raceGroups).map(([groupName, groupRows]) => (
            <div key={groupName} style={styles.groupBlock}>
              <div style={styles.groupTitleRow}>
                <span style={styles.groupTitle}>{groupName}</span>
                <span style={styles.groupCount}>{groupRows.length}</span>
              </div>

              <div style={styles.list}>
                {groupRows.map((row) => {
                  const displayName = getDisplayName(row);
                  const gapMeters = Math.max(
                    0,
                    leaderProgress - row.progressMeters,
                  );
                  const progressPercent = totalDistanceMeters
                    ? Math.max(
                        0,
                        Math.min(100, (row.progressMeters / totalDistanceMeters) * 100),
                      )
                    : 0;
                  const isSelected = selectedUserId === row.userId;

                  return (
                    <button
                      key={row.userId}
                      type="button"
                      onClick={() => {
                        const userToSelect =
                          row.liveUser ??
                          ({
                            userId: row.userId,
                            username: row.username,
                            email: row.email,
                            bib: row.bib,
                            team: row.team,
                            isOwner: row.isOwner,
                            lat: row.lat,
                            lng: row.lng,
                            updatedAt: row.updatedAt,
                            progressMeters: row.progressMeters,
                            speedKmH: row.speedKmH,
                            trail: [],
                          } satisfies LiveUser);

                        if (row.hasLivePosition) onSelectUser?.(userToSelect);
                      }}
                      style={{
                        ...styles.rowButton,
                        ...(isSelected ? styles.rowButtonSelected : {}),
                        ...(row.hasLivePosition ? {} : styles.rowButtonDisabled),
                      }}
                      disabled={!row.hasLivePosition}
                    >
                      <div style={styles.rowTop}>
                        <div style={styles.identity}>
                          <span style={styles.bib}>{row.bib ?? "--"}</span>
                          <div style={styles.nameBlock}>
                            <strong style={styles.name}>{displayName}</strong>
                            <span style={styles.team}>
                              {row.team ?? "Independiente"}
                            </span>
                          </div>
                        </div>

                        <div style={styles.gapBlock}>
                          <strong style={styles.gapDistance}>
                            {formatDistanceGap(gapMeters)}
                          </strong>
                          <span style={styles.gapTime}>
                            {formatTimeGap(
                              gapMeters,
                              leader?.speedKmH,
                              row.speedKmH,
                            )}
                          </span>
                        </div>
                      </div>

                      <div style={styles.progressTrack}>
                        <div
                          style={{
                            ...styles.progressFill,
                            width: `${progressPercent}%`,
                          }}
                        />
                      </div>

                      <div style={styles.rowMeta}>
                        <span>{(row.progressMeters / 1000).toFixed(1)} km</span>
                        <span>
                          {row.speedKmH
                            ? `${row.speedKmH.toFixed(1)} km/h`
                            : "-- km/h"}
                        </span>
                        <span>{formatLastSeen(row.updatedAt)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "flex-end",
    width: 380,
  },
  wrapperMobile: {
    width: "100%",
    alignItems: "stretch",
  },
  toggleButton: {
    minHeight: 40,
    border: "1px solid rgba(255,255,255,0.24)",
    borderRadius: 8,
    padding: "9px 12px",
    background: "rgba(17,24,39,0.92)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 13,
    cursor: "pointer",
    boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
    textTransform: "uppercase",
  },
  toggleButtonMobile: {
    alignSelf: "flex-end",
  },
  container: {
    width: "100%",
    maxHeight: "calc(100vh - 96px)",
    overflowY: "auto",
    borderRadius: 8,
    background: "rgba(248,250,252,0.96)",
    color: "var(--color-text)",
    border: "1px solid rgba(15,23,42,0.14)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.24)",
    backdropFilter: "blur(12px)",
  },
  containerMobile: {
    maxHeight: "54vh",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 14px 10px",
    background: "linear-gradient(90deg, #111827 0%, #374151 58%, #f5c518 58%, #f5c518 100%)",
    color: "#fff",
  },
  eyebrow: {
    color: "#f5c518",
    fontSize: 11,
    fontWeight: 900,
    lineHeight: "14px",
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: 20,
    lineHeight: "24px",
    letterSpacing: 0,
  },
  livePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
    borderRadius: 8,
    padding: "5px 8px",
    background: "rgba(255,255,255,0.18)",
    color: "#111827",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#ef4444",
  },
  raceStrip: {
    display: "grid",
    gridTemplateColumns: "1.6fr 1fr 1fr",
    gap: 8,
    padding: "10px 14px",
    background: "#111827",
    color: "#fff",
  },
  stripLabel: {
    display: "block",
    color: "#9ca3af",
    fontSize: 10,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  stripValue: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 16,
    lineHeight: "20px",
  },
  groupBlock: {
    padding: "12px 12px 4px",
  },
  groupTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 2px 8px",
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0,
    color: "#374151",
    textTransform: "uppercase",
  },
  groupCount: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    height: 22,
    borderRadius: 8,
    background: "#e5e7eb",
    fontSize: 12,
    fontWeight: 900,
  },
  list: {
    display: "grid",
    gap: 8,
  },
  rowButton: {
    width: "100%",
    minHeight: 92,
    padding: 10,
    borderRadius: 8,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "var(--color-text)",
    textAlign: "left",
    cursor: "pointer",
  },
  rowButtonSelected: {
    borderColor: "#f5c518",
    boxShadow: "0 0 0 2px rgba(245,197,24,0.28)",
  },
  rowButtonDisabled: {
    cursor: "not-allowed",
    opacity: 0.64,
  },
  rowTop: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  identity: {
    display: "flex",
    minWidth: 0,
    gap: 8,
    alignItems: "center",
  },
  bib: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 30,
    borderRadius: 6,
    background: "#111827",
    color: "#f5c518",
    fontSize: 13,
    fontWeight: 900,
    flexShrink: 0,
  },
  nameBlock: {
    minWidth: 0,
  },
  name: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 16,
    lineHeight: "20px",
  },
  team: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "#6b7280",
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: 700,
  },
  gapBlock: {
    textAlign: "right",
    flexShrink: 0,
  },
  gapDistance: {
    display: "block",
    fontSize: 16,
    lineHeight: "20px",
  },
  gapTime: {
    display: "block",
    color: "#b45309",
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: 900,
  },
  progressTrack: {
    height: 8,
    borderRadius: 6,
    marginTop: 10,
    overflow: "hidden",
    background: "#e5e7eb",
  },
  progressFill: {
    height: "100%",
    borderRadius: 6,
    background: "linear-gradient(90deg, #f5c518, #16a34a)",
  },
  rowMeta: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1.2fr",
    gap: 8,
    marginTop: 8,
    color: "#4b5563",
    fontSize: 12,
    lineHeight: "16px",
    fontWeight: 800,
  },
};
