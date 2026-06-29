import { Db, MongoClient } from "mongodb";
import dotenv from "dotenv";

const envFile =
  process.env.NODE_ENV === "production"
    ? ".env.production"
    : ".env.development";

dotenv.config({ path: envFile });

let client: MongoClient | null = null;
let db: Db | null = null;

const createIndexes = async (db: Db) => {
  console.log("🔧 Creando índices en MongoDB...");

  // 👤 USERS
  await db.collection("users").createIndex(
    { emailLower: 1 },
    {
      unique: true,
      partialFilterExpression: { emailLower: { $type: "string" } },
    }
  );

  await db.collection("users").createIndex(
    { loginLower: 1 },
    {
      unique: true,
      partialFilterExpression: { loginLower: { $type: "string" } },
    }
  );

  // 🔑 REFRESH TOKENS
  await db.collection("refresh_tokens").createIndex(
    { token: 1 },
    { unique: true }
  );

  await db.collection("refresh_tokens").createIndex({ userId: 1 });
  await db.collection("refresh_tokens").createIndex({ expiresAt: 1 });

  // 🔁 PASSWORD RESET TOKENS
  await db.collection("password_reset_tokens").createIndex(
    { token: 1 },
    { unique: true }
  );

  await db.collection("password_reset_tokens").createIndex({ expiresAt: 1 });

  console.log("✅ Índices creados");
};

export const connectToDatabase = async (): Promise<Db> => {
  if (db) return db;

  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URL;
  const dbName = process.env.MONGO_DB_NAME || "garmintrakker";

  if (!mongoUri) {
    throw new Error(
      "MongoDB no está configurado. Define MONGO_URI, MONGODB_URI o MONGO_URL.",
    );
  }

  client = new MongoClient(mongoUri);
  await client.connect();

  db = client.db(dbName);

  console.log("✅ Conectado a MongoDB");

  await createIndexes(db);

  return db;
};
