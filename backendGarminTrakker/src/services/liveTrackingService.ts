import { ObjectId } from "mongodb";
import { connectToDatabase } from "../config/db";
import {
  LiveTrackingLocationInput,
  LiveTrackingPeer,
  LiveTrackingSummary,
  LiveTrackingUserProjection,
} from "../models/liveTracking";
import { User } from "../models/user";
import { emitLocationUpdatedToUserGroups } from "../config/socket";
import {
  calculateRouteRank,
  resolveUserRouteProgress,
} from "./routeProgressService";

const LIVE_PEER_MAX_AGE_MS = 10 * 60 * 1000;

export const isValidCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export const isCoordinateInRange = (
  latitude: number,
  longitude: number,
): boolean =>
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

const isFreshPeer = (lastUpdateIso?: string): boolean => {
  if (!lastUpdateIso) return false;

  const updatedAt = new Date(lastUpdateIso).getTime();
  if (!Number.isFinite(updatedAt)) return false;

  return Date.now() - updatedAt <= LIVE_PEER_MAX_AGE_MS;
};

const getDisplayName = (user: LiveTrackingUserProjection): string => {
  const login = user.login?.trim();
  if (login) return login;

  const email = user.email?.trim();
  if (email) return email;

  return user._id?.toString().slice(0, 6) ?? "Usuario";
};

const buildPeer = (
  user: LiveTrackingUserProjection,
  deltaMeters: number,
  currentAverageSpeedKmH?: number,
): LiveTrackingPeer | null => {
  const progressMeters = user.garminTracking?.progressMeters;
  const lastUpdate = user.garminTracking?.last_update;
  const peerAverageSpeedKmH = user.garminTracking?.averageSpeedKmH;

  if (
    !user._id ||
    typeof progressMeters !== "number" ||
    !Number.isFinite(progressMeters) ||
    !isFreshPeer(lastUpdate)
  ) {
    return null;
  }

  const validSpeeds = [currentAverageSpeedKmH, peerAverageSpeedKmH].filter(
    (speed): speed is number =>
      typeof speed === "number" && Number.isFinite(speed) && speed > 0,
  );
  const referenceSpeedKmH =
    validSpeeds.length > 0
      ? validSpeeds.reduce((total, speed) => total + speed, 0) /
        validSpeeds.length
      : undefined;
  const gapSeconds = referenceSpeedKmH
    ? Math.round(Math.abs(deltaMeters) / (referenceSpeedKmH / 3.6))
    : undefined;

  return {
    userId: user._id.toString(),
    name: getDisplayName(user),
    deltaMeters: Math.round(Math.abs(deltaMeters)),
    gapSeconds,
    progressMeters,
    averageSpeedKmH: peerAverageSpeedKmH,
    last_update: lastUpdate as string,
  };
};

const findNearestPeers = async (
  userId: ObjectId,
  progressMeters?: number,
  averageSpeedKmH?: number,
  routeLayerId?: string,
  progressSource?: "route" | "device",
): Promise<
  Pick<LiveTrackingSummary, "ahead" | "behind" | "rank" | "participantCount">
> => {
  if (typeof progressMeters !== "number" || !Number.isFinite(progressMeters)) {
    return { ahead: null, behind: null };
  }

  const db = await connectToDatabase();
  const currentUser = await db.collection<User>("users").findOne(
    { _id: userId },
    { projection: { groups: 1 } },
  );

  const groupIds = currentUser?.groups ?? [];
  if (groupIds.length === 0) {
    return { ahead: null, behind: null };
  }

  const peerFilter: Record<string, unknown> = {
    _id: { $ne: userId },
    groups: { $in: groupIds },
    "garminTracking.progressMeters": { $type: "number" },
  };
  if (routeLayerId) {
    peerFilter["garminTracking.routeLayerId"] = routeLayerId;
  } else if (progressSource) {
    peerFilter["garminTracking.progressSource"] = progressSource;
  }

  const peers = await db
    .collection<LiveTrackingUserProjection>("users")
    .find(
      peerFilter,
      {
        projection: {
          login: 1,
          email: 1,
          garminTracking: 1,
        },
      },
    )
    .toArray();

  let ahead: LiveTrackingPeer | null = null;
  let behind: LiveTrackingPeer | null = null;
  const rankedPeerProgress: number[] = [];

  for (const peer of peers) {
    const peerProgress = peer.garminTracking?.progressMeters;
    if (typeof peerProgress !== "number" || !Number.isFinite(peerProgress)) {
      continue;
    }

    const deltaMeters = peerProgress - progressMeters;
    const candidate = buildPeer(peer, deltaMeters, averageSpeedKmH);
    if (!candidate) {
      continue;
    }
    rankedPeerProgress.push(peerProgress);

    if (deltaMeters > 0) {
      if (!ahead || candidate.deltaMeters < ahead.deltaMeters) {
        ahead = candidate;
      }
    } else if (deltaMeters < 0) {
      if (!behind || candidate.deltaMeters < behind.deltaMeters) {
        behind = candidate;
      }
    }
  }

  const ranking =
    routeLayerId && progressSource === "route"
      ? calculateRouteRank(progressMeters, rankedPeerProgress)
      : {};

  return { ahead, behind, ...ranking };
};

