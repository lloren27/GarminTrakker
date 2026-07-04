import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../config/db";
import { Group } from "../models/group";
import { GroupLayer } from "../models/groupLayer";
import { GroupLayerPreference } from "../models/groupLayerPreference";
import { User } from "../models/user";
import { projectPositionOnRoute } from "../services/routeProgressService";

const PASSWORD = "Garmin123!";
const USER_IDS = {
  owner: new ObjectId("66a100000000000000000001"),
  ana: new ObjectId("66a100000000000000000002"),
  miguel: new ObjectId("66a100000000000000000003"),
  sara: new ObjectId("66a100000000000000000004"),
};
const GROUP_ID = new ObjectId("66a200000000000000000001");
const ROUTE_LAYER_ID = new ObjectId("66a300000000000000000001");

const routeCoordinates = [
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
];

const routeGeoJson = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        name: "Marcha Lagos - demo",
        layerType: "gpx",
        featureType: "track",
        pointCount: routeCoordinates.length,
      },
      geometry: {
        type: "LineString",
        coordinates: routeCoordinates,
      },
    },
  ],
};

const createUser = ({
  _id,
  login,
  email,
  latitude,
  longitude,
  lastUpdate,
}: {
  _id: ObjectId;
  login: string;
  email: string;
  latitude: number;
  longitude: number;
  lastUpdate: string;
}): User => {
  const routeProgress = projectPositionOnRoute({
    latitude,
    longitude,
    geoJson: routeGeoJson,
  });

  if (!routeProgress) {
    throw new Error(`No se pudo proyectar al usuario demo ${login}`);
  }

  return {
  _id,
  login,
  loginLower: login.toLowerCase(),
  email,
  emailLower: email.toLowerCase(),
  password: bcrypt.hashSync(PASSWORD, 10),
  location: {
    latitude,
    longitude,
    last_update: lastUpdate,
  },
  garminTracking: {
    elapsedDistanceMeters: routeProgress.progressMeters,
    progressMeters: routeProgress.progressMeters,
    progressSource: "route",
    remainingMeters: routeProgress.remainingMeters,
    routeLengthMeters: routeProgress.routeLengthMeters,
    progressPercent: routeProgress.progressPercent,
    distanceFromRouteMeters: routeProgress.distanceFromRouteMeters,
    isOffRoute: routeProgress.isOffRoute,
    routeLayerId: ROUTE_LAYER_ID.toString(),
    groupId: GROUP_ID.toString(),
    snappedLatitude: routeProgress.snappedLatitude,
    snappedLongitude: routeProgress.snappedLongitude,
    source: "connect_iq",
    last_update: lastUpdate,
  },
  groups: [GROUP_ID],
  real_time_location: true,
  emailVerified: true,
  isAdmin: false,
  failedLoginAttempts: 0,
  lockUntil: null,
  tokenVersion: 0,
  createdAt: lastUpdate,
  updatedAt: lastUpdate,
  lastLoginAt: lastUpdate,
  };
};

const seedDemoData = async () => {
  const db = await connectToDatabase();
  const now = new Date();
  const nowIso = now.toISOString();

  const users: User[] = [
    createUser({
      _id: USER_IDS.owner,
      login: "lloren",
      email: "lloren@garmintrakker.local",
      latitude: 43.32321,
      longitude: -5.02013,
      lastUpdate: nowIso,
    }),
    createUser({
      _id: USER_IDS.ana,
      login: "ana",
      email: "ana@garmintrakker.local",
      latitude: 43.31816,
      longitude: -5.01277,
      lastUpdate: nowIso,
    }),
    createUser({
      _id: USER_IDS.miguel,
      login: "miguel",
      email: "miguel@garmintrakker.local",
      latitude: 43.32884,
      longitude: -5.02678,
      lastUpdate: nowIso,
    }),
    createUser({
      _id: USER_IDS.sara,
      login: "sara",
      email: "sara@garmintrakker.local",
      latitude: 43.30904,
      longitude: -4.99721,
      lastUpdate: nowIso,
    }),
  ];

  const group: Group & { _id: ObjectId; createdAt: string; updatedAt: string } = {
    _id: GROUP_ID,
    name: "Marcha Lagos de Covadonga 2026",
    owner: USER_IDS.owner,
    users: Object.values(USER_IDS),
    usersPending: [],
    inviteCode: "LAGOS26",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const routeLayer: GroupLayer = {
    _id: ROUTE_LAYER_ID,
    groupId: GROUP_ID,
    type: "gpx",
    source: "system",
    name: "Track demo - Lagos de Covadonga",
    geoJson: routeGeoJson,
    createdBy: USER_IDS.owner,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const preferences: GroupLayerPreference[] = Object.values(USER_IDS).map(
    (userId) => ({
      groupId: GROUP_ID,
      userId,
      visibleLayerIds: [ROUTE_LAYER_ID],
      updatedAt: nowIso,
    }),
  );

  await Promise.all([
    db.collection("groupLayerPreferences").deleteMany({}),
    db.collection("groupLayers").deleteMany({}),
    db.collection("groups").deleteMany({}),
    db.collection("users").deleteMany({}),
    db.collection("refresh_tokens").deleteMany({}),
    db.collection("password_reset_tokens").deleteMany({}),
  ]);

  await db.collection<User>("users").insertMany(users);
  await db.collection("groups").insertOne(group);
  await db.collection<GroupLayer>("groupLayers").insertOne(routeLayer);
  await db.collection<GroupLayerPreference>("groupLayerPreferences").insertMany(preferences);

  console.log("✅ Demo GarminTrakker creada en MongoDB local");
  console.log(`   DB: ${process.env.MONGO_DB_NAME || "garmintrakker"}`);
  console.log(`   Grupo: ${group.name}`);
  console.log(`   Invite code: ${group.inviteCode}`);
  console.log(`   Password usuarios: ${PASSWORD}`);
  console.log(`   USER_ID Garmin demo: ${USER_IDS.owner.toString()}`);
};

seedDemoData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error creando demo GarminTrakker:", error);
    process.exit(1);
  });
