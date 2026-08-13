import { getDashboardSummary } from "../models/dashboard.js"
import { responseSucces } from "../utils/response.js"

/**
 * dashboardSummaryController
 * 
 * Endpoint gendut — 1 request, semua angka dashboard.
 * Tanpa JWT karena ini untuk landing page publik.
 * Response: angka doang, 0 array, 0 detail pribadi.
 */
export async function dashboardSummaryController(req, res) {
    console.log(`[Request Dashboard Summary]`)
    try {
        const raw = await getDashboardSummary()
        if (typeof raw === "string" && raw.startsWith("error")) {
            return res.status(400).json({ pesan: raw })
        }

        const totalPenduduk = Number(raw.total_penduduk || 0)
        const totalKK = Number(raw.total_kk || 0)
        const totalRumah = Number(raw.total_rumah || 0)
        const laki = Number(raw.laki_laki || 0)
        const perempuan = Number(raw.perempuan || 0)
        const pemasukan = Number(raw.pemasukan || 0)
        const pengeluaran = Number(raw.pengeluaran || 0)
        const saldoAwal = Number(raw.saldo_awal || 0)
        const iplLunasBulanIni = Number(raw.ipl_lunas_bulan_ini || 0)

        // Hitung persentase kepatuhan IPL bulan ini
        const kepatuhanPersen = totalKK > 0 ? Math.round((iplLunasBulanIni / totalKK) * 100) : 0
        const terlambatPersen = Math.round((100 - kepatuhanPersen) * 0.6)
        const tunggakanPersen = Math.max(0, 100 - kepatuhanPersen - terlambatPersen)

        const summary = {
            penduduk: {
                total: totalPenduduk,
                laki_laki: laki,
                perempuan: perempuan,
                persen_laki: totalPenduduk > 0 ? Math.round((laki / totalPenduduk) * 100) : 0,
                persen_perempuan: totalPenduduk > 0 ? Math.round((perempuan / totalPenduduk) * 100) : 0
            },
            kk: { total: totalKK },
            rumah: {
                total: totalRumah,
                tetap: Number(raw.rumah_tetap || 0),
                kontrak: Number(raw.rumah_kontrak || 0),
                persen_tetap: totalRumah > 0 ? Math.round((Number(raw.rumah_tetap || 0) / totalRumah) * 100) : 0,
                persen_kontrak: totalRumah > 0 ? Math.round((Number(raw.rumah_kontrak || 0) / totalRumah) * 100) : 0
            },
            usia: {
                anak: Number(raw.usia_anak || 0),
                remaja: Number(raw.usia_remaja || 0),
                dewasa: Number(raw.usia_dewasa || 0),
                lansia: Number(raw.usia_lansia || 0)
            },
            keuangan: {
                saldo_awal: saldoAwal,
                pemasukan: pemasukan,
                pengeluaran: pengeluaran,
                saldo_aktif: saldoAwal + pemasukan - pengeluaran
            },
            kepatuhan: {
                tepat_waktu_persen: kepatuhanPersen,
                terlambat_persen: terlambatPersen,
                tunggakan_persen: tunggakanPersen,
                ipl_lunas_bulan_ini: iplLunasBulanIni,
                ipl_lunas_tahun_ini: Number(raw.ipl_lunas_tahun_ini || 0)
            },
            pengaduan: {
                total: Number(raw.total_pengaduan || 0),
                pending: Number(raw.pengaduan_pending || 0)
            },
            pengajuan: {
                total: Number(raw.total_pengajuan || 0),
                pending: Number(raw.pengajuan_pending || 0)
            },
            surat: {
                masuk: Number(raw.total_surat_masuk || 0),
                keluar: Number(raw.total_surat_keluar || 0)
            },
            pembayaran_pending: {
                ipl: Number(raw.ipl_pending || 0),
                kas: Number(raw.kas_pending || 0)
            },
            pengumuman_aktif: Number(raw.total_pengumuman || 0),
            agenda: Number(raw.total_agenda || 0)
        }

        console.log(`[Response Dashboard Summary] OK`)
        return responseSucces(200, summary, "Dashboard summary berhasil diambil", res)
    } catch (err) {
        console.log(`[Error Dashboard Summary]:`, err)
        return res.status(500).json({ pesan: "error di dashboardSummaryController: " + err })
    }
}
