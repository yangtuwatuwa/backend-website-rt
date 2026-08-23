import pool from "../config/sqlconfig.js";
import {
    createKasContribution,
    getKasContributionById,
    getKasContributionByIdForUpdate,
    getPendingKasContributions,
    getKasContributionsByResident,
    getKasContributionsByFamily,
    getKasAuditList,
    updateKasVerification
} from "../models/kasModel.js";
import { writeLedgerEntry } from "../models/financial.js";
import { getAccountById } from "../models/login.js";

/**
 * 1. Submit Iuran / Sumbangan Kas RT (Warga / Pengurus)
 * - Channel 'cash_to_bendahara': Langsung APPROVED & Dicatat ke Buku Kas (financial_ledger)
 * - Channel 'transfer' atau 'cash_to_rt': Status PENDING menunggu approval bendahara
 */
export async function submitKasContributionService({
    familyId,
    residentId, // Fallback parameter
    amount,
    category,
    description = "-",
    channel = 'transfer',
    proofUrl = null,
    recordedBy = null
}) {
    const targetFamilyId = familyId || residentId;
    const validCategories = ['kematian', 'sosial', 'kegiatan', 'lainnya'];
    const cleanCategory = String(category || "").toLowerCase().trim();
    if (!validCategories.includes(cleanCategory)) {
        return { error: "Kategori kas tidak valid! Pilihan: kematian, sosial, kegiatan, lainnya" };
    }

    const validChannels = ['transfer', 'cash_to_rt', 'cash_to_bendahara'];
    if (!validChannels.includes(channel)) {
        return { error: "Metode pembayaran (channel) tidak valid! Pilihan: transfer, cash_to_rt, cash_to_bendahara" };
    }

    const cleanAmount = parseFloat(amount);
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
        return { error: "Nominal iuran kas (amount) harus berupa angka valid positif!" };
    }

    if (channel === 'transfer' && !proofUrl) {
        return { error: "Bukti transfer (proofUrl/file) wajib diunggah untuk pembayaran transfer!" };
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const cleanDesc = description ? description.trim() : "-";
        const now = new Date();

        if (channel === 'cash_to_bendahara') {
            // Tunai langsung diterima Bendahara -> Approved & Catat ke Ledger
            const insertResult = await createKasContribution({
                familyId: targetFamilyId,
                amount: cleanAmount,
                category: cleanCategory,
                description: cleanDesc,
                channel,
                proofUrl: proofUrl || 'cash_in_hand',
                status: 'approved',
                recordedBy,
                verifiedBy: recordedBy,
                verifiedAt: now
            }, connection);

            const ledgerDesc = `Iuran Kas [${cleanCategory.toUpperCase()}] - ${cleanDesc} (KK ID ${targetFamilyId})`;
            await writeLedgerEntry({
                type: 'in',
                amount: cleanAmount,
                sourceType: 'kas',
                description: ledgerDesc,
                connection
            });

            await connection.commit();

            return {
                message: "Iuran kas tunai berhasil dicatat dan diverifikasi (Lunas)",
                contribution_id: insertResult.insertId,
                status: "approved"
            };
        } else {
            // Transfer atau Cash via RT -> Pending verifikasi Bendahara
            const insertResult = await createKasContribution({
                familyId: targetFamilyId,
                amount: cleanAmount,
                category: cleanCategory,
                description: cleanDesc,
                channel,
                proofUrl,
                status: 'pending',
                recordedBy
            }, connection);

            await connection.commit();

            return {
                message: "Bukti pembayaran Kas berhasil diunggah, menunggu verifikasi Bendahara",
                contribution_id: insertResult.insertId,
                status: "pending"
            };
        }
    } catch (err) {
        await connection.rollback();
        console.error("error submitKasContributionService:", err);
        return { error: "Gagal memproses iuran kas: " + err.message };
    } finally {
        connection.release();
    }
}

