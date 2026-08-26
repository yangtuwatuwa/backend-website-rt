import pool from "../config/sqlconfig.js";

export async function up() {
    console.log("===================================================================");
    console.log("🚀 MIGRATION: ADD is_verified COLUMN TO acount TABLE");
    console.log("===================================================================\n");

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Cek apakah kolom is_verified sudah ada
        const [columns] = await connection.execute(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'acount' AND COLUMN_NAME = 'is_verified'`
        );

        if (columns.length === 0) {
            console.log("➕ Menambahkan kolom is_verified ke tabel acount...");
            await connection.execute(`
                ALTER TABLE \`acount\` 
                ADD COLUMN \`is_verified\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`must_change_password\`
            `);
            console.log("   ✅ Kolom is_verified berhasil ditambahkan.");
        } else {
            console.log("ℹ️ Kolom is_verified sudah ada di tabel acount.");
        }

        // 2. Set default is_verified = 1 untuk akun pengurus (RT, Sekertaris, Bendahara, Admin) yang sudah ada
        console.log("🔄 Memperbarui status is_verified = 1 untuk akun RT/Staff/Admin yang sudah ada...");
        await connection.execute(`
            UPDATE \`acount\` 
            SET \`is_verified\` = 1 
            WHERE \`role\` IN ('rt', 'sekertaris', 'bendahara', 'admin')
        `);
        console.log("   ✅ Akun pengurus berhasil diset is_verified = 1.");

        await connection.commit();
        console.log("\n🎉 Migrasi is_verified berhasil selesai 100%!\n");
        return true;
    } catch (err) {
        await connection.rollback();
        console.error("❌ Gagal menjalankan migrasi:", err);
        throw err;
    } finally {
        connection.release();
    }
}

if (process.argv[1] && process.argv[1].includes("20260826_add_is_verified_to_acount")) {
    up().then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
