import pool from "../config/sqlconfig.js";

async function resetDatabase() {
    console.log("⚠️  MEMULAI PROSES WIPE / RESET DATABASE SERVER...");

    const tables = [
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
        "ipl_payment",
        "karyawan",
        "kas_payment",
        "letter",
        "otp_codes",
        "payment",
        "payments",
        "report",
        "surat_keluar",
        "surat_masuk",
        "template_surat",
        "vote_karyawan",
        "warga"
    ];

    try {
        // Matikan Foreign Key checks agar pembersihan tidak terhalang relasi
        await pool.query("SET FOREIGN_KEY_CHECKS = 0;");

        for (const table of tables) {
            try {
                await pool.query(`TRUNCATE TABLE \`${table}\`;`);
                console.log(`✅ Table '${table}' berhasil dibersihkan (TRUNCATE).`);
            } catch (err) {
                console.log(`⚠️ Warning: Gagal truncate '${table}' (${err.message}). Mengabaikan...`);
            }
        }

        // Hidupkan kembali Foreign Key checks
        await pool.query("SET FOREIGN_KEY_CHECKS = 1;");

        // Seed data default dasar (financial_settings default row)
        try {
            await pool.query(`
                INSERT INTO financial_settings (id, ipl_nominal, previous_balance) 
                VALUES (1, 200000, 0)
                ON DUPLICATE KEY UPDATE ipl_nominal = 200000;
            `);
            console.log("🌱 Default data 'financial_settings' (ID 1) berhasil ditanamkan kembali.");
        } catch (seedErr) {
            console.log("⚠️ Warning: Gagal menanamkan default financial_settings:", seedErr.message);
        }

        console.log("\n🎉 BOOM! Database berhasil dibersihkan total dan siap digunakan kembali.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error saat mereset database:", err);
        process.exit(1);
    }
}

resetDatabase();
