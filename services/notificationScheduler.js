import cron from "node-cron"
import { getArrearsTracking } from "../models/financial.js"

export function startNotificationScheduler() {
    // Run every day at 08:00 AM
    cron.schedule('0 8 * * *', async () => {
        const now = new Date()
        const day = now.getDate()
        
        // Batas pembayaran IPL idealnya tanggal 5 setiap bulan
        if (day > 5) {
            const currentMonth = now.getMonth() + 1 // 1-12
            const currentYear = now.getFullYear()
            
            console.log(`[Scheduler] Pengecekan otomatis tunggakan IPL tanggal ${day} untuk bulan ${currentMonth}/${currentYear}...`)
            
            const listWarga = await getArrearsTracking(currentMonth, currentYear)
            if (Array.isArray(listWarga)) {
                const nunggak = listWarga.filter(w => !w.payment_status || w.payment_status === 'ditolak')
                
                for (const warga of nunggak) {
                    // Simulasi pengiriman notifikasi (Email / Telegram Bot gratisan)
                    console.log(`[Reminder Send] Mengirim tagihan reminder IPL ke Keluarga ${warga.kepala_keluarga_nama || 'Tanpa Nama'} (KK: ${warga.no_kk}) - Tagihan bulan ${currentMonth}/${currentYear} belum terbayar!`)
                }
            }
        }
    })
    console.log("[Scheduler] Cron scheduler reminder IPL berhasil diinisialisasi (Aktif tiap jam 08.00 pagi)")
}
