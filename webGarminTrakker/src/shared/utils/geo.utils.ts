import type {
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
  Position,
} from "geojson";

type LatLng = {
  lat: number;
  lng: number;
};

type RoutePoint = {
  lat: number;
  lng: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidPosition(position: Position | undefined): position is Position {
  return !!position && isFiniteNumber(position[0]) && isFiniteNumber(position[1]);
}

function toRoutePoint(position: Position): RoutePoint {
  return {
    lng: position[0],
    lat: position[1],
  };
}

function extractCoordinatesFromGeometry(geometry: Geometry | null): RoutePoint[] {
  if (!geometry) return [];

  if (geometry.type === "LineString") {
    return (geometry as LineString).coordinates
      .filter(isValidPosition)
      .map(toRoutePoint);
  }

  if (geometry.type === "MultiLineString") {
    return (geometry as MultiLineString).coordinates
      .flat()
      .filter(isValidPosition)
      .map(toRoutePoint);
  }

  return [];
}

export function extractRouteCoordinates(routeGeoJson: FeatureCollection): RoutePoint[] {
  const allPoints: RoutePoint[] = [];

  for (const feature of routeGeoJson.features) {
    const points = extractCoordinatesFromGeometry(feature.geometry);
    allPoints.push(...points);
  }

  return dedupeConsecutivePoints(allPoints);
}

function dedupeConsecutivePoints(points: RoutePoint[]): RoutePoint[] {
  if (points.length <= 1) return points;

  const result: RoutePoint[] = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const prev = result[result.length - 1];
    const current = points[i];

    if (prev.lat !== current.lat || prev.lng !== current.lng) {
      result.push(current);
    }
  }

  return result;
}

export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const toRad = (value: number) => (value * Math.PI) / 180;

  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

export function calculateTotalDistanceKm(routeGeoJson: FeatureCollection): number {
  const points = extractRouteCoordinates(routeGeoJson);

  if (points.length < 2) return 0;

  let total = 0;

  for (let i = 0; i < points.length - 1; i += 1) {
    total += haversineDistanceKm(points[i], points[i + 1]);
  }

  return total;
}

function toLocalXYKm(point: LatLng, referenceLat: number) {
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos((referenceLat * Math.PI) / 180);

  return {
    x: point.lng * kmPerDegLng,
    y: point.lat * kmPerDegLat,
  };
}

function projectPointOnSegment(
  point: LatLng,
  segmentStart: LatLng,
  segmentEnd: LatLng
) {
  const referenceLat = (segmentStart.lat + segmentEnd.lat + point.lat) / 3;

  const p = toLocalXYKm(point, referenceLat);
  const a = toLocalXYKm(segmentStart, referenceLat);
  const b = toLocalXYKm(segmentEnd, referenceLat);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSquared = abx * abx + aby * aby;

  if (abLenSquared === 0) {
    return {
      t: 0,
      projectedPoint: segmentStart,
      distanceKm: haversineDistanceKm(point, segmentStart),
    };
  }

  const apx = p.x - a.x;
  const apy = p.y - a.y;

  const rawT = (apx * abx + apy * aby) / abLenSquared;
  const t = Math.max(0, Math.min(1, rawT));

  const projectedXY = {
    x: a.x + abx * t,
    y: a.y + aby * t,
  };

  const projectedPoint: LatLng = {
    lng: projectedXY.x / (111.32 * Math.cos((referenceLat * Math.PI) / 180)),
    lat: projectedXY.y / 111.32,
  };

  const dx = p.x - projectedXY.x;
  const dy = p.y - projectedXY.y;

  return {
    t,
    projectedPoint,
    distanceKm: Math.sqrt(dx * dx + dy * dy),
  };
}

