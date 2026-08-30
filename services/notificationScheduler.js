import cron from "node-cron"
import { getArrearsTracking } from "../models/financial.js"
import pool from "../config/sqlconfig.js"
import { decryptEmails } from "../helpers/ciihper.js"
import { calculateAge } from "../helpers/ageCalculator.js"

export async function runIplReminderJob(now = new Date(), executor = pool) {
    const client = executor || pool
    const day = now.getDate()

    // Batas pembayaran IPL idealnya tanggal 5 setiap bulan
    if (day > 5) {
        const currentMonth = now.getMonth() + 1 // 1-12
        const currentYear = now.getFullYear()

        console.log(`[Scheduler] Pengecekan otomatis tunggakan IPL tanggal ${day} untuk bulan ${currentMonth}/${currentYear}...`)
        
        const listWarga = await getArrearsTracking(currentMonth, currentYear, client)
        if (Array.isArray(listWarga)) {
            const nunggak = listWarga.filter(w => !w.payment_status || w.payment_status === 'ditolak')
            
            for (const warga of nunggak) {
                console.log(`[Reminder Send] Mengirim tagihan reminder IPL ke Keluarga ${warga.kepala_keluarga_nama || 'Tanpa Nama'} (KK: ${warga.no_kk}) - Tagihan bulan ${currentMonth}/${currentYear} belum terbayar!`)
            }
        }
    }
}

export async function runDailyAgeSyncJob(executor = pool) {
    const client = executor || pool
    console.log("[Scheduler] Menjalankan sinkronisasi umur harian otomatis (00:01)...")
    try {
        const [rows] = await client.execute("SELECT id, tgl_lahir, umur, nama FROM warga")
        if (!Array.isArray(rows) || rows.length === 0) return

        let updatedCount = 0
        for (const w of rows) {
            if (!w.tgl_lahir) continue
            try {
                const decTglLahir = decryptEmails(w.tgl_lahir)
                const realAge = calculateAge(decTglLahir, w.umur)
                
                if (realAge !== null && Number(realAge) !== Number(w.umur)) {
                    await client.execute("UPDATE warga SET umur = ? WHERE id = ?", [realAge, w.id])
                    updatedCount++
                    console.log(`[Scheduler] Umur warga ${w.nama} (ID ${w.id}) berhasil diperbarui: ${w.umur} -> ${realAge} tahun`)
                }
            } catch (e) {
                // Ignore single row decryption errors
            }
        }
        console.log(`[Scheduler] Sinkronisasi umur selesai. ${updatedCount} warga berulang tahun hari ini & umur ter-update.`)
    } catch (err) {
        console.log("[Scheduler Error] Gagal update umur harian:", err)
    }
}

export function startNotificationScheduler() {
    // Cron callbacks intentionally do not capture an injected executor. Each
    // future run resolves the default production pool when the runner is called.
    // 1. Run every day at 08:00 AM — Reminder IPL
    cron.schedule('0 8 * * *', async () => {
        await runIplReminderJob()
    })
    console.log("[Scheduler] Cron scheduler reminder IPL berhasil diinisialisasi (Aktif tiap jam 08.00 pagi)")

    // 2. Run every day at 00:01 AM — Auto Update Umur Warga di DB (Sync Harian)
    cron.schedule('1 0 * * *', async () => {
        await runDailyAgeSyncJob()
    })
    console.log("[Scheduler] Cron scheduler update umur otomatis berhasil diinisialisasi (Aktif tiap 00:01 malam)")
}

