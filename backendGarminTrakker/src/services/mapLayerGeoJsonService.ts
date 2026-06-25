import axios from "axios";
import { AdminMapLayerType } from "../models/adminMapLayer";

const MAX_FEATURES_PER_ADMIN_LAYER = 5000;
const ADMIN_LAYER_COLOR = "#2563EB";
const SUPPORTED_GEOMETRY_TYPES = new Set([
  "Point",
  "MultiPoint",
  "LineString",
  "MultiLineString",
  "Polygon",
  "MultiPolygon",
]);

type NormalizedFeature = {
  type: "Feature";
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
};

function decodeXmlText(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function getFirstTagText(xml: string, tagName: string): string | null {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ? decodeXmlText(match[1].trim()) : null;
}

function parseCoordinateAttributes(attributes: string): [number, number] | null {
  const latitude = Number(attributes.match(/\blat=["']([^"']+)["']/i)?.[1]);
  const longitude = Number(attributes.match(/\blon=["']([^"']+)["']/i)?.[1]);

  if (
    Number.isNaN(latitude) ||
    Number.isNaN(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return [longitude, latitude];
}

function extractPoints(xml: string, tagName: string): [number, number][] {
  const points: [number, number][] = [];
  const pointRegex = new RegExp(`<${tagName}\\b([^>]*)>`, "gi");
  let match: RegExpExecArray | null;

  while ((match = pointRegex.exec(xml))) {
    const point = parseCoordinateAttributes(match[1]);

    if (point) {
      points.push(point);
    }
  }

  return points;
}

function parseGpxToGeoJson(gpx: string, fallbackName: string) {
  const trimmedGpx = gpx.trim();

  if (!trimmedGpx || !/<gpx\b/i.test(trimmedGpx)) {
    throw new Error("El contenido no parece ser un GPX válido.");
  }

  const baseName = getFirstTagText(trimmedGpx, "name") || fallbackName;
  const features: NormalizedFeature[] = [];
  const segmentRegex = /<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/gi;
  let segmentMatch: RegExpExecArray | null;
  let segmentIndex = 0;

  while ((segmentMatch = segmentRegex.exec(trimmedGpx))) {
    const coordinates = extractPoints(segmentMatch[1], "trkpt");

    if (coordinates.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates,
        },
        properties: {
          name: segmentIndex === 0 ? baseName : `${baseName} ${segmentIndex + 1}`,
          layerType: "gpx",
          featureType: "track",
          color: ADMIN_LAYER_COLOR,
          pointCount: coordinates.length,
        },
      });
      segmentIndex += 1;
    }
  }

  if (features.length === 0) {
    const fallbackTrack = extractPoints(trimmedGpx, "trkpt");

    if (fallbackTrack.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: fallbackTrack,
        },
        properties: {
          name: baseName,
          layerType: "gpx",
          featureType: "track",
          color: ADMIN_LAYER_COLOR,
          pointCount: fallbackTrack.length,
        },
      });
    }
  }

  const routePoints = extractPoints(trimmedGpx, "rtept");

  if (routePoints.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: routePoints,
      },
      properties: {
        name: baseName,
        layerType: "gpx",
        featureType: "route",
        color: ADMIN_LAYER_COLOR,
        pointCount: routePoints.length,
      },
    });
  }

  const waypointRegex = /<wpt\b([^>]*)>([\s\S]*?)<\/wpt>/gi;
  let waypointMatch: RegExpExecArray | null;

  while ((waypointMatch = waypointRegex.exec(trimmedGpx))) {
    const point = parseCoordinateAttributes(waypointMatch[1]);

    if (!point) continue;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: point,
      },
      properties: {
        name: getFirstTagText(waypointMatch[2], "name") || "Punto GPX",
        layerType: "gpx",
        featureType: "waypoint",
        color: ADMIN_LAYER_COLOR,
      },
    });
  }

  if (features.length === 0) {
    throw new Error("No se encontraron tracks, rutas ni puntos en el GPX.");
  }

  return {
    type: "FeatureCollection" as const,
    features,
  };
}

function parseKmlCoordinates(value: string): [number, number][] {
  return value
    .trim()
    .split(/\s+/)
    .map((chunk) => {
      const [longitude, latitude] = chunk.split(",").map(Number);

      if (
        Number.isNaN(latitude) ||
        Number.isNaN(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return null;
      }

      return [longitude, latitude] as [number, number];
    })
    .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));
}

