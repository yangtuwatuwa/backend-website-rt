import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach } from "@jest/globals";

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, "..");
const testEnvFile = process.env.TEST_ENV_FILE
  ? path.resolve(projectRoot, process.env.TEST_ENV_FILE)
  : path.join(projectRoot, ".env.test");

if (fs.existsSync(testEnvFile)) {
  dotenv.config({ path: testEnvFile, override: false, quiet: true });
}
dotenv.config({ path: path.join(projectRoot, ".env"), override: false, quiet: true });

const requiredTestEnv = ["TEST_DB_HOST", "TEST_DB_USER", "TEST_DB_NAME"];
const missingTestEnv = requiredTestEnv.filter((name) => !process.env[name]);

if (missingTestEnv.length > 0) {
  throw new Error(
    `Konfigurasi DB test belum lengkap. Set env var: ${missingTestEnv.join(", ")}`,
  );
}

if (
  process.env.DATABASE &&
  process.env.TEST_DB_NAME.trim().toLowerCase() ===
    process.env.DATABASE.trim().toLowerCase()
) {
  throw new Error("TEST_DB_NAME harus berbeda dari DATABASE dev/production.");
}

const testPool = mysql.createPool({
  host: process.env.TEST_DB_HOST,
  user: process.env.TEST_DB_USER,
  port: process.env.TEST_DB_PORT ? Number(process.env.TEST_DB_PORT) : 3306,
  password: process.env.TEST_DB_PASSWORD ?? "",
  database: process.env.TEST_DB_NAME,
  waitForConnections: true,
  connectionLimit: 1,
  maxIdle: 1,
});

let connection;

beforeAll(async () => {
  const probe = await testPool.getConnection();
  probe.release();
});

beforeEach(async () => {
  connection = await testPool.getConnection();
  await connection.beginTransaction();

  // Test dan seed helper harus memakai executor ini agar ikut di-rollback.
  globalThis.testDb = connection;
});

afterEach(async () => {
  if (!connection) return;

  try {
    await connection.rollback();
  } finally {
    connection.release();
    connection = undefined;
    globalThis.testDb = undefined;
  }
});

afterAll(async () => {
  await testPool.end();
});
