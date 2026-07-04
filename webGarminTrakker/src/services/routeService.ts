import { API_URL } from "../config";
import type { TrackingRouteResponse } from "../types/tracking";
import { getAccessToken } from "./apiClient";
import { getGroupTracking } from "./groupService";

const demoUpdatedAt = () => new Date().toISOString();
const DEMO_ROUTE_LENGTH_METERS = 10240;
const DEMO_ROUTE_LAYER_ID = "66a300000000000000000001";

const demoRouteGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        name: "Marcha Lagos - demo",
        layerType: "gpx",
        featureType: "track",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-5.05137, 43.35162],
          [-5.04783, 43.34822],
          [-5.04191, 43.34414],
          [-5.03702, 43.33951],
          [-5.03237, 43.33418],
          [-5.02678, 43.32884],
          [-5.02013, 43.32321],
          [-5.01277, 43.31816],
          [-5.00554, 43.31332],
          [-4.99721, 43.30904],
          [-4.98836, 43.30518],
          [-4.97943, 43.30195],
          [-4.97012, 43.29904],
          [-4.96255, 43.29671],
          [-4.95532, 43.29493],
        ],
      },
    },
  ],
} as TrackingRouteResponse["route"]["dataRouteJson"];

const buildDemoTracking = (trackingId: string): TrackingRouteResponse => {
  const updatedAt = demoUpdatedAt();

  return {
    trackingId,
    isActive: true,
    expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    isPublic: true,
    participants: [
      {
        userId: "66a100000000000000000004",
        username: "sara",
        email: "sara@garmintrakker.local",
        bib: "104",
        team: "Escapada",
        role: "participant",
        status: "accepted",
        progressMeters: 6495,
        progressSource: "route",
        remainingMeters: 3745,
        routeLengthMeters: DEMO_ROUTE_LENGTH_METERS,
        progressPercent: 63.43,
        distanceFromRouteMeters: 0,
        isOffRoute: false,
        routeLayerId: DEMO_ROUTE_LAYER_ID,
        speedKmH: 31.2,
        location: { lat: 43.30904, lng: -4.99721, updatedAt },
      },
      {
        userId: "66a100000000000000000002",
        username: "ana",
        email: "ana@garmintrakker.local",
        bib: "102",
        team: "Cabeza de marcha",
        role: "participant",
        status: "accepted",
        progressMeters: 4875,
        progressSource: "route",
        remainingMeters: 5365,
        routeLengthMeters: DEMO_ROUTE_LENGTH_METERS,
        progressPercent: 47.61,
        distanceFromRouteMeters: 0,
        isOffRoute: false,
        routeLayerId: DEMO_ROUTE_LAYER_ID,
        speedKmH: 29.6,
        location: { lat: 43.31816, lng: -5.01277, updatedAt },
      },
      {
        userId: "66a100000000000000000001",
        username: "lloren",
        email: "lloren@garmintrakker.local",
        bib: "101",
        team: "GarminTrakker",
        role: "owner",
        status: "accepted",
        progressMeters: 4057,
        progressSource: "route",
        remainingMeters: 6183,
        routeLengthMeters: DEMO_ROUTE_LENGTH_METERS,
        progressPercent: 39.62,
        distanceFromRouteMeters: 0,
        isOffRoute: false,
        routeLayerId: DEMO_ROUTE_LAYER_ID,
        speedKmH: 28.8,
        location: { lat: 43.32321, lng: -5.02013, updatedAt },
      },
      {
        userId: "66a100000000000000000003",
        username: "miguel",
        email: "miguel@garmintrakker.local",
        bib: "103",
        team: "Peloton",
        role: "participant",
        status: "accepted",
        progressMeters: 3231,
        progressSource: "route",
        remainingMeters: 7009,
        routeLengthMeters: DEMO_ROUTE_LENGTH_METERS,
        progressPercent: 31.55,
        distanceFromRouteMeters: 145,
        isOffRoute: true,
        routeLayerId: DEMO_ROUTE_LAYER_ID,
        speedKmH: 27.4,
        location: { lat: 43.33014, lng: -5.02678, updatedAt },
      },
    ],
    route: {
      id: DEMO_ROUTE_LAYER_ID,
      name: "Marcha Lagos de Covadonga 2026",
      source: "GarminTrakker demo",
      dataRouteJson: demoRouteGeoJson,
    },
  };
};

export const fetchRouteByTrackingId = async (
  trackingId: string,
): Promise<TrackingRouteResponse> => {
  if (getAccessToken() && trackingId !== "demo" && trackingId.toUpperCase() !== "LAGOS26") {
    return getGroupTracking(trackingId);
  }

  let res: Response;

  try {
    res = await fetch(`${API_URL}/api/v1/tracking/${trackingId}`);
  } catch (error) {
    console.warn("Usando demo GarminTrakker: backend no disponible", error);
    return buildDemoTracking(trackingId);
  }

  let data: unknown = null;

  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (trackingId.toUpperCase() === "LAGOS26" || trackingId === "demo") {
      return buildDemoTracking(trackingId);
    }

    const errorData = data as
      | {
          error?: string;
          errors?: Array<{ message: string }>;
        }
      | null;

    if (errorData?.errors?.length) {
      throw new Error(errorData.errors.map((e) => e.message).join(", "));
    }

    throw new Error(errorData?.error || "Error al cargar la ruta");
  }

  const response = data as TrackingRouteResponse;

  return {
    trackingId: response.trackingId,
    isActive: response.isActive,
    expiresAt: response.expiresAt,
    isPublic: response.isPublic,
    participants: response.participants ?? [],
    route: {
      id: response.route.id,
      name: response.route.name,
      source: response.route.source,
      dataRouteJson: response.route.dataRouteJson,
    },
  };
};