function parseKmlToGeoJson(kml: string, fallbackName: string) {
  const trimmedKml = kml.trim();

  if (!trimmedKml || !/<kml\b/i.test(trimmedKml)) {
    throw new Error("El contenido no parece ser un KML válido.");
  }

  const features: NormalizedFeature[] = [];
  const placemarkRegex = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi;
  let placemarkMatch: RegExpExecArray | null;

  while ((placemarkMatch = placemarkRegex.exec(trimmedKml))) {
    const placemark = placemarkMatch[1];
    const name = getFirstTagText(placemark, "name") || fallbackName;
    const pointMatch = placemark.match(
      /<Point\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/i,
    );
    const lineMatches = Array.from(
      placemark.matchAll(
        /<LineString\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/gi,
      ),
    );
    const polygonMatches = Array.from(
      placemark.matchAll(
        /<Polygon\b[^>]*>[\s\S]*?<outerBoundaryIs\b[^>]*>[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/outerBoundaryIs>[\s\S]*?<\/Polygon>/gi,
      ),
    );

    if (pointMatch) {
      const coordinates = parseKmlCoordinates(pointMatch[1]);

      if (coordinates[0]) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: coordinates[0],
          },
          properties: {
            name,
            layerType: "kml",
            color: ADMIN_LAYER_COLOR,
          },
        });
      }
    }

    lineMatches.forEach((lineMatch, index) => {
      const coordinates = parseKmlCoordinates(lineMatch[1]);

      if (coordinates.length >= 2) {
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates,
          },
          properties: {
            name: index === 0 ? name : `${name} ${index + 1}`,
            layerType: "kml",
            color: ADMIN_LAYER_COLOR,
            pointCount: coordinates.length,
          },
        });
      }
    });

    polygonMatches.forEach((polygonMatch, index) => {
      const coordinates = parseKmlCoordinates(polygonMatch[1]);

      if (coordinates.length >= 4) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [coordinates],
          },
          properties: {
            name: index === 0 ? name : `${name} ${index + 1}`,
            layerType: "kml",
            color: ADMIN_LAYER_COLOR,
            pointCount: coordinates.length,
          },
        });
      }
    });
  }

  if (features.length === 0) {
    throw new Error("No se encontraron puntos, líneas ni polígonos en el KML.");
  }

  return {
    type: "FeatureCollection" as const,
    features,
  };
}

function normalizeFeature(feature: unknown): NormalizedFeature | null {
  if (!feature || typeof feature !== "object") return null;

  const candidate = feature as {
    type?: unknown;
    geometry?: {
      type?: unknown;
      coordinates?: unknown;
    } | null;
    properties?: unknown;
  };

  if (
    candidate.type !== "Feature" ||
    !candidate.geometry ||
    typeof candidate.geometry.type !== "string" ||
    !SUPPORTED_GEOMETRY_TYPES.has(candidate.geometry.type)
  ) {
    return null;
  }

  return {
    type: "Feature",
    geometry: {
      type: candidate.geometry.type,
      coordinates: candidate.geometry.coordinates,
    },
    properties:
      candidate.properties && typeof candidate.properties === "object"
        ? {
            ...(candidate.properties as Record<string, unknown>),
            color:
              (candidate.properties as Record<string, unknown>).color ||
              ADMIN_LAYER_COLOR,
          }
        : { color: ADMIN_LAYER_COLOR },
  };
}

export function normalizeGeoJson(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new Error("GeoJSON inválido.");
  }

  const candidate = input as {
    type?: unknown;
    features?: unknown;
  };

  const rawFeatures =
    candidate.type === "FeatureCollection" && Array.isArray(candidate.features)
      ? candidate.features
      : candidate.type === "Feature"
        ? [candidate]
        : null;

  if (!rawFeatures) {
    throw new Error("La capa debe ser un Feature o FeatureCollection GeoJSON.");
  }

  const features = rawFeatures
    .map((feature) => normalizeFeature(feature))
    .filter((feature): feature is NormalizedFeature => Boolean(feature));

  if (features.length === 0) {
    throw new Error("La capa no contiene geometrías soportadas.");
  }

  if (features.length > MAX_FEATURES_PER_ADMIN_LAYER) {
    throw new Error(`La capa supera el límite de ${MAX_FEATURES_PER_ADMIN_LAYER} features.`);
  }

  return {
    type: "FeatureCollection" as const,
    features,
  };
}

export async function extractMapLayerGeoJson({
  name,
  type,
  sourceUrl,
  rawContent,
  geoJson,
}: {
  name: string;
  type: AdminMapLayerType;
  sourceUrl?: string;
  rawContent?: string;
  geoJson?: unknown;
}) {
  let content = rawContent;

  if (sourceUrl) {
    const response = await axios.get<string | Record<string, unknown>>(sourceUrl, {
      responseType: "text",
      timeout: 12000,
      maxContentLength: 5 * 1024 * 1024,
    });

    content =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data);
  }

  if (type === "gpx") {
    if (!content) {
      throw new Error("Hace falta contenido GPX o una URL para extraer la capa.");
    }

    return normalizeGeoJson(parseGpxToGeoJson(content, name));
  }

  if (type === "kml") {
    if (!content) {
      throw new Error("Hace falta contenido KML o una URL para extraer la capa.");
    }

    return normalizeGeoJson(parseKmlToGeoJson(content, name));
  }

  if (geoJson) {
    return normalizeGeoJson(geoJson);
  }

  if (!content) {
    throw new Error("Hace falta GeoJSON o una URL para extraer la capa.");
  }

  return normalizeGeoJson(JSON.parse(content));
}
