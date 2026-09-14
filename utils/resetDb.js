import pool from "../config/sqlconfig.js";
import { argonhash } from "../helpers/argon2.js";
import { computeBlindIndex, encryptEmail, normalizeEmail } from "../lib/crypto/email.js";
import { up as initializeSchema } from "../migrations/20260824_init_complete_schema.js";
import { up as createKasTransaksi } from "../migrations/20260902_create_kas_transaksi.js";
import { up as createKasPeriodeTutupBuku } from "../migrations/20260903_create_kas_periode_tutup_buku.js";
import { up as seedSuratKategori } from "../migrations/20260904_seed_surat_kategori_keperluan.js";

const DEFAULT_ACCOUNT = Object.freeze({
    username: "bapak rt",
    password: "rt123456",
    email: "rt@local.test",
});

const REQUIRED_BASE_TABLES = [
    "acount", "access_logs", "agenda", "announcement", "archive_media",
    "bill_periods", "bills", "document", "family", "financial_ledger",
    "financial_settings", "house", "karyawan", "kas_contributions", "letter",
    "notulen_rapat", "notifications", "otp_codes", "payment_bill_links",
    "payments", "report", "surat_kategori", "surat_keluar", "surat_masuk",
    "template_surat", "vote_karyawan", "warga",
];

const REQUIRED_ACCOUNT_COLUMNS = [
    "username", "password", "email_encrypted", "email_blind_idx",
    "role", "family_id", "must_change_password", "is_verified",
];

const MIGRATION_METADATA_TABLES = new Set(["SequelizeMeta", "_prisma_migrations"]);

function readOption(name, fallback) {
    const prefix = `--${name}=`;
    const inlineValue = process.argv.find((argument) => argument.startsWith(prefix));
    if (inlineValue) return inlineValue.slice(prefix.length).trim();
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1].trim() : fallback;
}

function getRtAccount() {
    return {
        username: readOption("username", process.env.RT_USERNAME || DEFAULT_ACCOUNT.username),
        password: readOption("password", process.env.RT_PASSWORD || DEFAULT_ACCOUNT.password),
        email: normalizeEmail(readOption("email", process.env.RT_EMAIL || DEFAULT_ACCOUNT.email)),
    };
}

function validateConfiguration(account) {
    const database = String(process.env.DATABASE || "").trim();
    const forbidden = new Set(["information_schema", "mysql", "performance_schema", "sys"]);
    if (!database || forbidden.has(database.toLowerCase())) {
        throw new Error("DATABASE wajib menunjuk ke database aplikasi, bukan database sistem MySQL.");
    }
    if (!account.username || !account.password || !account.email.includes("@")) {
        throw new Error("Username, password, dan email akun RT wajib valid dan tidak boleh kosong.");
    }
}

