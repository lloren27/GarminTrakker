import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  Marker,
  Popup,
  Polyline,
  useMap,
  ZoomControl,
} from "react-leaflet";
import type { FeatureCollection } from "geojson";
import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import type { CSSProperties } from "react";
import "leaflet/dist/leaflet.css";

import { useSocket } from "../hooks/useSocket";
import ActiveUsersPanel from "./ActiveUsersPanel";
import TrackingStatusCard from "./TrackingStatusCard";
import type { LiveUser, LiveUserTrailPoint, UserLocationUpdate } from "../types/user";
import type { TrackingParticipant } from "../types/tracking";
import "./MapView.css";

import { calculateRouteProgressKm, calculateTotalDistanceKm } from "../shared/utils/geo.utils";


interface Props {
  routeGeoJson: FeatureCollection | null;
  trackingId: string;
  routeName?: string;
  participants?: TrackingParticipant[];
  expiresAt?: string;
  isPublic?: boolean;
}

const buildUserIcon = (color: string, label?: string) =>
  L.divIcon({
    html: `
      <div style="
        display:flex;
        flex-direction:column;
        align-items:center;
        transform: translateY(-6px);
      ">
        <div style="
          width:18px;
          height:18px;
          border-radius:50%;
          background:${color};
          border:3px solid var(--color-map-user-marker-border);
          box-shadow:0 0 0 6px rgba(0,0,0,0.12);
        "></div>
        ${label
        ? `<div style="
                margin-top:6px;
                padding:4px 8px;
                border-radius:999px;
                background:rgba(17,24,39,0.88);
                color:#fff;
                font-size:12px;
                font-weight:600;
                line-height:1;
                white-space:nowrap;
                box-shadow:0 4px 12px rgba(0,0,0,0.18);
              ">
                ${label}
              </div>`
        : ""
      }
      </div>
    `,
    className: "",
    iconSize: [120, 44],
    iconAnchor: [60, 18],
    popupAnchor: [0, -12],
  });

const MAX_VISIBLE_TRAIL_POINTS = 500;

const parseUpdateTime = (updatedAt?: number | string): number => {
  if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  if (typeof updatedAt === "string") {
    const parsed = new Date(updatedAt).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }

  return Date.now();
};

const buildParticipantTrail = (
  participant: TrackingParticipant,
): LiveUserTrailPoint[] => {
  const storedTrail =
    participant.locationTrail?.map((point) => ({
      lat: point.lat,
      lng: point.lng,
      updatedAt: parseUpdateTime(point.updatedAt),
      progressMeters: point.progressMeters,
    })) ?? [];

  if (storedTrail.length > 0) {
    return storedTrail.slice(-MAX_VISIBLE_TRAIL_POINTS);
  }

  if (!participant.location) return [];

  return [
    {
      lat: participant.location.lat,
      lng: participant.location.lng,
      updatedAt: parseUpdateTime(participant.location.updatedAt),
      progressMeters: participant.progressMeters,
    },
  ];
};

const buildLiveUserFromParticipant = (
  participant: TrackingParticipant,
): LiveUser | null => {
  const trail = buildParticipantTrail(participant);
  const location = participant.location ?? trail[trail.length - 1];

  if (!location) return null;

  return {
    userId: participant.userId,
    username: participant.username,
    email: participant.email,
    bib: participant.bib,
    team: participant.team,
    lat: location.lat,
    lng: location.lng,
    updatedAt: parseUpdateTime(location.updatedAt),
    isOwner: participant.role === "owner",
    progressMeters: participant.progressMeters,
    progressSource: participant.progressSource,
    remainingMeters: participant.remainingMeters,
    routeLengthMeters: participant.routeLengthMeters,
    progressPercent: participant.progressPercent,
    distanceFromRouteMeters: participant.distanceFromRouteMeters,
    isOffRoute: participant.isOffRoute,
    routeLayerId: participant.routeLayerId,
    speedKmH: participant.speedKmH,
    currentSpeedKmH: participant.currentSpeedKmH,
    trail,
  };
};

