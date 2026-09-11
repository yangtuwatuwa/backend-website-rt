import dotenv from "dotenv";
import mysql from "mysql2/promise";

dotenv.config({ override: true, quiet: true });

const databaseName = String(process.env.DATABASE ?? "").trim();
const protectedDatabases = new Set([
  "information_schema",
  "mysql",
  "performance_schema",
  "sys",
]);

if (!databaseName) {
  throw new Error("Environment variable DATABASE belum diisi.");
}

if (!/^[A-Za-z0-9_$-]+$/.test(databaseName)) {
  throw new Error("Nama database mengandung karakter yang tidak didukung.");
}

if (protectedDatabases.has(databaseName.toLowerCase())) {
  throw new Error(`Database sistem '${databaseName}' tidak boleh di-truncate.`);
}

const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USERS,
  port: process.env.PORT ? Number(process.env.PORT) : 3306,
  password: process.env.PASS ?? process.env.PASSWORD ?? "",
  database: databaseName,
  waitForConnections: true,
  connectionLimit: 1,
});

let connection;

try {
  connection = await pool.getConnection();

  const [tableRows] = await connection.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
    [databaseName],
  );

  const tableNames = tableRows.map(
    (row) => row.TABLE_NAME ?? row.table_name,
  );

  if (tableNames.length === 0) {
    console.log(`Tidak ada tabel yang perlu dibersihkan di '${databaseName}'.`);
  } else {
    console.log(
      `Membersihkan ${tableNames.length} tabel di database '${databaseName}'...`,
    );

    await connection.query("SET FOREIGN_KEY_CHECKS = 0");

    try {
      for (const tableName of tableNames) {
        const escapedTableName = tableName.replaceAll("`", "``");
        await connection.query(`TRUNCATE TABLE \`${escapedTableName}\``);
        console.log(`- ${tableName}`);
      }
    } finally {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    }

    console.log("Semua tabel berhasil di-truncate.");
  }
} catch (error) {
  console.error("Gagal truncate tabel:", error.message);
  process.exitCode = 1;
} finally {
  connection?.release();
  await pool.end();
}