export const updateLiveTrackingLocation = async ({
  userId,
  latitude,
  longitude,
  elapsedDistanceMeters,
  averageSpeedMps,
  currentSpeedMps,
  timerTimeSeconds,
  source,
}: LiveTrackingLocationInput): Promise<LiveTrackingSummary | null> => {
  if (!ObjectId.isValid(userId)) {
    return null;
  }

  const userObjectId = new ObjectId(userId);
  const db = await connectToDatabase();
  const lastUpdateIso = new Date().toISOString();
  const existingUser = await db.collection<User>("users").findOne(
    { _id: userObjectId },
    { projection: { garminTracking: 1 } },
  );
  if (!existingUser) {
    return null;
  }

  const deviceProgressMeters =
    typeof elapsedDistanceMeters === "number" &&
    Number.isFinite(elapsedDistanceMeters) &&
    elapsedDistanceMeters >= 0
      ? elapsedDistanceMeters
      : undefined;
  const routeProgress = await resolveUserRouteProgress({
    db,
    userId: userObjectId,
    latitude,
    longitude,
    preferredRouteLayerId: existingUser.garminTracking?.routeLayerId,
    preferredProgressMeters:
      typeof existingUser.garminTracking?.progressMeters === "number" &&
      typeof existingUser.garminTracking?.elapsedDistanceMeters === "number" &&
      typeof deviceProgressMeters === "number" &&
      deviceProgressMeters >=
        existingUser.garminTracking.elapsedDistanceMeters
        ? existingUser.garminTracking.progressMeters +
          deviceProgressMeters -
          existingUser.garminTracking.elapsedDistanceMeters
        : undefined,
  });
  const progressMeters = routeProgress?.progressMeters ?? deviceProgressMeters;
  const progressSource =
    routeProgress
      ? "route"
      : typeof deviceProgressMeters === "number"
        ? "device"
        : undefined;
  const averageSpeedKmH =
    typeof averageSpeedMps === "number" &&
    Number.isFinite(averageSpeedMps) &&
    averageSpeedMps >= 0
      ? averageSpeedMps * 3.6
      : undefined;
  const currentSpeedKmH =
    typeof currentSpeedMps === "number" &&
    Number.isFinite(currentSpeedMps) &&
    currentSpeedMps >= 0
      ? currentSpeedMps * 3.6
      : undefined;

  const updateFields: Record<string, unknown> = {
    location: {
      latitude,
      longitude,
      last_update: lastUpdateIso,
    },
    "garminTracking.source": source,
    "garminTracking.last_update": lastUpdateIso,
  };

  if (typeof deviceProgressMeters === "number") {
    updateFields["garminTracking.elapsedDistanceMeters"] =
      deviceProgressMeters;
  }

  if (typeof progressMeters === "number") {
    updateFields["garminTracking.progressMeters"] = progressMeters;
  }

  if (progressSource) {
    updateFields["garminTracking.progressSource"] = progressSource;
  }

  if (routeProgress) {
    updateFields["garminTracking.remainingMeters"] =
      routeProgress.remainingMeters;
    updateFields["garminTracking.routeLengthMeters"] =
      routeProgress.routeLengthMeters;
    updateFields["garminTracking.progressPercent"] =
      routeProgress.progressPercent;
    updateFields["garminTracking.distanceFromRouteMeters"] =
      routeProgress.distanceFromRouteMeters;
    updateFields["garminTracking.isOffRoute"] = routeProgress.isOffRoute;
    updateFields["garminTracking.routeLayerId"] = routeProgress.routeLayerId;
    updateFields["garminTracking.groupId"] = routeProgress.groupId;
    updateFields["garminTracking.snappedLatitude"] =
      routeProgress.snappedLatitude;
    updateFields["garminTracking.snappedLongitude"] =
      routeProgress.snappedLongitude;
  }

  if (typeof averageSpeedKmH === "number") {
    updateFields["garminTracking.averageSpeedKmH"] = averageSpeedKmH;
  }

  if (typeof currentSpeedKmH === "number") {
    updateFields["garminTracking.currentSpeedKmH"] = currentSpeedKmH;
  }

  if (
    typeof timerTimeSeconds === "number" &&
    Number.isFinite(timerTimeSeconds) &&
    timerTimeSeconds >= 0
  ) {
    updateFields["garminTracking.timerTimeSeconds"] = timerTimeSeconds;
  }

  const clearRouteFields = {
    "garminTracking.remainingMeters": "",
    "garminTracking.routeLengthMeters": "",
    "garminTracking.progressPercent": "",
    "garminTracking.distanceFromRouteMeters": "",
    "garminTracking.isOffRoute": "",
    "garminTracking.routeLayerId": "",
    "garminTracking.groupId": "",
    "garminTracking.snappedLatitude": "",
    "garminTracking.snappedLongitude": "",
  };
  const result = await db.collection("users").updateOne(
    { _id: userObjectId },
    routeProgress
      ? { $set: updateFields }
      : { $set: updateFields, $unset: clearRouteFields },
  );

  if (!result.acknowledged || result.matchedCount === 0) {
    return null;
  }

  await emitLocationUpdatedToUserGroups({
    userId,
    latitude,
    longitude,
    lastUpdateIso,
    progressMeters,
    averageSpeedKmH,
    currentSpeedKmH,
    routeProgress,
    progressSource,
  });

  const peers = await findNearestPeers(
    userObjectId,
    progressMeters,
    averageSpeedKmH,
    routeProgress?.routeLayerId,
    progressSource,
  );

  return {
    progressMeters,
    progressSource,
    remainingMeters: routeProgress?.remainingMeters,
    routeLengthMeters: routeProgress?.routeLengthMeters,
    progressPercent: routeProgress?.progressPercent,
    distanceFromRouteMeters: routeProgress?.distanceFromRouteMeters,
    isOffRoute: routeProgress?.isOffRoute,
    routeLayerId: routeProgress?.routeLayerId,
    groupId: routeProgress?.groupId,
    last_update: lastUpdateIso,
    ...peers,
  };
};