async function getSchemaState() {
    const [tableRows] = await pool.execute(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
    );
    const tables = new Set(tableRows.map((row) => row.TABLE_NAME || row.table_name));
    let accountColumns = new Set();
    if (tables.has("acount")) {
        const [rows] = await pool.execute(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = 'acount'`,
        );
        accountColumns = new Set(rows.map((row) => row.COLUMN_NAME || row.column_name));
    }
    return { tables, accountColumns };
}

async function runRequiredMigrations({ forceBase = false } = {}) {
    const schema = await getSchemaState();
    const missingTables = REQUIRED_BASE_TABLES.filter((table) => !schema.tables.has(table));
    const missingColumns = REQUIRED_ACCOUNT_COLUMNS.filter((column) => !schema.accountColumns.has(column));
    if (forceBase || missingTables.length || missingColumns.length) {
        const reason = [
            missingTables.length ? `tabel: ${missingTables.join(", ")}` : null,
            missingColumns.length ? `kolom acount: ${missingColumns.join(", ")}` : null,
        ].filter(Boolean).join("; ");
        console.log(`\nSkema belum siap${reason ? ` (${reason})` : ""}. Menjalankan migrasi dasar...`);
        await initializeSchema();
    }
    const refreshed = await getSchemaState();
    if (!refreshed.tables.has("kas_transaksi")) {
        console.log("Menjalankan migrasi kas_transaksi...");
        await createKasTransaksi(pool);
    }
    if (!refreshed.tables.has("kas_periode_tutup_buku") || !refreshed.tables.has("kas_buku_lock")) {
        console.log("Menjalankan migrasi kas_periode_tutup_buku...");
        await createKasPeriodeTutupBuku(pool);
    }
}

async function truncateApplicationTables() {
    const connection = await pool.getConnection();
    let foreignKeyChecksDisabled = false;
    try {
        const [rows] = await connection.execute(
            `SELECT table_name FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
             ORDER BY table_name`,
        );
        const tables = rows
            .map((row) => row.TABLE_NAME || row.table_name)
            .filter((table) => !MIGRATION_METADATA_TABLES.has(table));

        // FOREIGN_KEY_CHECKS bersifat per-koneksi, jadi reset harus memakai koneksi ini.
        await connection.query("SET FOREIGN_KEY_CHECKS = 0");
        foreignKeyChecksDisabled = true;
        for (const table of tables) {
            const escapedTable = table.replaceAll("`", "``");
            await connection.query(`TRUNCATE TABLE \`${escapedTable}\``);
            console.log(`   OK ${table}`);
        }
        return tables.length;
    } finally {
        if (foreignKeyChecksDisabled) {
            await connection.query("SET FOREIGN_KEY_CHECKS = 1");
        }
        connection.release();
    }
}

async function seedDefaults(account) {
    await pool.execute(
        `INSERT INTO financial_settings (id, ipl_nominal, previous_balance)
         VALUES (1, 200000, 0)
         ON DUPLICATE KEY UPDATE ipl_nominal = VALUES(ipl_nominal)`,
    );
    await seedSuratKategori(pool);
    // Sekaligus mengembalikan singleton kas_buku_lock setelah truncate.
    await createKasPeriodeTutupBuku(pool);

    const passwordHash = await argonhash(account.password);
    if (!passwordHash) throw new Error("Hash password akun RT gagal dibuat.");

    const [result] = await pool.execute(
        `INSERT INTO acount
            (username, password, email_encrypted, email_blind_idx, role,
             family_id, must_change_password, is_verified)
         VALUES (?, ?, ?, ?, 'rt', NULL, 0, 1)`,
        [
            account.username,
            passwordHash,
            encryptEmail(account.email),
            computeBlindIndex(account.email),
        ],
    );
    return result.insertId;
}

function isSchemaError(error) {
    return new Set([
        "ER_BAD_FIELD_ERROR",
        "ER_BAD_TABLE_ERROR",
        "ER_NO_SUCH_TABLE",
        "ER_PARSE_ERROR",
    ]).has(error?.code);
}

async function performReset(account) {
    await runRequiredMigrations();
    console.log("\nMengosongkan seluruh tabel aplikasi...");
    const tableCount = await truncateApplicationTables();
    console.log("\nMengembalikan data dasar dan membuat akun RT...");
    const accountId = await seedDefaults(account);
    return { tableCount, accountId };
}

async function main() {
    const account = getRtAccount();
    validateConfiguration(account);
    console.log(`RESET DATABASE: ${process.env.DATABASE}`);

    let result;
    try {
        result = await performReset(account);
    } catch (error) {
        if (!isSchemaError(error)) throw error;
        console.warn(
            `\nReset gagal karena skema database (${error.code}). ` +
            "Migrasi dijalankan lalu reset dicoba sekali lagi.",
        );
        await runRequiredMigrations({ forceBase: true });
        result = await performReset(account);
    }

    console.log("\nDatabase berhasil di-reset.");
    console.log(`   Tabel dibersihkan : ${result.tableCount}`);
    console.log(`   ID akun RT        : ${result.accountId}`);
    console.log(`   Username          : ${account.username}`);
    console.log(`   Password          : ${account.password}`);
    console.log(`   Email             : ${account.email}`);
    console.log("   Role              : rt");
    console.log("   Status            : terverifikasi, siap login");
}

main()
    .catch((error) => {
        console.error("\nReset database gagal:", error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