function FitBoundsToRoute({ geoJson }: { geoJson: FeatureCollection }) {
  const map = useMap();

  useEffect(() => {
    const geoJsonLayer = L.geoJSON(geoJson);
    const bounds = geoJsonLayer.getBounds();

    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [40, 120],
        maxZoom: 15,
      });
    }
  }, [geoJson, map]);

  return null;
}

function FitBoundsToLiveUser({
  user,
}: {
  user: LiveUser | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!user) return;

    map.setView([user.lat, user.lng], 16, {
      animate: true,
    });
  }, [map, user]);

  return null;
}

function MapInstanceHandler({
  onReady,
}: {
  onReady: (map: LeafletMap) => void;
}) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

function getUserLabel(user: LiveUser): string {
  const username = user.username?.trim();
  if (username) return username;

  const email = user.email?.trim();
  if (email) return email;

  return `Usuario ${user.userId.slice(0, 6)}`;
}

export default function MapView({
  routeGeoJson,
  trackingId,
  routeName,
  participants = [],
  expiresAt,
  isPublic
}: Props) {
  const [users, setUsers] = useState<Record<string, LiveUser>>({});
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const mapRef = useRef<LeafletMap | null>(null);
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});

  const participantsMap = useMemo(() => {
    return new Map(
      participants.map((participant) => [participant.userId, participant]),
    );
  }, [participants]);

  const applyParticipants = useCallback((nextParticipants: TrackingParticipant[]) => {
    const liveParticipants = nextParticipants
      .map(buildLiveUserFromParticipant)
      .filter((user): user is LiveUser => user !== null);

    setUsers((prev) => ({
      ...prev,
      ...Object.fromEntries(
        liveParticipants.map((participant) => [participant.userId, participant]),
      ),
    }));
  }, []);

  useEffect(() => {
    setUsers({});
    applyParticipants(participants);
    setSelectedUserId(null);
    markerRefs.current = {};
  }, [applyParticipants, participants, trackingId]);

  const handleLocation = useCallback(
    (payload: UserLocationUpdate) => {
      const { userId, username, coords, isOwner, email, updatedAt } = payload;

      if (!userId || coords?.lat == null || coords?.lng == null) return;

      const participant = participantsMap.get(userId);
      const updateTime = parseUpdateTime(updatedAt);

      setUsers((prev) => {
        const previousUser = prev[userId];
        const nextTrailPoint = {
          lat: coords.lat,
          lng: coords.lng,
          updatedAt: updateTime,
          progressMeters: payload.progressMeters,
        };

        const previousTrail =
          previousUser?.trail ??
          (participant ? buildParticipantTrail(participant) : []);

        const nextUser: LiveUser = {
          userId,
          lat: coords.lat,
          lng: coords.lng,
          updatedAt: updateTime,
          username:
            username ??
            previousUser?.username ??
            participant?.username,
          email:
            email ??
            previousUser?.email ??
            participant?.email,
          bib: payload.bib ?? previousUser?.bib ?? participant?.bib,
          team: payload.team ?? previousUser?.team ?? participant?.team,
          isOwner:
            typeof isOwner === "boolean"
              ? isOwner
              : previousUser?.isOwner ??
              (participant?.role === "owner"),
          progressMeters:
            payload.progressMeters ??
            previousUser?.progressMeters ??
            participant?.progressMeters,
          progressSource:
            payload.progressSource ??
            previousUser?.progressSource ??
            participant?.progressSource,
          remainingMeters:
            payload.remainingMeters ??
            previousUser?.remainingMeters ??
            participant?.remainingMeters,
          routeLengthMeters:
            payload.routeLengthMeters ??
            previousUser?.routeLengthMeters ??
            participant?.routeLengthMeters,
          progressPercent:
            payload.progressPercent ??
            previousUser?.progressPercent ??
            participant?.progressPercent,
          distanceFromRouteMeters:
            payload.distanceFromRouteMeters ??
            previousUser?.distanceFromRouteMeters ??
            participant?.distanceFromRouteMeters,
          isOffRoute:
            payload.isOffRoute ??
            previousUser?.isOffRoute ??
            participant?.isOffRoute,
          routeLayerId:
            payload.routeLayerId ??
            previousUser?.routeLayerId ??
            participant?.routeLayerId,
          speedKmH:
            payload.speedKmH ??
            previousUser?.speedKmH ??
            participant?.speedKmH,
          currentSpeedKmH:
            payload.currentSpeedKmH ??
            previousUser?.currentSpeedKmH ??
            participant?.currentSpeedKmH,
          trail: [...previousTrail, nextTrailPoint].slice(
            -MAX_VISIBLE_TRAIL_POINTS,
          ),
        };

        return {
          ...prev,
          [userId]: nextUser,
        };
      });
    },
    [participantsMap],
  );
  const { connected, error } = useSocket(
    trackingId,
    handleLocation,
    applyParticipants,
  );

  const liveUsers = useMemo(() => {
    return Object.values(users).sort((a, b) => {
      const routeRankDelta =
        Number(b.progressSource === "route" && Boolean(b.routeLayerId)) -
        Number(a.progressSource === "route" && Boolean(a.routeLayerId));
      if (routeRankDelta !== 0) return routeRankDelta;

      const progressDelta = (b.progressMeters ?? 0) - (a.progressMeters ?? 0);
      if (progressDelta !== 0) return progressDelta;

      return b.updatedAt - a.updatedAt;
    });
  }, [users]);

  const handleSelectUser = useCallback((user: LiveUser) => {
    setSelectedUserId(user.userId);

    mapRef.current?.closePopup();
    mapRef.current?.setView([user.lat, user.lng], 16, {
      animate: true,
    });

    window.setTimeout(() => {
      markerRefs.current[user.userId]?.openPopup();
    }, 250);
  }, []);

  const totalDistanceKm = useMemo(() => {
    const routeLengthMeters = liveUsers.find(
      (user) =>
        user.progressSource === "route" &&
        typeof user.routeLengthMeters === "number",
    )?.routeLengthMeters;
    if (routeLengthMeters) return routeLengthMeters / 1000;

    if (!routeGeoJson) return undefined;

    return calculateTotalDistanceKm(routeGeoJson);
  }, [liveUsers, routeGeoJson]);

  const selectedLiveUser = useMemo(() => {
    if (!selectedUserId) return liveUsers[0] ?? null;
    return liveUsers.find((user) => user.userId === selectedUserId) ?? null;
  }, [liveUsers, selectedUserId]);

  const remainingDistanceKm = useMemo(() => {
    if (!selectedLiveUser) return undefined;

    if (
      selectedLiveUser.progressSource === "route" &&
      typeof selectedLiveUser.remainingMeters === "number"
    ) {
      return selectedLiveUser.remainingMeters / 1000;
    }

    if (!routeGeoJson) return undefined;

    const progress = selectedLiveUser.trail.reduce(
      (previousCoveredDistanceKm, point) =>
        calculateRouteProgressKm(
          routeGeoJson,
          { lat: point.lat, lng: point.lng },
          previousCoveredDistanceKm,
        ).coveredDistanceKm,
      undefined as number | undefined,
    );

    return calculateRouteProgressKm(
      routeGeoJson,
      {
        lat: selectedLiveUser.lat,
        lng: selectedLiveUser.lng,
      },
      progress,
    ).remainingDistanceKm;
  }, [routeGeoJson, selectedLiveUser]);

  const officialRanking = useMemo(
    () =>
      new Map(
        liveUsers
          .filter(
            (user) =>
              user.progressSource === "route" && Boolean(user.routeLayerId),
          )
          .map((user, index) => [user.userId, index + 1]),
      ),
    [liveUsers],
  );

  return (
    <div className="map-view" style={styles.wrapper}>
      <div className="map-view__status">
        <TrackingStatusCard
          routeName={routeName}
          connected={connected}
          userCount={liveUsers.length}
          expiresAt={expiresAt}
          isPublic={isPublic}
          error={error}
          totalDistanceKm={totalDistanceKm}
          remainingDistanceKm={remainingDistanceKm}
          averageSpeedKmH={selectedLiveUser?.speedKmH}
          selectedRiderName={
            selectedLiveUser ? getUserLabel(selectedLiveUser) : undefined
          }
          selectedProgressPercent={selectedLiveUser?.progressPercent}
          selectedIsOffRoute={selectedLiveUser?.isOffRoute}
          selectedDistanceFromRouteMeters={
            selectedLiveUser?.distanceFromRouteMeters
          }
        />
      </div>

      <div className="map-view__users">
        <ActiveUsersPanel
          users={liveUsers}
          participants={participants}
          selectedUserId={selectedUserId}
          totalDistanceKm={totalDistanceKm}
          onSelectUser={handleSelectUser}
        />
      </div>

      <MapContainer
        style={styles.map}
        center={[40.4168, -3.7038]}
        zoom={13}
        scrollWheelZoom
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />

        <MapInstanceHandler
          onReady={(map) => {
            mapRef.current = map;
          }}
        />

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />

        {routeGeoJson && (
          <>
            <GeoJSON
              data={routeGeoJson}
              style={{
                color: "#111827",
                weight: 7,
                opacity: 0.72,
              }}
            />
            <GeoJSON
              data={routeGeoJson}
              style={{
                color: "#f5c518",
                weight: 3,
                opacity: 0.96,
              }}
            />
            <FitBoundsToRoute geoJson={routeGeoJson} />
          </>
        )}
        {!routeGeoJson && <FitBoundsToLiveUser user={selectedLiveUser} />}

        {liveUsers.map((user) =>
          user.trail.length > 1 ? (
            <Polyline
              key={`${user.userId}-trail`}
              positions={user.trail.map((point) => [point.lat, point.lng])}
              pathOptions={{
                color: user.isOwner
                  ? "var(--color-danger)"
                  : "var(--color-primary)",
                dashArray: "8 10",
                lineCap: "round",
                weight: 4,
                opacity: 0.45,
              }}
            />
          ) : null,
        )}

        {liveUsers.map((user) => {
          const label = getUserLabel(user);
          const officialRank = officialRanking.get(user.userId);
          const markerColor =
            user.isOffRoute
              ? "#dc2626"
              : officialRank === 1
              ? "#f5c518"
              : user.isOwner
                ? "#ef4444"
                : "#16a34a";

          return (
            <Marker
              key={user.userId}
              position={[user.lat, user.lng]}
              icon={buildUserIcon(markerColor, `${user.bib ? `${user.bib} ` : ""}${label}`)}
              ref={(marker) => {
                markerRefs.current[user.userId] = marker;
              }}
            >
              <Popup>
                <div>
                  <strong>{label}</strong>
                  <br />
                  {officialRank
                    ? `Puesto ${officialRank}`
                    : "Pendiente de progreso GPX"}
                  <br />
                  Progreso: {((user.progressMeters ?? 0) / 1000).toFixed(1)} km
                  {typeof user.remainingMeters === "number" && (
                    <>
                      <br />
                      Restante: {(user.remainingMeters / 1000).toFixed(1)} km
                    </>
                  )}
                  {user.isOffRoute && (
                    <>
                      <br />
                      Fuera de ruta
                      {typeof user.distanceFromRouteMeters === "number"
                        ? ` (${Math.round(user.distanceFromRouteMeters)} m)`
                        : ""}
                    </>
                  )}
                  <br />
                  Lat: {user.lat.toFixed(5)}
                  <br />
                  Lng: {user.lng.toFixed(5)}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrapper: {
    height: "100vh",
    width: "100%",
    position: "relative",
    background: "var(--color-background)",
  },
  map: {
    height: "100%",
    width: "100%",
  },
};
