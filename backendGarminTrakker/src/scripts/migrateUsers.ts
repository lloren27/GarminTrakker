import { Db, MongoClient } from "mongodb";
import dotenv from "dotenv";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

dotenv.config({ path: envFile });

const mongoUri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || "garmintrakker";

if (!mongoUri) {
  throw new Error("MONGO_URI no está definida");
}

const normalizeEmail = (email: unknown): string | null => {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
};

const normalizeLogin = (login: unknown): string | null => {
  if (typeof login !== "string") return null;
  const trimmed = login.trim().toLowerCase();
  return trimmed || null;
};

const migrateUsers = async (db: Db) => {
  const usersCollection = db.collection("users");

  const users = await usersCollection.find({}).toArray();

  console.log(`🔎 Usuarios encontrados: ${users.length}`);

  let updatedCount = 0;

  for (const user of users) {
    const now = new Date().toISOString();

    const updateFields: Record<string, unknown> = {};

    if (!("emailLower" in user) || user.emailLower == null) {
      updateFields.emailLower = normalizeEmail(user.email);
    }

    if (!("loginLower" in user) || user.loginLower == null) {
      updateFields.loginLower = normalizeLogin(user.login);
    }

    if (!("emailVerified" in user)) {
      updateFields.emailVerified = false;
    }

    if (!("failedLoginAttempts" in user)) {
      updateFields.failedLoginAttempts = 0;
    }

    if (!("lockUntil" in user)) {
      updateFields.lockUntil = null;
    }

    if (!("tokenVersion" in user)) {
      updateFields.tokenVersion = 0;
    }

    if (!("createdAt" in user)) {
      updateFields.createdAt = now;
    }

    if (!("updatedAt" in user)) {
      updateFields.updatedAt = now;
    }

    if (!("lastLoginAt" in user)) {
      updateFields.lastLoginAt = null;
    }

    if (!("avatar" in user)) {
      updateFields.avatar = undefined;
    }

    if (Object.keys(updateFields).length === 0) {
      continue;
    }

    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: updateFields,
      },
    );

    updatedCount += 1;
    console.log(`✅ Usuario migrado: ${user.login ?? user.email ?? user._id}`);
  }

  console.log(
    `🎉 Migración completada. Usuarios actualizados: ${updatedCount}`,
  );
};

const createIndexes = async (db: Db) => {
  console.log("🔧 Creando índices...");

  await db.collection("users").createIndex(
    { emailLower: 1 },
    {
      unique: true,
      partialFilterExpression: { emailLower: { $type: "string" } },
    },
  );

  await db.collection("users").createIndex(
    { loginLower: 1 },
    {
      unique: true,
      partialFilterExpression: { loginLower: { $type: "string" } },
    },
  );

  console.log("✅ Índices creados correctamente");
};

const run = async () => {
  let client: MongoClient | null = null;

  try {
    client = new MongoClient(mongoUri);
    await client.connect();

    const db = client.db(dbName);

    console.log("✅ Conectado a MongoDB");
    await migrateUsers(db);
    await createIndexes(db);

    console.log("🚀 Script finalizado correctamente");
  } catch (error) {
    console.error("❌ Error ejecutando la migración:", error);
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.close();
      console.log("🔌 Conexión cerrada");
    }
  }
};

void run();