function getNearestPointOnRoute(
  routePoints: RoutePoint[],
  currentPosition: LatLng,
  previousCoveredDistanceKm?: number,
) {
  let bestSegmentIndex = -1;
  let bestProjectedPoint: LatLng | null = null;
  let bestDistanceKm = Number.POSITIVE_INFINITY;
  let bestCoveredDistanceKm = 0;
  let distanceBeforeSegmentKm = 0;

  const hasPreviousProgress =
    typeof previousCoveredDistanceKm === "number" &&
    Number.isFinite(previousCoveredDistanceKm);
  const distanceTieThresholdKm = 0.03;

  for (let i = 0; i < routePoints.length - 1; i += 1) {
    const start = routePoints[i];
    const end = routePoints[i + 1];
    const segmentDistanceKm = haversineDistanceKm(start, end);

    const projection = projectPointOnSegment(currentPosition, start, end);
    const coveredDistanceKm =
      distanceBeforeSegmentKm +
      haversineDistanceKm(start, projection.projectedPoint);

    const isSpatiallyBetter = projection.distanceKm < bestDistanceKm;
    const isProgressBetterTie =
      hasPreviousProgress &&
      Math.abs(projection.distanceKm - bestDistanceKm) <=
        distanceTieThresholdKm &&
      Math.abs(coveredDistanceKm - previousCoveredDistanceKm) <
        Math.abs(bestCoveredDistanceKm - previousCoveredDistanceKm);

    if (isSpatiallyBetter || isProgressBetterTie) {
      bestDistanceKm = projection.distanceKm;
      bestProjectedPoint = projection.projectedPoint;
      bestSegmentIndex = i;
      bestCoveredDistanceKm = coveredDistanceKm;
    }

    distanceBeforeSegmentKm += segmentDistanceKm;
  }

  return {
    segmentIndex: bestSegmentIndex,
    projectedPoint: bestProjectedPoint,
    distanceToRouteKm: bestDistanceKm,
    coveredDistanceKm: bestCoveredDistanceKm,
  };
}

export function calculateRouteProgressKm(
  routeGeoJson: FeatureCollection,
  currentPosition: LatLng,
  previousCoveredDistanceKm?: number,
): { coveredDistanceKm: number; remainingDistanceKm: number; totalDistanceKm: number } {
  const routePoints = extractRouteCoordinates(routeGeoJson);
  const totalDistanceKm = calculateTotalDistanceKm(routeGeoJson);

  if (routePoints.length === 0) {
    return { coveredDistanceKm: 0, remainingDistanceKm: 0, totalDistanceKm: 0 };
  }
  if (routePoints.length === 1) {
    return {
      coveredDistanceKm: 0,
      remainingDistanceKm: haversineDistanceKm(currentPosition, routePoints[0]),
      totalDistanceKm: 0,
    };
  }

  const nearest = getNearestPointOnRoute(
    routePoints,
    currentPosition,
    previousCoveredDistanceKm,
  );

  if (
    nearest.segmentIndex < 0 ||
    !nearest.projectedPoint
  ) {
    return {
      coveredDistanceKm: 0,
      remainingDistanceKm: totalDistanceKm,
      totalDistanceKm,
    };
  }

  const coveredDistanceKm = Math.max(
    0,
    Math.min(totalDistanceKm, nearest.coveredDistanceKm),
  );
  const remainingDistanceKm = Math.max(0, totalDistanceKm - coveredDistanceKm);

  return {
    coveredDistanceKm,
    remainingDistanceKm,
    totalDistanceKm,
  };
}

export function calculateRemainingDistanceKm(
  routeGeoJson: FeatureCollection,
  currentPosition: LatLng,
  previousCoveredDistanceKm?: number,
): number {
  return calculateRouteProgressKm(
    routeGeoJson,
    currentPosition,
    previousCoveredDistanceKm,
  ).remainingDistanceKm;
}

export function calculateCoveredDistanceKm(
  routeGeoJson: FeatureCollection,
  currentPosition: LatLng,
  previousCoveredDistanceKm?: number,
): number {
  return calculateRouteProgressKm(
    routeGeoJson,
    currentPosition,
    previousCoveredDistanceKm,
  ).coveredDistanceKm;
}
