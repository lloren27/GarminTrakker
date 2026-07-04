import crypto from "crypto";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../config/db";
import { GarminDevice, GarminPairing } from "../models/garminDevice";

const PAIRING_CODE_LENGTH = 8;
const PAIRING_TTL_MS = 20 * 60 * 1000;
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEVICE_ONLINE_MAX_AGE_MS = 2 * 60 * 1000;

const hashValue = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

export const normalizePairingCode = (value: string): string =>
  value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

const generatePairingCode = (): string => {
  const bytes = crypto.randomBytes(PAIRING_CODE_LENGTH);
  return Array.from(bytes)
    .map((byte) => PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length])
    .join("");
};

const generateDeviceToken = (): string =>
  `gt_${crypto.randomBytes(32).toString("base64url")}`;

const formatPairingCode = (code: string): string =>
  `${code.slice(0, 4)}-${code.slice(4)}`;

export const startGarminPairing = async ({
  deviceId,
  model,
}: {
  deviceId: string;
  model?: string;
}) => {
  const db = await connectToDatabase();
  const normalizedDeviceId = deviceId.trim();
  const deviceIdHash = hashValue(normalizedDeviceId);
  const code = generatePairingCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PAIRING_TTL_MS);

  await db
    .collection<GarminPairing>("garminPairings")
    .deleteMany({ deviceIdHash });

  await db.collection<GarminPairing>("garminPairings").insertOne({
    codeHash: hashValue(code),
    deviceIdHash,
    model: model?.trim() || undefined,
    status: "pending",
    createdAt: now,
    expiresAt,
  });

  return {
    pairingCode: formatPairingCode(code),
    expiresAt: expiresAt.toISOString(),
  };
};

export const getGarminPairingStatus = async ({
  deviceId,
  pairingCode,
}: {
  deviceId: string;
  pairingCode: string;
}) => {
  const db = await connectToDatabase();
  const pairing = await db.collection<GarminPairing>("garminPairings").findOne({
    deviceIdHash: hashValue(deviceId.trim()),
    codeHash: hashValue(normalizePairingCode(pairingCode)),
    expiresAt: { $gt: new Date() },
  });

  if (!pairing) return null;

  if (pairing.status === "paired") {
    await db.collection<GarminDevice>("garminDevices").updateOne(
      {
        deviceIdHash: pairing.deviceIdHash,
        revokedAt: null,
      },
      { $set: { lastSeenAt: new Date().toISOString() } },
    );
  }

  return {
    status: pairing.status,
    deviceToken: pairing.status === "paired" ? pairing.deviceToken : undefined,
    expiresAt: pairing.expiresAt.toISOString(),
  };
};

export const pairGarminDevice = async ({
  userId,
  pairingCode,
}: {
  userId: string;
  pairingCode: string;
}) => {
  const db = await connectToDatabase();
  const normalizedCode = normalizePairingCode(pairingCode);
  const pairing = await db.collection<GarminPairing>("garminPairings").findOne({
    codeHash: hashValue(normalizedCode),
    status: "pending",
    expiresAt: { $gt: new Date() },
  });

  if (!pairing) return null;

  const deviceToken = generateDeviceToken();
  const now = new Date();
  const pairedAt = now.toISOString();
  const userObjectId = new ObjectId(userId);

  await db.collection<GarminDevice>("garminDevices").updateOne(
    { deviceIdHash: pairing.deviceIdHash },
    {
      $set: {
        userId: userObjectId,
        tokenHash: hashValue(deviceToken),
        model: pairing.model,
        pairedAt,
        revokedAt: null,
      },
      $unset: { lastSeenAt: "" },
    },
    { upsert: true },
  );

  await db.collection<GarminPairing>("garminPairings").updateOne(
    { _id: pairing._id, status: "pending" },
    {
      $set: {
        status: "paired",
        pairedAt: now,
        deviceToken,
      },
    },
  );

  return {
    pairedAt,
    model: pairing.model,
  };
};

export const authenticateGarminDevice = async (
  deviceToken: string,
): Promise<GarminDevice | null> => {
  const db = await connectToDatabase();
  return db.collection<GarminDevice>("garminDevices").findOne({
    tokenHash: hashValue(deviceToken),
    revokedAt: null,
  });
};

export const touchGarminDevice = async (deviceId: ObjectId): Promise<void> => {
  const db = await connectToDatabase();
  await db.collection<GarminDevice>("garminDevices").updateOne(
    { _id: deviceId },
    { $set: { lastSeenAt: new Date().toISOString() } },
  );
};

export const listGarminDevicesForUser = async (userId: string) => {
  const db = await connectToDatabase();
  const now = Date.now();
  const devices = await db
    .collection<GarminDevice>("garminDevices")
    .find({
      userId: new ObjectId(userId),
      revokedAt: null,
    })
    .sort({ pairedAt: -1 })
    .toArray();

  return devices.map((device) => {
    const lastSeenAt = device.lastSeenAt;
    const lastSeenTime = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;

    return {
      id: device._id?.toString() ?? "",
      model: device.model ?? "Garmin Edge",
      pairedAt: device.pairedAt,
      lastSeenAt,
      online:
        Number.isFinite(lastSeenTime) &&
        now - lastSeenTime <= DEVICE_ONLINE_MAX_AGE_MS,
    };
  });
};

export const unlinkGarminDevice = async ({
  userId,
  deviceId,
}: {
  userId: string;
  deviceId: string;
}): Promise<boolean> => {
  if (!ObjectId.isValid(deviceId)) return false;

  const db = await connectToDatabase();
  const result = await db.collection<GarminDevice>("garminDevices").updateOne(
    {
      _id: new ObjectId(deviceId),
      userId: new ObjectId(userId),
      revokedAt: null,
    },
    { $set: { revokedAt: new Date().toISOString() } },
  );

  return result.modifiedCount === 1;
};

export const getGarminStatusByUserIds = async (userIds: ObjectId[]) => {
  const db = await connectToDatabase();
  const devices = await db
    .collection<GarminDevice>("garminDevices")
    .find({
      userId: { $in: userIds },
      revokedAt: null,
    })
    .toArray();
  const now = Date.now();
  const statusByUserId = new Map<
    string,
    { paired: boolean; online: boolean; lastSeenAt?: string }
  >();

  for (const device of devices) {
    const key = device.userId.toString();
    const previous = statusByUserId.get(key);
    const lastSeenAt =
      !previous?.lastSeenAt ||
      (device.lastSeenAt &&
        new Date(device.lastSeenAt).getTime() >
          new Date(previous.lastSeenAt).getTime())
        ? device.lastSeenAt
        : previous.lastSeenAt;
    const lastSeenTime = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;

    statusByUserId.set(key, {
      paired: true,
      online:
        Number.isFinite(lastSeenTime) &&
        now - lastSeenTime <= DEVICE_ONLINE_MAX_AGE_MS,
      lastSeenAt,
    });
  }

  return statusByUserId;
};
