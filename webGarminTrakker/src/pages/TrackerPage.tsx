import { Link, Navigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import MapView from "../components/MapView";
import { fetchRouteByTrackingId } from "../services/routeService";
import type { FeatureCollection } from "geojson";
import type { TrackingParticipant } from "../types/tracking";
import { getAccessToken } from "../services/apiClient";
import "./AppPages.css";

export default function TrackerPage() {
  const { trackingId } = useParams<{ trackingId: string }>();

  const [routeData, setRouteData] = useState<FeatureCollection | null>(null);
  const [routeName, setRouteName] = useState<string>("");
  const [participants, setParticipants] = useState<TrackingParticipant[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | undefined>();
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isDemoRoute =
    trackingId?.toUpperCase() === "LAGOS26" || trackingId === "demo";
  const canViewTracking = Boolean(getAccessToken() || isDemoRoute);

  useEffect(() => {
    if (!trackingId || !canViewTracking) return;
    let isActive = true;

    const loadTracking = async (showLoading: boolean) => {
      try {
        if (showLoading) setLoading(true);
        setError(null);

        const response = await fetchRouteByTrackingId(trackingId);
        if (!isActive) return;

        setRouteData(response.route.dataRouteJson);
        setRouteName(response.route.name);
        setParticipants(response.participants ?? []);
        setExpiresAt(response.expiresAt);
        setIsPublic(response.isPublic);
      } catch (err: unknown) {
        console.error("Error loading tracking route:", err);
        if (isActive) {
          setError(
            err instanceof Error ? err.message : "No se pudo cargar el tracking",
          );
        }
      } finally {
        if (isActive && showLoading) setLoading(false);
      }
    };

    void loadTracking(true);
    const refreshInterval = window.setInterval(
      () => void loadTracking(false),
      45_000,
    );

    return () => {
      isActive = false;
      window.clearInterval(refreshInterval);
    };
  }, [canViewTracking, trackingId]);

  if (!canViewTracking) {
    return <Navigate to="/auth" replace />;
  }

  if (loading) {
    return (
      <main className="gt-page gt-auth-page">
        <div className="gt-auth-panel">
          <div className="gt-kicker">GarminTrakker</div>
          <h1>Cargando retransmisión</h1>
          <p className="gt-muted">Comprobando grupo, miembros y recorrido.</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="gt-page gt-auth-page">
        <div className="gt-auth-panel">
          <div className="gt-kicker">Acceso a grupo</div>
          <h1>Retransmisión no disponible</h1>
          <p className="gt-muted">{error}</p>
          <Link className="gt-primary-button gt-link-button" to="/groups">
            Volver a grupos
          </Link>
        </div>
      </main>
    );
  }
  if (!trackingId) return <p>No hay datos de tracking</p>;

  return (
    <MapView
      routeGeoJson={routeData}
      trackingId={trackingId}
      routeName={routeName}
      participants={participants}
      expiresAt={expiresAt}
      isPublic={isPublic}
    />
  );
}