/**
 * 2. Verifikasi Iuran Kas oleh Bendahara (Approve / Reject)
 */
export async function verifyKasContributionService({ contributionId, decision, actorId, rejectReason = null }) {
    const validDecisions = ['approved', 'rejected'];
    if (!validDecisions.includes(decision)) {
        return { error: "Keputusan verifikasi tidak valid! Harus 'approved' atau 'rejected'." };
    }

    if (decision === 'rejected' && (!rejectReason || !rejectReason.trim())) {
        return { error: "Alasan penolakan (rejectReason) wajib diisi saat menolak iuran kas!" };
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const contribution = await getKasContributionByIdForUpdate(contributionId, connection);
        if (!contribution) {
            await connection.rollback();
            return { error: "Data iuran kas tidak ditemukan!" };
        }

        if (contribution.status !== 'pending') {
            await connection.rollback();
            return { error: `Iuran kas ini sudah pernah diproses sebelumnya (Status: ${contribution.status})!` };
        }

        const now = new Date();

        if (decision === 'approved') {
            // Update status menjadi 'approved'
            await updateKasVerification(contributionId, {
                status: 'approved',
                rejectReason: null,
                verifiedBy: actorId,
                verifiedAt: now
            }, connection);

            // Tulis entri ke Buku Kas RT (financial_ledger)
            const ledgerDesc = `Iuran Kas [${contribution.category.toUpperCase()}] - ${contribution.description || '-'} (KK ID ${contribution.family_id})`;
            await writeLedgerEntry({
                type: 'in',
                amount: contribution.amount,
                sourceType: 'kas',
                description: ledgerDesc,
                connection
            });

            await connection.commit();

            return {
                message: "Iuran kas berhasil disetujui (Approved). Transaksi tercatat di Buku Kas.",
                contribution_id: contributionId,
                status: "approved"
            };
        } else {
            // Update status menjadi 'rejected'
            await updateKasVerification(contributionId, {
                status: 'rejected',
                rejectReason: rejectReason.trim(),
                verifiedBy: actorId,
                verifiedAt: now
            }, connection);

            await connection.commit();

            return {
                message: "Iuran kas telah ditolak (Rejected).",
                contribution_id: contributionId,
                status: "rejected",
                reject_reason: rejectReason.trim()
            };
        }
    } catch (err) {
        await connection.rollback();
        console.error("error verifyKasContributionService:", err);
        return { error: "Gagal memverifikasi iuran kas: " + err.message };
    } finally {
        connection.release();
    }
}

/**
 * 3. Ambil Daftar Pending Iuran Kas untuk Verifikasi Bendahara
 */
export async function getPendingKasContributionsService(filters) {
    try {
        const list = await getPendingKasContributions(filters);
        return list;
    } catch (err) {
        console.error("error getPendingKasContributionsService:", err);
        return { error: "Gagal mengambil daftar pending kas: " + err.message };
    }
}

/**
 * 4. Ambil Riwayat Iuran Kas Keluarga Sendiri (Family-Gate)
 */
export async function getMyKasHistoryService(userId) {
    try {
        const userData = await getAccountById(userId);
        if (!userData || userData.length === 0) {
            return { error: "Akun warga tidak ditemukan!" };
        }
        const familyId = userData[0].family_id;
        if (!familyId) {
            return { error: "Akun Anda belum terhubung dengan Kartu Keluarga!" };
        }

        const list = await getKasContributionsByFamily(familyId);
        return list;
    } catch (err) {
        console.error("error getMyKasHistoryService:", err);
        return { error: "Gagal mengambil riwayat kas keluarga: " + err.message };
    }
}

/**
 * 5. Ambil Audit Trail Iuran Kas untuk Bendahara & RT
 */
export async function getKasAuditService(filters) {
    try {
        const list = await getKasAuditList(filters);
        return list;
    } catch (err) {
        console.error("error getKasAuditService:", err);
        return { error: "Gagal mengambil audit trail kas: " + err.message };
    }
}
