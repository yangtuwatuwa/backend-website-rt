import { 
    payIplService, 
    payKasService, 
    approveIplPaymentService, 
    approveKasPaymentService, 
    recordExpenseService, 
    recordIncomeService,
    recordManualPaymentService,
    getDashboardStatsService, 
    getTrackingService,
    getFinancialSummaryService,
    generateBatchBillsService

} from "../services/financialService.js"
import { 
    getFinancialSettings, 
    updateFinancialSettings, 
    getPendingIplPayments, 
    getPendingKasPayments, 
    getFamilyIplHistory, 
    getFamilyKasHistory,
    getLedgerList
} from "../models/financial.js"
import { getAccountById } from "../models/login.js"
import { responseSucces } from "../utils/response.js"
import { emitSyncEvent } from "../utils/socket.js"

// === Warga Controllers ===

export async function payIplController(req, res) {
    console.log("[Request Pay IPL] req.file:", req.file)
    console.log("[Request Pay IPL] req.body:", req.body)
    const userId = req.user.id
    let { months, year, amount } = req.body

    if (!req.file) {
        console.log("[Response Pay IPL] Gagal: File transfer bukti pembayaran kosong")
        return res.status(400).json({ pesan: "Bukti transfer pembayaran (file) wajib diunggah masbro!" })
    }

    try {
        // Parsing months jika dikirim sebagai stringified JSON array dari Form-Data
        if (typeof months === "string") {
            try {
                months = JSON.parse(months)
            } catch (e) {
                console.log("[Response Pay IPL] Gagal: parsing JSON months error", e)
                return res.status(400).json({ pesan: "Bulan (months) harus dikirim dalam format JSON array, contoh: [1, 2]" })
            }
        }

        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser.length === 0) {
            console.log(`[Response Pay IPL] Gagal: Akun warga userId ${userId} tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun warga tidak ditemukan" })
        }

        const familyId = dataUser[0].family_id
        if (!familyId) {
            console.log(`[Response Pay IPL] Gagal: Warga userId ${userId} belum memiliki familyId`)
            return res.status(400).json({ pesan: "Akun anda belum terikat dengan KK mana pun" })
        }

        const filename = req.file.filename
        const result = await payIplService(familyId, months, parseInt(year), parseInt(amount), filename)
        console.log("[Response Pay IPL] hasil:", result)

        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        emitSyncEvent("finance")
        return responseSucces(200, result, "Bukti pembayaran IPL berhasil diunggah masbro, menunggu approval bendahara", res)
    } catch (err) {
        console.log("[Error Pay IPL]:", err)
        return res.status(500).json({ pesan: "Error di controller payIplController: " + err })
    }
}

export async function payKasController(req, res) {
    console.log("[Request Pay Kas] req.file:", req.file)
    console.log("[Request Pay Kas] req.body:", req.body)
    const userId = req.user.id
    const { amount, category, description } = req.body

    if (!req.file) {
        console.log("[Response Pay Kas] Gagal: File transfer bukti pembayaran kosong")
        return res.status(400).json({ pesan: "Bukti transfer pembayaran (file) wajib diunggah masbro!" })
    }

    const allowed = ["kematian", "sosial", "kegiatan", "lainnya"]
    if (!allowed.includes(category)) {
        console.log(`[Response Pay Kas] Gagal: Kategori ${category} tidak valid`)
        return res.status(400).json({ pesan: "Kategori kas tidak valid. Pilihan: kematian, sosial, kegiatan, lainnya" })
    }

    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser.length === 0) {
            console.log(`[Response Pay Kas] Gagal: Akun warga userId ${userId} tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun warga tidak ditemukan" })
        }

        const familyId = dataUser[0].family_id
        const filename = req.file.filename

        const result = await payKasService(familyId, parseInt(amount), category, description || "-", filename)
        console.log("[Response Pay Kas] hasil:", result)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        emitSyncEvent("finance")
        return responseSucces(200, result, "Bukti pembayaran Kas berhasil diunggah masbro, menunggu approval bendahara", res)
    } catch (err) {
        console.log("[Error Pay Kas]:", err)
        return res.status(500).json({ pesan: "Error di controller payKasController: " + err })
    }
}

