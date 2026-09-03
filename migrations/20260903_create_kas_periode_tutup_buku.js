import fs from "node:fs/promises";
import pool from "../config/sqlconfig.js";

export async function up(executor = pool) {
    const sql = await fs.readFile(new URL("./20260903_create_kas_periode_tutup_buku.sql", import.meta.url), "utf8");
    for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean)) {
        await executor.query(statement);
    }
}

if (process.argv[1]?.includes("20260903_create_kas_periode_tutup_buku")) {
    up().then(async () => {
        console.log("Migration kas_periode_tutup_buku berhasil dijalankan.");
        await pool.end();
    }).catch(async (error) => {
        console.error("Migration kas_periode_tutup_buku gagal:", error);
        await pool.end();
        process.exitCode = 1;
    });
}
