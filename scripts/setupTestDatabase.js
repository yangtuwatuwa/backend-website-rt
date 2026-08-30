import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const testEnvFile = process.env.TEST_ENV_FILE
  ? path.resolve(projectRoot, process.env.TEST_ENV_FILE)
  : path.join(projectRoot, ".env.test");

if (fs.existsSync(testEnvFile)) {
  dotenv.config({ path: testEnvFile, override: false, quiet: true });
}
dotenv.config({ path: path.join(projectRoot, ".env"), override: false, quiet: true });

const requiredTestEnv = ["TEST_DB_HOST", "TEST_DB_USER", "TEST_DB_NAME"];
const missingTestEnv = requiredTestEnv.filter(
  (name) => !process.env[name] || !String(process.env[name]).trim(),
);

if (missingTestEnv.length > 0) {
  throw new Error(
    `Konfigurasi DB test belum lengkap. Set env var: ${missingTestEnv.join(", ")}`,
  );
}

const testDatabaseName = String(process.env.TEST_DB_NAME).trim();
const developmentDatabaseName = String(process.env.DATABASE || "").trim();

if (!/^[A-Za-z0-9_]+$/.test(testDatabaseName)) {
  throw new Error(
    "TEST_DB_NAME hanya boleh berisi huruf, angka, dan underscore.",
  );
}

if (!/test/i.test(testDatabaseName)) {
  throw new Error(
    "Safety check: nama TEST_DB_NAME harus mengandung kata 'test'.",
  );
}

if (
  developmentDatabaseName &&
  testDatabaseName.toLowerCase() === developmentDatabaseName.toLowerCase()
) {
  throw new Error(
    "Safety check: TEST_DB_NAME harus berbeda dari DATABASE dev/production.",
  );
}

function getConfirmationArgument() {
  const inlineArgument = process.argv.find((arg) => arg.startsWith("--confirm="));
  if (inlineArgument) return inlineArgument.slice("--confirm=".length);

  const confirmIndex = process.argv.indexOf("--confirm");
  return confirmIndex >= 0 ? process.argv[confirmIndex + 1] : undefined;
}

const confirmation = getConfirmationArgument();
if (confirmation !== testDatabaseName) {
  throw new Error(
    `Reset dibatalkan. Jalankan ulang dengan --confirm ${testDatabaseName}`,
  );
}

const port = process.env.TEST_DB_PORT
  ? Number(process.env.TEST_DB_PORT)
  : 3306;

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error("TEST_DB_PORT harus berupa port TCP yang valid.");
}

const connectionOptions = {
  host: process.env.TEST_DB_HOST,
  user: process.env.TEST_DB_USER,
  port,
  password: process.env.TEST_DB_PASSWORD ?? "",
};

const schemaPath = path.join(
  projectRoot,
  "migrations",
  "20260824_init_complete_schema.sql",
);
const schemaSql = fs.readFileSync(schemaPath, "utf8");

const expectedTables = [
  "access_logs",
  "acount",
  "agenda",
  "announcement",
  "bill_periods",
  "bills",
  "document",
  "family",
  "financial_ledger",
  "financial_settings",
  "house",
  "karyawan",
  "kas_contributions",
  "letter",
  "notifications",
  "otp_codes",
  "payment_bill_links",
  "payments",
  "report",
  "surat_keluar",
  "surat_masuk",
  "template_surat",
  "vote_karyawan",
  "warga",
];

let serverConnection;
let databaseConnection;

try {
  serverConnection = await mysql.createConnection(connectionOptions);
  const [schemaRows] = await serverConnection.execute(
    "SELECT schema_name FROM information_schema.schemata WHERE schema_name = ?",
    [testDatabaseName],
  );
  if (schemaRows.length === 0) {
    await serverConnection.query(
      `CREATE DATABASE \`${testDatabaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  }
  await serverConnection.end();
  serverConnection = undefined;

  databaseConnection = await mysql.createConnection({
    ...connectionOptions,
    database: testDatabaseName,
    multipleStatements: true,
  });

  // Canonical schema ini memang melakukan DROP + CREATE. Konfirmasi nama DB
  // di atas wajib cocok agar reset tidak dapat diarahkan ke DB lain tanpa sengaja.
  await databaseConnection.query(schemaSql);

  const [tableRows] = await databaseConnection.execute(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [testDatabaseName],
  );
  const actualTables = tableRows.map((row) => row.TABLE_NAME || row.table_name);
  const missingTables = expectedTables.filter((table) => !actualTables.includes(table));

  if (missingTables.length > 0) {
    throw new Error(`Schema test belum lengkap. Tabel hilang: ${missingTables.join(", ")}`);
  }

  const requiredColumns = [
    ["acount", "email_encrypted"],
    ["acount", "email_blind_idx"],
    ["acount", "is_verified"],
    ["letter", "is_archived"],
    ["financial_ledger", "receipt_file"],
  ];

  for (const [tableName, columnName] of requiredColumns) {
    const [columnRows] = await databaseConnection.execute(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
      [testDatabaseName, tableName, columnName],
    );
    if (columnRows.length !== 1) {
      throw new Error(`Kolom wajib tidak ditemukan: ${tableName}.${columnName}`);
    }
  }

  console.log(`Database test '${testDatabaseName}' siap.`);
  console.log(`Canonical schema diterapkan dari: ${schemaPath}`);
  console.log(`Verifikasi berhasil: ${expectedTables.length} tabel wajib tersedia.`);
} finally {
  if (databaseConnection) await databaseConnection.end();
  if (serverConnection) await serverConnection.end();
}