export async function getFamilyPaymentsController(req, res) {
    const userId = req.user.id
    console.log(`[Request Get Family Payments] userId: ${userId}`)
    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser.length === 0) {
            console.log(`[Response Get Family Payments] Gagal: Akun warga userId ${userId} tidak ditemukan`)
            return res.status(404).json({ pesan: "Akun warga tidak ditemukan" })
        }

        const familyId = dataUser[0].family_id
        if (!familyId) {
            console.log(`[Response Get Family Payments] Gagal: Warga userId ${userId} belum memiliki familyId`)
            return res.status(400).json({ pesan: "Akun anda belum terikat dengan KK mana pun" })
        }

        const iplHistory = await getFamilyIplHistory(familyId)
        const kasHistory = await getFamilyKasHistory(familyId)

        // Tambahkan info ketepatan_waktu untuk IPL
        const mappedIplHistory = iplHistory.map(item => {
            let ketepatanWaktu = "-"
            if (item.status === "diterima" && item.payment_date) {
                const payDate = new Date(item.payment_date)
                const payYear = payDate.getFullYear()
                const payMonth = payDate.getMonth() + 1
                const payDay = payDate.getDate()

                if (payYear < item.year) {
                    ketepatanWaktu = "Tepat Waktu"
                } else if (payYear === item.year) {
                    if (payMonth < item.month) {
                        ketepatanWaktu = "Tepat Waktu"
                    } else if (payMonth === item.month && payDay <= 10) {
                        ketepatanWaktu = "Tepat Waktu"
                    } else {
                        ketepatanWaktu = "Terlambat"
                    }
                } else {
                    ketepatanWaktu = "Terlambat"
                }
            }
            return {
                ...item,
                ketepatan_waktu: ketepatanWaktu
            }
        })

        console.log(`[Response Get Family Payments] sukses, iplHistory count: ${iplHistory.length}, kasHistory count: ${kasHistory.length}`)

        return responseSucces(200, { ipl: mappedIplHistory, kas: kasHistory }, "Histori pembayaran keluarga berhasil diambil", res)
    } catch (err) {
        console.log("[Error Get Family Payments]:", err)
        return res.status(500).json({ pesan: "Error di controller getFamilyPaymentsController: " + err })
    }
}

// === Bendahara & RT Controllers ===

export async function getPendingPaymentsController(req, res) {
    console.log("[Request Get Pending Payments]")
    try {
        const pendingIpl = await getPendingIplPayments()
        const pendingKas = await getPendingKasPayments()

        console.log("[Response Get Pending Payments] Pending IPL:", pendingIpl)
        console.log("[Response Get Pending Payments] Pending Kas:", pendingKas)

        return responseSucces(200, { ipl: pendingIpl, kas: pendingKas }, "Daftar pending pembayaran berhasil diambil", res)
    } catch (err) {
        console.log("[Error Get Pending Payments]:", err)
        return res.status(500).json({ pesan: "Error di controller getPendingPaymentsController: " + err })
    }
}

export async function approveIplPaymentController(req, res) {
    const { id } = req.params
    const { status } = req.body // diterima atau ditolak
    console.log(`[Request Approve IPL] id: ${id}, status: ${status}`)

    try {
        const result = await approveIplPaymentService(id, status)
        if (typeof result === "string" && result.startsWith("error")) {
            console.log(`[Response Approve IPL] Gagal:`, result)
            return res.status(400).json({ pesan: result })
        }

        console.log(`[Response Approve IPL] Sukses. Hasil DB:`, result)
        emitSyncEvent("finance")
        return responseSucces(200, result, `Pembayaran IPL berhasil di-set ${status} masbro!`, res)
    } catch (err) {
        console.log("[Error Approve IPL]:", err)
        return res.status(500).json({ pesan: "Error di controller approveIplPaymentController: " + err })
    }
}

