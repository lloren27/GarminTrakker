import type { FeatureCollection, Feature, LineString, Point } from "geojson";

function getTextContent(element: Element, selector: string): string | null {
  return element.querySelector(selector)?.textContent?.trim() || null;
}

function readPoint(element: Element): [number, number] | null {
  const latitude = Number(element.getAttribute("lat"));
  const longitude = Number(element.getAttribute("lon"));

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return [longitude, latitude];
}

export function parseGpxToGeoJson(
  content: string,
  fallbackName: string,
): FeatureCollection {
  const parser = new DOMParser();
  const document = parser.parseFromString(content, "application/xml");

  if (document.querySelector("parsererror") || !document.querySelector("gpx")) {
    throw new Error("El archivo no parece un GPX válido.");
  }

  const name = getTextContent(document.documentElement, "metadata > name") ||
    getTextContent(document.documentElement, "trk > name") ||
    fallbackName;

  const features: Array<Feature<LineString | Point>> = [];

  document.querySelectorAll("trkseg").forEach((segment, index) => {
    const coordinates = Array.from(segment.querySelectorAll("trkpt"))
      .map(readPoint)
      .filter((point): point is [number, number] => Boolean(point));

    if (coordinates.length >= 2) {
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates,
        },
        properties: {
          name: index === 0 ? name : `${name} ${index + 1}`,
          layerType: "gpx",
          featureType: "track",
          pointCount: coordinates.length,
        },
      });
    }
  });

  const routeCoordinates = Array.from(document.querySelectorAll("rtept"))
    .map(readPoint)
    .filter((point): point is [number, number] => Boolean(point));

  if (routeCoordinates.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: routeCoordinates,
      },
      properties: {
        name,
        layerType: "gpx",
        featureType: "route",
        pointCount: routeCoordinates.length,
      },
    });
  }

  document.querySelectorAll("wpt").forEach((waypoint) => {
    const point = readPoint(waypoint);
    if (!point) return;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: point,
      },
      properties: {
        name: getTextContent(waypoint, "name") || "Punto GPX",
        layerType: "gpx",
        featureType: "waypoint",
      },
    });
  });

  if (features.length === 0) {
    throw new Error("No se encontraron tracks, rutas ni puntos en el GPX.");
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
