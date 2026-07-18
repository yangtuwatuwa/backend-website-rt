import { 
    getFinancialSettings, 
    updateFinancialSettings, 
    createIplPayment, 
    getIplPaymentById, 
    getPendingIplPayments, 
    updateIplPaymentStatus, 
    getFamilyIplHistory, 
    createKasPayment, 
    getKasPaymentById, 
    getPendingKasPayments, 
    updateKasPaymentStatus, 
    getFamilyKasHistory, 
    insertLedger, 
    getLedgerStats, 
    getLedgerList, 
    getArrearsTracking 
} from "../models/financial.js"
import { getWargas } from "../models/inputwarganya.js"

export async function payIplService(familyId, months, year, amount, filename) {
    if (!Array.isArray(months) || months.length === 0) {
        return "error: months harus berupa array bulan masbro"
    }

    try {
        const settings = await getFinancialSettings()
        const iplNominal = settings ? settings.ipl_nominal : 200000
        const totalExpected = iplNominal * months.length

        // Bagi rata nominal untuk tiap bulan yang dibayar
        const monthlyAmount = Math.round(amount / months.length)

        const insertedPayments = []
        for (const month of months) {
            const result = await createIplPayment(familyId, monthlyAmount, month, year, filename)
            if (typeof result === "string" && result.startsWith("error")) {
                return result
            }
            insertedPayments.push(result.insertId)
        }

        return { message: "Pembayaran IPL pending berhasil dicatat masbro", payment_ids: insertedPayments }
    } catch (err) {
        console.log(err)
        return "error payIplService: " + err
    }
}

export async function payKasService(familyId, amount, category, description, filename) {
    try {
        const result = await createKasPayment(familyId, amount, category, description, filename)
        return result
    } catch (err) {
        console.log(err)
        return "error payKasService: " + err
    }
}

export async function approveIplPaymentService(paymentId, status) {
    const allowed = ["diterima", "ditolak"]
    if (!allowed.includes(status)) {
        return "error: status harus diterima atau ditolak masbro"
    }

    try {
        const payment = await getIplPaymentById(paymentId)
        if (!payment || (typeof payment === "string" && payment.startsWith("error"))) {
            return "error: data pembayaran tidak ditemukan"
        }

        const result = await updateIplPaymentStatus(paymentId, status)
        if (typeof result === "string" && result.startsWith("error")) {
            return result
        }

        // Jika disetujui, masukkan ke Buku Kas (Buku Besar / Ledger)
        if (status === "diterima") {
            const desc = `Pembayaran IPL KK ID ${payment.family_id} (Bulan ${payment.month}/${payment.year})`
            await insertLedger("in", payment.amount, "ipl", desc)
        }

        return result
    } catch (err) {
        console.log(err)
        return "error approveIplPaymentService: " + err
    }
}

export async function approveKasPaymentService(paymentId, status) {
    const allowed = ["diterima", "ditolak"]
    if (!allowed.includes(status)) {
        return "error: status harus diterima atau ditolak masbro"
    }

    try {
        const payment = await getKasPaymentById(paymentId)
        if (!payment || (typeof payment === "string" && payment.startsWith("error"))) {
            return "error: data pembayaran tidak ditemukan"
        }

        const result = await updateKasPaymentStatus(paymentId, status)
        if (typeof result === "string" && result.startsWith("error")) {
            return result
        }

        // Jika disetujui, masukkan ke Buku Kas (Buku Besar / Ledger)
        if (status === "diterima") {
            const desc = `Iuran Kas [${payment.category.toUpperCase()}] - ${payment.description} (KK ID ${payment.family_id})`
            await insertLedger("in", payment.amount, "kas", desc)
        }

        return result
    } catch (err) {
        console.log(err)
        return "error approveKasPaymentService: " + err
    }
}

export async function recordExpenseService(amount, sourceType, description) {
    const allowedExpenses = ["kebersihan", "keamanan", "taman", "operasional_rt", "kematian", "sosial", "kegiatan", "lainnya"]
    if (!allowedExpenses.includes(sourceType)) {
        return `error: pos pengeluaran ${sourceType} tidak valid masbro`
    }

    try {
        const result = await insertLedger("out", amount, sourceType, description)
        return result
    } catch (err) {
        console.log(err)
        return "error recordExpenseService: " + err
    }
}

export async function recordIncomeService(amount, sourceType, description) {
    const cleanType = String(sourceType).toLowerCase().trim()
    
    // Map frontend categories to existing database ENUM values
    let dbSourceType = "lainnya"
    if (cleanType === "donasi" || cleanType === "donasi_sukarela" || cleanType === "donasi / sukarela" || cleanType === "hibah") {
        dbSourceType = "sosial"
    } else if (cleanType === "sponsorship" || cleanType === "kegiatan") {
        dbSourceType = "kegiatan"
    } else if (cleanType === "subsidi" || cleanType === "lainnya") {
        dbSourceType = "lainnya"
    } else {
        dbSourceType = "lainnya"
    }

    // Format description with the original category label for auditing
    const categoryLabel = cleanType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    const finalDescription = `[${categoryLabel}] ${description}`

    try {
        const result = await insertLedger("in", amount, dbSourceType, finalDescription)
        return result
    } catch (err) {
        console.log("error recordIncomeService:", err)
        return "error recordIncomeService: " + err
    }
}

export async function getDashboardStatsService() {
    try {
        // 1. Hitung total warga
        const wargas = await getWargas()
        const totalWarga = Array.isArray(wargas) ? wargas.length : 0

        // 2. Ambil pengaturan keuangan (saldo awal)
        const settings = await getFinancialSettings()
        const previousBalance = settings ? settings.previous_balance : 0

        // 3. Hitung total pemasukan & pengeluaran dari ledger
        const ledgerStats = await getLedgerStats()
        const income = ledgerStats ? parseInt(ledgerStats.total_income) || 0 : 0
        const expense = ledgerStats ? parseInt(ledgerStats.total_expense) || 0 : 0

        // 4. Hitung saldo berjalan saat ini
        const currentBalance = previousBalance + income - expense

        return {
            total_warga: totalWarga,
            previous_balance: previousBalance,
            total_income: income,
            total_expense: expense,
            current_balance: currentBalance
        }
    } catch (err) {
        console.log(err)
        return "error getDashboardStatsService: " + err
    }
}

export async function getTrackingService(month, year) {
    try {
        const result = await getArrearsTracking(month, year)
        return result
    } catch (err) {
        console.log(err)
        return "error getTrackingService: " + err
    }
}