export async function approveKasPaymentController(req, res) {
    const { id } = req.params
    const { status } = req.body // diterima atau ditolak
    console.log(`[Request Approve Kas] id: ${id}, status: ${status}`)

    try {
        const result = await approveKasPaymentService(id, status)
        if (typeof result === "string" && result.startsWith("error")) {
            console.log(`[Response Approve Kas] Gagal:`, result)
            return res.status(400).json({ pesan: result })
        }

        console.log(`[Response Approve Kas] Sukses. Hasil DB:`, result)
        emitSyncEvent("finance")
        return responseSucces(200, result, `Pembayaran Kas berhasil di-set ${status} masbro!`, res)
    } catch (err) {
        console.log("[Error Approve Kas]:", err)
        return res.status(500).json({ pesan: "Error di controller approveKasPaymentController: " + err })
    }
}

export async function recordExpenseController(req, res) {
    const { amount, sourceType, pos_pengeluaran, category, description, keterangan } = req.body
    const targetAmount = amount
    const targetType = sourceType || pos_pengeluaran || category || "lainnya"
    const targetDesc = description || keterangan || "-"
    const receiptFile = req.file ? req.file.filename : null

    console.log(`[Request Record Expense] amount: ${targetAmount}, sourceType: ${targetType}, receiptFile: ${receiptFile}`)

    if (!targetAmount || isNaN(targetAmount)) {
        return res.status(400).json({ pesan: "Nominal pengeluaran (amount) wajib diisi angka valid masbro!" })
    }

    try {
        const result = await recordExpenseService(parseInt(targetAmount), targetType, targetDesc, receiptFile)
        console.log("[Response Record Expense] hasil:", result)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        emitSyncEvent("finance")
        return responseSucces(200, result, "Pengeluaran kas RT berhasil dicatat cuy!", res)
    } catch (err) {
        console.log("[Error Record Expense]:", err)
        return res.status(500).json({ pesan: "Error di controller recordExpenseController: " + err })
    }
}

export async function getFinancialSummaryController(req, res) {
    const year = req.query.year || new Date().getFullYear()
    console.log(`[Request Get Financial Summary] year: ${year}`)
    try {
        const summary = await getFinancialSummaryService(year)
        if (typeof summary === "string" && summary.startsWith("error")) {
            return res.status(400).json({ pesan: summary })
        }
        return responseSucces(200, summary, "Rekapitulasi arus kas bulanan berhasil diambil masbro", res)
    } catch (err) {
        console.log("[Error Get Financial Summary]:", err)
        return res.status(500).json({ pesan: "Error di controller getFinancialSummaryController: " + err })
    }
}


export async function recordIncomeController(req, res) {
    const { amount, sourceType, description } = req.body
    console.log(`[Request Record Income] amount: ${amount}, sourceType: ${sourceType}, description: ${description}`)

    try {
        const result = await recordIncomeService(parseInt(amount), sourceType, description)
        console.log("[Response Record Income] hasil:", result)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        emitSyncEvent("finance")
        return responseSucces(200, result, "Pemasukan kas RT (luar iuran) berhasil dicatat cuy!", res)
    } catch (err) {
        console.log("[Error Record Income]:", err)
        return res.status(500).json({ pesan: "Error di controller recordIncomeController: " + err })
    }
}


