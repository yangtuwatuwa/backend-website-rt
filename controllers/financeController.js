import { 
    payIplService, 
    payKasService, 
    approveIplPaymentService, 
    approveKasPaymentService, 
    recordExpenseService, 
    getDashboardStatsService, 
    getTrackingService 
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

// === Warga Controllers ===

export async function payIplController(req, res) {
    const userId = req.user.id
    let { months, year, amount } = req.body

    if (!req.file) {
        return res.status(400).json({ pesan: "Bukti transfer pembayaran (file) wajib diunggah masbro!" })
    }

    try {
        // Parsing months jika dikirim sebagai stringified JSON array dari Form-Data
        if (typeof months === "string") {
            try {
                months = JSON.parse(months)
            } catch (e) {
                return res.status(400).json({ pesan: "Bulan (months) harus dikirim dalam format JSON array, contoh: [1, 2]" })
            }
        }

        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser.length === 0) {
            return res.status(404).json({ pesan: "Akun warga tidak ditemukan" })
        }

        const familyId = dataUser[0].family_id
        if (!familyId) {
            return res.status(400).json({ pesan: "Akun anda belum terikat dengan KK mana pun" })
        }

        const filename = req.file.filename
        const result = await payIplService(familyId, months, parseInt(year), parseInt(amount), filename)

        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        return responseSucces(200, result, "Bukti pembayaran IPL berhasil diunggah masbro, menunggu approval bendahara", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller payIplController: " + err })
    }
}

export async function payKasController(req, res) {
    const userId = req.user.id
    const { amount, category, description } = req.body

    if (!req.file) {
        return res.status(400).json({ pesan: "Bukti transfer pembayaran (file) wajib diunggah masbro!" })
    }

    const allowed = ["kematian", "sosial", "kegiatan", "lainnya"]
    if (!allowed.includes(category)) {
        return res.status(400).json({ pesan: "Kategori kas tidak valid. Pilihan: kematian, sosial, kegiatan, lainnya" })
    }

    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser.length === 0) {
            return res.status(404).json({ pesan: "Akun warga tidak ditemukan" })
        }

        const familyId = dataUser[0].family_id
        const filename = req.file.filename

        const result = await payKasService(familyId, parseInt(amount), category, description || "-", filename)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        return responseSucces(200, result, "Bukti pembayaran Kas berhasil diunggah masbro, menunggu approval bendahara", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller payKasController: " + err })
    }
}

export async function getFamilyPaymentsController(req, res) {
    const userId = req.user.id
    try {
        const dataUser = await getAccountById(userId)
        if (!dataUser || dataUser.length === 0) {
            return res.status(404).json({ pesan: "Akun warga tidak ditemukan" })
        }

        const familyId = dataUser[0].family_id
        if (!familyId) {
            return res.status(400).json({ pesan: "Akun anda belum terikat dengan KK mana pun" })
        }

        const iplHistory = await getFamilyIplHistory(familyId)
        const kasHistory = await getFamilyKasHistory(familyId)

        return responseSucces(200, { ipl: iplHistory, kas: kasHistory }, "Histori pembayaran keluarga berhasil diambil", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller getFamilyPaymentsController: " + err })
    }
}

// === Bendahara & RT Controllers ===

export async function getPendingPaymentsController(req, res) {
    try {
        const pendingIpl = await getPendingIplPayments()
        const pendingKas = await getPendingKasPayments()

        return responseSucces(200, { ipl: pendingIpl, kas: pendingKas }, "Daftar pending pembayaran berhasil diambil", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller getPendingPaymentsController: " + err })
    }
}

export async function approveIplPaymentController(req, res) {
    const { id } = req.params
    const { status } = req.body // diterima atau ditolak

    try {
        const result = await approveIplPaymentService(id, status)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        return responseSucces(200, result, `Pembayaran IPL berhasil di-set ${status} masbro!`, res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller approveIplPaymentController: " + err })
    }
}

export async function approveKasPaymentController(req, res) {
    const { id } = req.params
    const { status } = req.body // diterima atau ditolak

    try {
        const result = await approveKasPaymentService(id, status)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        return responseSucces(200, result, `Pembayaran Kas berhasil di-set ${status} masbro!`, res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller approveKasPaymentController: " + err })
    }
}

export async function recordExpenseController(req, res) {
    const { amount, sourceType, description } = req.body

    try {
        const result = await recordExpenseService(parseInt(amount), sourceType, description)
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        return responseSucces(200, result, "Pengeluaran kas RT berhasil dicatat cuy!", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller recordExpenseController: " + err })
    }
}

export async function updateFinancialSettingsController(req, res) {
    const { iplNominal, previousBalance } = req.body

    try {
        const result = await updateFinancialSettings(parseInt(iplNominal), parseInt(previousBalance))
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result })
        }

        return responseSucces(200, result, "Pengaturan keuangan RT berhasil diperbarui masbro", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller updateFinancialSettingsController: " + err })
    }
}

export async function getArrearsTrackingController(req, res) {
    const now = new Date()
    const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1
    const year = req.query.year ? parseInt(req.query.year) : now.getFullYear()

    try {
        const list = await getTrackingService(month, year)
        if (typeof list === "string" && list.startsWith("error")) {
            return res.status(400).json({ pesan: list })
        }

        const settings = await getFinancialSettings()
        const iplNominal = settings ? settings.ipl_nominal : 200000

        // Petakan warga yang bayar, pending, atau nunggak (belum bayar / ditolak)
        const mappedList = list.map(item => {
            let statusLabel = "Nunggak"
            if (item.payment_status === "diterima") statusLabel = "Lunas"
            else if (item.payment_status === "pending") statusLabel = "Pending Verifikasi"

            return {
                family_id: item.family_id,
                no_kk: item.no_kk,
                kepala_keluarga_nama: item.kepala_keluarga_nama || "Tanpa Nama",
                target_bulan: `${month}/${year}`,
                nominal_tagihan: iplNominal,
                status: statusLabel
            }
        })

        return responseSucces(200, mappedList, "Daftar status iuran IPL warga berhasil ditarik masbro", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller getArrearsTrackingController: " + err })
    }
}

// === Public Controller ===

export async function getDashboardStatsController(req, res) {
    try {
        const stats = await getDashboardStatsService()
        if (typeof stats === "string" && stats.startsWith("error")) {
            return res.status(400).json({ pesan: stats })
        }

        const ledgerHistory = await getLedgerList()

        return responseSucces(200, { stats, ledger: ledgerHistory }, "Statistik dashboard kas RT berhasil diambil masbro", res)
    } catch (err) {
        console.log(err)
        return res.status(500).json({ pesan: "Error di controller getDashboardStatsController: " + err })
    }
}
