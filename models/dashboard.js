import db from "../config/sqlconfig.js"

/**
 * getDashboardSummary
 * 
 * 1 query, 1 round-trip, angka doang.
 * Menggabungkan semua statistik dashboard landing page ke dalam
 * satu SELECT dengan scalar subqueries agar efisien dan hemat rate limit.
 */
export async function getDashboardSummary() {
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() + 1

    try {
        const [rows] = await db.execute(`
            SELECT
                -- Kependudukan
                (SELECT COUNT(id) FROM warga WHERE status_data = 'diterima' OR status_data IS NULL) AS total_penduduk,
                (SELECT COUNT(id) FROM warga WHERE (status_data = 'diterima' OR status_data IS NULL) AND (LOWER(jenis_kelamin) LIKE '%laki%' OR jenis_kelamin = 'L')) AS laki_laki,
                (SELECT COUNT(id) FROM warga WHERE (status_data = 'diterima' OR status_data IS NULL) AND (LOWER(jenis_kelamin) LIKE '%perempuan%' OR LOWER(jenis_kelamin) LIKE '%wanita%' OR jenis_kelamin = 'P')) AS perempuan,
                (SELECT COUNT(id) FROM family) AS total_kk,

                -- Rumah
                (SELECT COUNT(id) FROM house) AS total_rumah,
                (SELECT COUNT(id) FROM house WHERE LOWER(status) LIKE '%pribadi%' OR LOWER(status) LIKE '%tetap%' OR LOWER(status) LIKE '%milik%') AS rumah_tetap,
                (SELECT COUNT(id) FROM house WHERE LOWER(status) LIKE '%kontrak%' OR LOWER(status) LIKE '%sewa%') AS rumah_kontrak,

                -- Distribusi Usia
                (SELECT COALESCE(SUM(CASE WHEN umur BETWEEN 0 AND 12 THEN 1 ELSE 0 END), 0) FROM warga WHERE status_data = 'diterima' OR status_data IS NULL) AS usia_anak,
                (SELECT COALESCE(SUM(CASE WHEN umur BETWEEN 13 AND 20 THEN 1 ELSE 0 END), 0) FROM warga WHERE status_data = 'diterima' OR status_data IS NULL) AS usia_remaja,
                (SELECT COALESCE(SUM(CASE WHEN umur BETWEEN 21 AND 50 THEN 1 ELSE 0 END), 0) FROM warga WHERE status_data = 'diterima' OR status_data IS NULL) AS usia_dewasa,
                (SELECT COALESCE(SUM(CASE WHEN umur > 50 THEN 1 ELSE 0 END), 0) FROM warga WHERE status_data = 'diterima' OR status_data IS NULL) AS usia_lansia,

                -- Pengaduan & Pengajuan
                (SELECT COUNT(id) FROM report) AS total_pengaduan,
                (SELECT COUNT(id) FROM report WHERE status = 'pending') AS pengaduan_pending,
                (SELECT COUNT(id) FROM letter) AS total_pengajuan,
                (SELECT COUNT(id) FROM letter WHERE status = 'pending') AS pengajuan_pending,

                -- Pengumuman & Agenda
                (SELECT COUNT(id) FROM announcement) AS total_pengumuman,
                (SELECT COUNT(id) FROM agenda) AS total_agenda,

                -- Pembayaran Pending
                (SELECT COUNT(id) FROM payments WHERE status = 'pending') AS ipl_pending,
                (SELECT COUNT(id) FROM kas_contributions WHERE status = 'pending') AS kas_pending,

                -- Keuangan
                (SELECT COALESCE(previous_balance, 0) FROM financial_settings WHERE id = 1) AS saldo_awal,
                (SELECT COALESCE(SUM(CASE WHEN type = 'in' THEN amount ELSE 0 END), 0) FROM financial_ledger) AS pemasukan,
                (SELECT COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) FROM financial_ledger) AS pengeluaran,

                -- Surat
                (SELECT COUNT(id) FROM surat_masuk) AS total_surat_masuk,
                (SELECT COUNT(id) FROM surat_keluar) AS total_surat_keluar,

                -- Kepatuhan IPL
                (SELECT COUNT(DISTINCT w.family_id) FROM bills b JOIN bill_periods bp ON b.bill_period_id = bp.id JOIN warga w ON b.resident_id = w.id WHERE bp.period_year = ? AND b.status = 'paid') AS ipl_lunas_tahun_ini,
                (SELECT COUNT(DISTINCT w.family_id) FROM bills b JOIN bill_periods bp ON b.bill_period_id = bp.id JOIN warga w ON b.resident_id = w.id WHERE bp.period_year = ? AND bp.period_month = ? AND b.status = 'paid') AS ipl_lunas_bulan_ini
        `, [currentYear, currentYear, currentMonth])

        return rows[0]
    } catch (err) {
        console.log("error getDashboardSummary model:", err)
        return "error karena: " + err
    }
}