export async function updateFinancialSettingsController(req, res) {
    const { iplNominal, previousBalance, ipl_amount, ipl_nominal, previous_balance, saldo_awal } = req.body
    console.log(`[Request Update Financial Settings] body:`, req.body)

    try {
        // Ambil data settings saat ini dari database untuk fallback
        const currentSettings = await getFinancialSettings()
        if (typeof currentSettings === "string" && currentSettings.startsWith("error")) {
            console.log("[Response Update Financial Settings] Gagal mengambil settings saat ini:", currentSettings)
            return res.status(500).json({ pesan: currentSettings })
        }

        // Tentukan nilai ipl nominal dengan fallback ke db
        const rawIpl = iplNominal ?? ipl_nominal ?? ipl_amount
        const parsedIpl = rawIpl !== undefined ? parseInt(rawIpl) : NaN
        const finalIpl = !isNaN(parsedIpl) ? parsedIpl : (currentSettings ? currentSettings.ipl_nominal : 200000)

        // Tentukan nilai previous balance dengan fallback ke db
        const rawPrevBalance = previousBalance ?? previous_balance ?? saldo_awal
        const parsedPrevBalance = rawPrevBalance !== undefined ? parseInt(rawPrevBalance) : NaN
        const finalPrevBalance = !isNaN(parsedPrevBalance) ? parsedPrevBalance : (currentSettings ? currentSettings.previous_balance : 0)

        console.log(`[Request Update Financial Settings] Parsed values -> ipl: ${finalIpl}, previousBalance: ${finalPrevBalance}`)

        const result = await updateFinancialSettings(finalIpl, finalPrevBalance)
        console.log("[Response Update Financial Settings] hasil:", result)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        return responseSucces(200, result, "Pengaturan keuangan RT berhasil diperbarui masbro", res)
    } catch (err) {
        console.log("[Error Update Financial Settings]:", err)
        return res.status(500).json({ pesan: "Error di controller updateFinancialSettingsController: " + err })
    }
}

export async function getFinancialSettingsController(req, res) {
    console.log("[Request Get Financial Settings]")
    try {
        const settings = await getFinancialSettings()
        console.log("[Response Get Financial Settings] hasil:", settings)
        if (typeof settings === "string" && settings.startsWith("error")) {
            return res.status(400).json({ pesan: settings })
        }
        return res.json(settings)
    } catch (err) {
        console.log("[Error Get Financial Settings]:", err)
        return res.status(500).json({ pesan: "Error di controller getFinancialSettingsController: " + err })
    }
}

export async function getArrearsTrackingController(req, res) {
    const now = new Date()
    const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1
    const year = req.query.year ? parseInt(req.query.year) : now.getFullYear()
    console.log(`[Request Get Arrears Tracking] month: ${month}, year: ${year}`)

    try {
        const list = await getTrackingService(month, year)
        if (typeof list === "string" && list.startsWith("error")) {
            console.log("[Response Get Arrears Tracking] Gagal:", list)
            return res.status(400).json({ pesan: list })
        }

        const settings = await getFinancialSettings()
        const iplNominal = settings ? settings.ipl_nominal : 200000

        // Petakan warga yang bayar, pending, atau nunggak (belum bayar / ditolak)
        const mappedList = list.map(item => {
            let statusLabel = "Nunggak"
            let ketepatanWaktu = "-"
            
            if (item.payment_status === "diterima") {
                statusLabel = "Lunas"
                
                // Evaluasi apakah pembayaran tepat waktu (maksimal tanggal 10)
                if (item.payment_date) {
                    const payDate = new Date(item.payment_date)
                    const payYear = payDate.getFullYear()
                    const payMonth = payDate.getMonth() + 1
                    const payDay = payDate.getDate()

                    if (payYear < year) {
                        ketepatanWaktu = "Tepat Waktu"
                    } else if (payYear === year) {
                        if (payMonth < month) {
                            ketepatanWaktu = "Tepat Waktu"
                        } else if (payMonth === month && payDay <= 10) {
                            ketepatanWaktu = "Tepat Waktu"
                        } else {
                            ketepatanWaktu = "Terlambat"
                        }
                    } else {
                        ketepatanWaktu = "Terlambat"
                    }
                }
            } else if (item.payment_status === "pending") {
                statusLabel = "Pending Verifikasi"
            }

            return {
                family_id: item.family_id,
                no_kk: item.no_kk,
                kepala_keluarga_nama: item.kepala_keluarga_nama || "Tanpa Nama",
                target_bulan: `${month}/${year}`,
                nominal_tagihan: iplNominal,
                status: statusLabel,
                ketepatan_waktu: ketepatanWaktu
            }
        })
        console.log(`[Response Get Arrears Tracking] count: ${mappedList.length}`)

        return responseSucces(200, mappedList, "Daftar status iuran IPL warga berhasil ditarik masbro", res)
    } catch (err) {
        console.log("[Error Get Arrears Tracking]:", err)
        return res.status(500).json({ pesan: "Error di controller getArrearsTrackingController: " + err })
    }
}

