import { Db, ObjectId } from "mongodb";
import { GroupLayer } from "../models/groupLayer";
import { User } from "../models/user";

const EARTH_RADIUS_METERS = 6_371_000;
export const DEFAULT_OFF_ROUTE_THRESHOLD_METERS = 100;

type Position = [number, number];
type GeoJsonGeometry = {
  type?: unknown;
  coordinates?: unknown;
  geometries?: unknown;
};
type GeoJsonFeature = {
  geometry?: GeoJsonGeometry | null;
};
type GeoJsonFeatureCollection = {
  type?: unknown;
  features?: unknown;
};

export interface RouteProjection {
  progressMeters: number;
  remainingMeters: number;
  routeLengthMeters: number;
  progressPercent: number;
  distanceFromRouteMeters: number;
  isOffRoute: boolean;
  snappedLatitude: number;
  snappedLongitude: number;
}

export interface UserRouteProgress extends RouteProjection {
  groupId: string;
  routeLayerId: string;
}

export const calculateRouteRank = (
  currentProgressMeters: number,
  peerProgressMeters: number[],
): { rank: number; participantCount: number } => {
  const validPeerProgress = peerProgressMeters.filter(
    (progress) =>
      typeof progress === "number" &&
      Number.isFinite(progress) &&
      progress >= 0,
  );

  return {
    rank:
      1 +
      validPeerProgress.filter(
        (progress) => progress > currentProgressMeters,
      ).length,
    participantCount: validPeerProgress.length + 1,
  };
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const haversineDistance = (from: Position, to: Position): number => {
  const latitudeDelta = toRadians(to[1] - from[1]);
  const longitudeDelta = toRadians(to[0] - from[0]);
  const fromLatitude = toRadians(from[1]);
  const toLatitude = toRadians(to[1]);
  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);
  const a =
    sinLatitude * sinLatitude +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      sinLongitude *
      sinLongitude;

  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  Number.isFinite(value[0]) &&
  typeof value[1] === "number" &&
  Number.isFinite(value[1]) &&
  value[0] >= -180 &&
  value[0] <= 180 &&
  value[1] >= -90 &&
  value[1] <= 90;

const asLineString = (coordinates: unknown): Position[] | null => {
  if (!Array.isArray(coordinates)) return null;

  const positions = coordinates.filter(isPosition);
  return positions.length >= 2 && positions.length === coordinates.length
    ? positions
    : null;
};

const extractLinesFromGeometry = (geometry?: GeoJsonGeometry | null): Position[][] => {
  if (!geometry) return [];

  if (geometry.type === "LineString") {
    const line = asLineString(geometry.coordinates);
    return line ? [line] : [];
  }

  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map(asLineString)
      .filter((line): line is Position[] => line !== null);
  }

  if (geometry.type === "GeometryCollection" && Array.isArray(geometry.geometries)) {
    return geometry.geometries.flatMap((item) =>
      item && typeof item === "object"
        ? extractLinesFromGeometry(item as GeoJsonGeometry)
        : [],
    );
  }

  return [];
};

export const extractRouteLines = (geoJson: unknown): Position[][] => {
  if (!geoJson || typeof geoJson !== "object") return [];

  const collection = geoJson as GeoJsonFeatureCollection;
  if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    return [];
  }

  return collection.features.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    return extractLinesFromGeometry((item as GeoJsonFeature).geometry);
  });
};

const projectOntoSegment = (
  point: Position,
  start: Position,
  end: Position,
): {
  fraction: number;
  distanceMeters: number;
  snappedPosition: Position;
} => {
  const latitudeScale = EARTH_RADIUS_METERS * (Math.PI / 180);
  const longitudeScale =
    latitudeScale * Math.max(0.000001, Math.cos(toRadians(point[1])));
  const startX = (start[0] - point[0]) * longitudeScale;
  const startY = (start[1] - point[1]) * latitudeScale;
  const endX = (end[0] - point[0]) * longitudeScale;
  const endY = (end[1] - point[1]) * latitudeScale;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
  const rawFraction =
    segmentLengthSquared > 0
      ? -(startX * deltaX + startY * deltaY) / segmentLengthSquared
      : 0;
  const fraction = Math.max(0, Math.min(1, rawFraction));
  const projectedX = startX + fraction * deltaX;
  const projectedY = startY + fraction * deltaY;

  return {
    fraction,
    distanceMeters: Math.hypot(projectedX, projectedY),
    snappedPosition: [
      start[0] + fraction * (end[0] - start[0]),
      start[1] + fraction * (end[1] - start[1]),
    ],
  };
};

