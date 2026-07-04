import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { calculateEtaHours } from "../shared/utils/tracking.utils";
import { formatEta, formatKm } from "../shared/utils/format.utils";

interface Props {
  routeName?: string;
  connected: boolean;
  userCount: number;
  expiresAt?: string;
  isPublic?: boolean;
  error?: string | null;
  totalDistanceKm?: number;
  remainingDistanceKm?: number;
  averageSpeedKmH?: number | null;
  selectedRiderName?: string;
  selectedProgressPercent?: number;
  selectedIsOffRoute?: boolean;
  selectedDistanceFromRouteMeters?: number;
}

function formatExpiry(expiresAt?: string): string {
  if (!expiresAt) return "--";

  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calculateProgress(total?: number, remaining?: number): number | null {
  if (!total || remaining == null) return null;

  const done = total - remaining;
  return Math.max(0, Math.min(100, (done / total) * 100));
}

export default function TrackingStatusCard({
  routeName,
  connected,
  userCount,
  expiresAt,
  isPublic = true,
  error,
  totalDistanceKm,
  remainingDistanceKm,
  averageSpeedKmH,
  selectedRiderName,
  selectedProgressPercent,
  selectedIsOffRoute,
  selectedDistanceFromRouteMeters,
}: Props) {
  const [isMobile, setIsMobile] = useState(false);
  const [isExpanded, setIsExpanded] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 768,
  );

  useEffect(() => {
    const handleResize = () => {
      const nextIsMobile = window.innerWidth < 768;
      setIsMobile(nextIsMobile);

      if (!nextIsMobile) setIsExpanded(true);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const calculatedProgress = calculateProgress(
    totalDistanceKm,
    remainingDistanceKm,
  );
  const progress =
    typeof selectedProgressPercent === "number" &&
    Number.isFinite(selectedProgressPercent)
      ? Math.max(0, Math.min(100, selectedProgressPercent))
      : calculatedProgress;
  const etaHours = calculateEtaHours(remainingDistanceKm ?? 0, averageSpeedKmH);

  if (isMobile && !isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        style={styles.compactButton}
      >
        <span style={styles.liveDot} />
        <span style={styles.compactTitle}>GarminTrakker Live</span>
        <strong style={styles.compactCount}>{userCount}</strong>
      </button>
    );
  }

  return (
    <aside
      style={{
        ...styles.container,
        ...(isMobile ? styles.containerMobile : {}),
      }}
      aria-label="Datos de retransmision"
    >
      <div style={styles.topBar}>
        <div style={styles.signal}>
          <span
            style={{
              ...styles.liveDot,
              background: connected ? "#16a34a" : "#ef4444",
            }}
          />
          {connected ? "Señal en directo" : "Señal diferida"}
        </div>
        <div style={styles.visibility}>{isPublic ? "PUBLICO" : "PRIVADO"}</div>
        {isMobile && (
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            style={styles.collapseButton}
            aria-label="Ocultar marcador"
          >
            x
          </button>
        )}
      </div>

      <div style={styles.titleRow}>
        <div>
          <div style={styles.eyebrow}>Etapa</div>
          <h1 style={styles.title}>{routeName || "GarminTrakker Live"}</h1>
          {selectedRiderName && (
            <div style={styles.selectedRider}>
              Siguiendo a <strong>{selectedRiderName}</strong>
            </div>
          )}
        </div>
        <div style={styles.stageBadge}>LAGOS26</div>
      </div>

      {selectedIsOffRoute && (
        <div style={styles.routeAlert}>
          Fuera del recorrido
          {typeof selectedDistanceFromRouteMeters === "number"
            ? ` · ${Math.round(selectedDistanceFromRouteMeters)} m`
            : ""}
        </div>
      )}

      <div style={styles.scoreboard}>
        <div style={styles.scoreItem}>
          <span style={styles.scoreLabel}>Riders</span>
          <strong style={styles.scoreValue}>{userCount}</strong>
        </div>
        <div style={styles.scoreItem}>
          <span style={styles.scoreLabel}>Total</span>
          <strong style={styles.scoreValue}>{formatKm(totalDistanceKm)}</strong>
        </div>
        <div style={styles.scoreItem}>
          <span style={styles.scoreLabel}>Restante</span>
          <strong style={styles.scoreValue}>{formatKm(remainingDistanceKm)}</strong>
        </div>
        <div style={styles.scoreItem}>
          <span style={styles.scoreLabel}>ETA</span>
          <strong style={styles.scoreValue}>{formatEta(etaHours)}</strong>
        </div>
      </div>

      {progress !== null && (
        <div style={styles.progressBlock}>
          <div style={styles.progressLabels}>
            <span>Salida</span>
            <strong>{progress.toFixed(0)}%</strong>
            <span style={styles.progressEndLabel}>Meta</span>
          </div>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progress}%`,
              }}
            />
          </div>
        </div>
      )}

      <div style={styles.footer}>
        <span>Fin ventana {formatExpiry(expiresAt)}</span>
        {error && <strong style={styles.errorText}>{error}</strong>}
      </div>
    </aside>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    minWidth: 360,
    maxWidth: 520,
    borderRadius: 8,
    overflow: "hidden",
    background: "rgba(17,24,39,0.94)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.28)",
    backdropFilter: "blur(12px)",
  },
  containerMobile: {
    width: "100%",
    minWidth: 0,
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 34,
    padding: "7px 12px",
    background: "#f5c518",
    color: "#111827",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  signal: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    flex: 1,
    minWidth: 0,
  },
  liveDot: {
    display: "inline-block",
    width: 9,
    height: 9,
    borderRadius: "50%",
    background: "#16a34a",
    boxShadow: "0 0 0 4px rgba(22,163,74,0.18)",
    flexShrink: 0,
  },
  visibility: {
    borderRadius: 6,
    padding: "3px 6px",
    background: "rgba(17,24,39,0.12)",
  },
  collapseButton: {
    color: "#111827",
    fontWeight: 900,
    cursor: "pointer",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 14px 12px",
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
    fontSize: 22,
    lineHeight: "28px",
    letterSpacing: 0,
  },
  selectedRider: {
    marginTop: 4,
    color: "#d1d5db",
    fontSize: 12,
    lineHeight: "16px",
  },
  stageBadge: {
    flexShrink: 0,
    borderRadius: 8,
    padding: "8px 10px",
    background: "#fff",
    color: "#111827",
    fontSize: 15,
    fontWeight: 900,
  },
  scoreboard: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    borderTop: "1px solid rgba(255,255,255,0.12)",
    borderBottom: "1px solid rgba(255,255,255,0.12)",
  },
  routeAlert: {
    borderTop: "1px solid rgba(248,113,113,0.3)",
    padding: "8px 14px",
    background: "#7f1d1d",
    color: "#fee2e2",
    fontSize: 12,
    fontWeight: 900,
    textTransform: "uppercase",
  },
  scoreItem: {
    minWidth: 0,
    padding: "10px 12px",
    borderRight: "1px solid rgba(255,255,255,0.12)",
  },
  scoreLabel: {
    display: "block",
    color: "#9ca3af",
    fontSize: 10,
    lineHeight: "14px",
    fontWeight: 900,
    textTransform: "uppercase",
  },
  scoreValue: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 17,
    lineHeight: "22px",
  },
  progressBlock: {
    padding: "12px 14px",
  },
  progressLabels: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    color: "#d1d5db",
    fontSize: 12,
    fontWeight: 800,
  },
  progressEndLabel: {
    textAlign: "right",
  },
  progressTrack: {
    height: 9,
    marginTop: 8,
    borderRadius: 7,
    background: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 7,
    background: "linear-gradient(90deg, #f5c518, #16a34a)",
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "0 14px 13px",
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: 700,
  },
  errorText: {
    color: "#fca5a5",
  },
  compactButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 42,
    borderRadius: 8,
    padding: "9px 12px",
    background: "rgba(17,24,39,0.94)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
    cursor: "pointer",
  },
  compactTitle: {
    fontWeight: 900,
  },
  compactCount: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    height: 24,
    borderRadius: 8,
    background: "#f5c518",
    color: "#111827",
  },
};