// === Public Controller ===

export async function getDashboardStatsController(req, res) {
    console.log("[Request Get Dashboard Stats]")
    try {
        const stats = await getDashboardStatsService()
        if (typeof stats === "string" && stats.startsWith("error")) {
            console.log("[Response Get Dashboard Stats] Gagal:", stats)
            return res.status(400).json({ pesan: stats })
        }

        const ledgerHistory = await getLedgerList()
        console.log("[Response Get Dashboard Stats] sukses")

        return responseSucces(200, { stats, ledger: ledgerHistory }, "Statistik dashboard kas RT berhasil diambil masbro", res)
    } catch (err) {
        console.log("[Error Get Dashboard Stats]:", err)
        return res.status(500).json({ pesan: "Error di controller getDashboardStatsController: " + err })
    }
}

export async function recordManualPaymentController(req, res) {
    const { family_id, familyId, jenis_iuran, jenisIuran, amount, month, year, category, description, payment_date, paymentDate } = req.body
    const targetFamilyId = family_id || familyId
    const targetJenisIuran = (jenis_iuran || jenisIuran || "ipl").toLowerCase()
    const targetAmount = amount
    const targetMonth = month
    const targetYear = year
    const targetDate = payment_date || paymentDate

    console.log(`[Request Record Manual Payment] familyId: ${targetFamilyId}, jenisIuran: ${targetJenisIuran}, amount: ${targetAmount}`)

    if (!targetFamilyId) {
        return res.status(400).json({ pesan: "Pilih Warga / KK Pembayar dulu masbro!" })
    }
    if (!targetAmount || isNaN(targetAmount) || Number(targetAmount) <= 0) {
        return res.status(400).json({ pesan: "Nominal pembayaran wajib diisi angka positif masbro!" })
    }

    try {
        const result = await recordManualPaymentService(
            targetFamilyId,
            targetJenisIuran,
            Number(targetAmount),
            targetMonth,
            targetYear,
            category,
            description,
            targetDate
        )
        console.log("[Response Record Manual Payment] hasil:", result)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        emitSyncEvent("finance")
        return responseSucces(201, result, "Pencatatan iuran warga manual berhasil disimpan masbro!", res)
    } catch (err) {
        console.log("[Error Record Manual Payment]:", err)
        return res.status(500).json({ pesan: "Error di controller recordManualPaymentController: " + err })
    }
}

export async function generateBatchBillsController(req, res) {
    const { title, nominal, amount, startMonth, start_month, startYear, start_year, endMonth, end_month, endYear, end_year } = req.body

    const targetAmount = nominal || amount
    const targetStartMonth = startMonth || start_month || 1
    const targetStartYear = startYear || start_year || new Date().getFullYear()
    const targetEndMonth = endMonth || end_month || 12
    const targetEndYear = endYear || end_year || targetStartYear

    console.log(`[Request Generate Batch Bills] title: ${title}, amount: ${targetAmount}, period: ${targetStartMonth}/${targetStartYear} - ${targetEndMonth}/${targetEndYear}`)

    try {
        const result = await generateBatchBillsService({
            title,
            amount: targetAmount,
            startMonth: targetStartMonth,
            startYear: targetStartYear,
            endMonth: targetEndMonth,
            endYear: targetEndYear
        })

        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        emitSyncEvent("finance")
        return responseSucces(201, result, "Tagihan IPL periode berhasil diterbitkan untuk seluruh warga aktif!", res)
    } catch (err) {
        console.log("[Error Generate Batch Bills]:", err)
        return res.status(500).json({ pesan: "Error di controller generateBatchBillsController: " + err })
    }
}