export const projectPositionOnRoute = ({
  latitude,
  longitude,
  geoJson,
  offRouteThresholdMeters = DEFAULT_OFF_ROUTE_THRESHOLD_METERS,
  preferredProgressMeters,
}: {
  latitude: number;
  longitude: number;
  geoJson: unknown;
  offRouteThresholdMeters?: number;
  preferredProgressMeters?: number;
}): RouteProjection | null => {
  const lines = extractRouteLines(geoJson);
  if (lines.length === 0) return null;

  const point: Position = [longitude, latitude];
  let routeLengthMeters = 0;
  const candidates: Array<{
    distanceMeters: number;
    progressMeters: number;
    snappedPosition: Position;
  }> = [];

  for (const line of lines) {
    for (let index = 1; index < line.length; index += 1) {
      const start = line[index - 1];
      const end = line[index];
      const segmentLengthMeters = haversineDistance(start, end);
      const projection = projectOntoSegment(point, start, end);
      const progressMeters =
        routeLengthMeters + segmentLengthMeters * projection.fraction;

      candidates.push({
        distanceMeters: projection.distanceMeters,
        progressMeters,
        snappedPosition: projection.snappedPosition,
      });

      routeLengthMeters += segmentLengthMeters;
    }
  }

  if (candidates.length === 0 || routeLengthMeters <= 0) return null;

  candidates.sort(
    (left, right) => left.distanceMeters - right.distanceMeters,
  );
  const nearestDistanceMeters = candidates[0].distanceMeters;
  const nearbyCandidates = candidates.filter(
    (candidate) => candidate.distanceMeters <= nearestDistanceMeters + 30,
  );
  const hasPreferredProgress =
    typeof preferredProgressMeters === "number" &&
    Number.isFinite(preferredProgressMeters) &&
    preferredProgressMeters >= 0;
  const nearest = hasPreferredProgress
    ? nearbyCandidates.sort(
        (left, right) =>
          Math.abs(left.progressMeters - preferredProgressMeters) -
          Math.abs(right.progressMeters - preferredProgressMeters),
      )[0]
    : candidates[0];

  const progressMeters = Math.max(
    0,
    Math.min(routeLengthMeters, nearest.progressMeters),
  );
  const distanceFromRouteMeters = nearest.distanceMeters;

  return {
    progressMeters,
    remainingMeters: Math.max(0, routeLengthMeters - progressMeters),
    routeLengthMeters,
    progressPercent: Math.max(
      0,
      Math.min(100, (progressMeters / routeLengthMeters) * 100),
    ),
    distanceFromRouteMeters,
    isOffRoute: distanceFromRouteMeters > offRouteThresholdMeters,
    snappedLatitude: nearest.snappedPosition[1],
    snappedLongitude: nearest.snappedPosition[0],
  };
};

export const resolveUserRouteProgress = async ({
  db,
  userId,
  latitude,
  longitude,
  preferredRouteLayerId,
  preferredProgressMeters,
}: {
  db: Db;
  userId: ObjectId;
  latitude: number;
  longitude: number;
  preferredRouteLayerId?: string;
  preferredProgressMeters?: number;
}): Promise<UserRouteProgress | null> => {
  const user = await db.collection<User>("users").findOne(
    { _id: userId },
    { projection: { groups: 1 } },
  );
  const groupIds = user?.groups ?? [];
  if (groupIds.length === 0) return null;

  const layers = await db
    .collection<GroupLayer>("groupLayers")
    .find({ groupId: { $in: groupIds }, type: "gpx" })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();
  const latestLayerByGroup = new Map<string, GroupLayer>();

  for (const layer of layers) {
    const groupId = layer.groupId.toString();
    if (!latestLayerByGroup.has(groupId)) {
      latestLayerByGroup.set(groupId, layer);
    }
  }

  const projections = Array.from(latestLayerByGroup.values())
    .map((layer) => {
      const projection = projectPositionOnRoute({
        latitude,
        longitude,
        geoJson: layer.geoJson,
        preferredProgressMeters:
          layer._id?.toString() === preferredRouteLayerId
            ? preferredProgressMeters
            : undefined,
      });

      if (!projection || !layer._id) return null;

      return {
        ...projection,
        groupId: layer.groupId.toString(),
        routeLayerId: layer._id.toString(),
      };
    })
    .filter((projection): projection is UserRouteProgress => projection !== null);

  if (projections.length === 0) return null;

  projections.sort(
    (left, right) =>
      left.distanceFromRouteMeters - right.distanceFromRouteMeters,
  );

  const preferred = preferredRouteLayerId
    ? projections.find(
        (projection) => projection.routeLayerId === preferredRouteLayerId,
      )
    : undefined;

  if (
    preferred &&
    preferred.distanceFromRouteMeters <=
      projections[0].distanceFromRouteMeters + 50
  ) {
    return preferred;
  }

  return projections[0];
};
