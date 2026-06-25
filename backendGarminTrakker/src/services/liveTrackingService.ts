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
): LiveTrackingPeer | null => {
  const progressMeters = user.garminTracking?.progressMeters;
  const lastUpdate = user.garminTracking?.last_update;

  if (
    !user._id ||
    typeof progressMeters !== "number" ||
    !Number.isFinite(progressMeters) ||
    !isFreshPeer(lastUpdate)
  ) {
    return null;
  }

  return {
    userId: user._id.toString(),
    name: getDisplayName(user),
    deltaMeters: Math.round(Math.abs(deltaMeters)),
    progressMeters,
    last_update: lastUpdate as string,
  };
};

const findNearestPeers = async (
  userId: ObjectId,
  progressMeters?: number,
): Promise<Pick<LiveTrackingSummary, "ahead" | "behind">> => {
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

  const peers = await db
    .collection<LiveTrackingUserProjection>("users")
    .find(
      {
        _id: { $ne: userId },
        groups: { $in: groupIds },
        "garminTracking.progressMeters": { $type: "number" },
      },
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

  for (const peer of peers) {
    const peerProgress = peer.garminTracking?.progressMeters;
    if (typeof peerProgress !== "number" || !Number.isFinite(peerProgress)) {
      continue;
    }

    const deltaMeters = peerProgress - progressMeters;
    const candidate = buildPeer(peer, deltaMeters);
    if (!candidate) {
      continue;
    }

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

  return { ahead, behind };
};

export const updateLiveTrackingLocation = async ({
  userId,
  latitude,
  longitude,
  elapsedDistanceMeters,
  source,
}: LiveTrackingLocationInput): Promise<LiveTrackingSummary | null> => {
  if (!ObjectId.isValid(userId)) {
    return null;
  }

  const userObjectId = new ObjectId(userId);
  const db = await connectToDatabase();
  const lastUpdateIso = new Date().toISOString();
  const progressMeters =
    typeof elapsedDistanceMeters === "number" &&
    Number.isFinite(elapsedDistanceMeters) &&
    elapsedDistanceMeters >= 0
      ? elapsedDistanceMeters
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

  if (typeof progressMeters === "number") {
    updateFields["garminTracking.elapsedDistanceMeters"] = progressMeters;
    updateFields["garminTracking.progressMeters"] = progressMeters;
  }

  const result = await db.collection("users").updateOne(
    { _id: userObjectId },
    { $set: updateFields },
  );

  if (!result.acknowledged || result.matchedCount === 0) {
    return null;
  }

  await emitLocationUpdatedToUserGroups(
    userId,
    latitude,
    longitude,
    lastUpdateIso,
  );

  const peers = await findNearestPeers(userObjectId, progressMeters);

  return {
    progressMeters,
    last_update: lastUpdateIso,
    ...peers,
  };
};
