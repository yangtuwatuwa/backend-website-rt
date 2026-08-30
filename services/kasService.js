import pool from "../config/sqlconfig.js";
import {
    createKasContribution,
    getKasContributionById,
    getKasContributionByIdForUpdate,
    getPendingKasContributions,
    getKasContributionsByFamily,
    getKasAuditList,
    updateKasVerification
} from "../models/kasModel.js";
import { writeLedgerEntry } from "../models/financial.js";
import { getAccountById } from "../models/login.js";
import { createNotification } from "./notificationService.js";

let submitKasSavepointCounter = 0;
let verifyKasSavepointCounter = 0;

/**
 * 1. Submit Iuran / Sumbangan Kas RT (Scope: family_id)
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
}, executor = undefined) {
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

    const cleanFamilyId = Number(familyId);
    if (!cleanFamilyId || cleanFamilyId <= 0) {
        return { error: "Kartu Keluarga (familyId) wajib disertakan!" };
    }

    const ownsTransaction = !executor;
    const connection = executor || await pool.getConnection();
    const savepointName = ownsTransaction
        ? null
        : `sp_submit_kas_${++submitKasSavepointCounter}`;
    let transactionStarted = false;
    let savepointCreated = false;

    try {
        if (ownsTransaction) {
            await connection.beginTransaction();
            transactionStarted = true;
        }

        const cleanDesc = description ? description.trim() : "-";
        const now = new Date();

        if (savepointName) {
            await connection.query(`SAVEPOINT ${savepointName}`);
            savepointCreated = true;
        }

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
                description: ledgerDesc
            }, connection);

            if (ownsTransaction) {
                await connection.commit();
                transactionStarted = false;
            } else if (savepointCreated) {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }

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

            if (ownsTransaction) {
                await connection.commit();
                transactionStarted = false;
            } else if (savepointCreated) {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }

            return {
                message: "Bukti pembayaran Kas berhasil diunggah, menunggu verifikasi Bendahara",
                contribution_id: insertResult.insertId,
                status: "pending"
            };
        }
    } catch (err) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error("error rollback submitKasContributionService:", rollbackErr);
            }
            transactionStarted = false;
        } else if (savepointCreated) {
            try {
                await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            } catch (rollbackErr) {
                console.error("error rollback savepoint submitKasContributionService:", rollbackErr);
            }

            try {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
            } catch (releaseErr) {
                console.error("error release savepoint submitKasContributionService:", releaseErr);
            }
        }

        console.error("error submitKasContributionService:", err);
        return { error: "Gagal memproses iuran kas: " + err.message };
    } finally {
        if (ownsTransaction) {
            connection.release();
        }
    }
}

/**
 * 2. Verifikasi Iuran Kas oleh Bendahara (Approve / Reject)
 */
export async function verifyKasContributionService({ contributionId, decision, actorId, rejectReason = null }, executor = undefined) {
    const validDecisions = ['approved', 'rejected'];
    if (!validDecisions.includes(decision)) {
        return { error: "Keputusan verifikasi tidak valid! Harus 'approved' atau 'rejected'." };
    }

    if (decision === 'rejected' && (!rejectReason || !rejectReason.trim())) {
        return { error: "Alasan penolakan (rejectReason) wajib diisi saat menolak iuran kas!" };
    }

    const ownsTransaction = !executor;
    const connection = executor || await pool.getConnection();
    const savepointName = ownsTransaction
        ? null
        : `sp_verify_kas_${++verifyKasSavepointCounter}`;
    let transactionStarted = false;
    let savepointCreated = false;

    try {
        if (ownsTransaction) {
            await connection.beginTransaction();
            transactionStarted = true;
        }

        const contribution = await getKasContributionByIdForUpdate(contributionId, connection);
        if (!contribution) {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return { error: "Data iuran kas tidak ditemukan!" };
        }

        if (contribution.status !== 'pending') {
            if (transactionStarted) {
                await connection.rollback();
                transactionStarted = false;
            }
            return { error: `Iuran kas ini sudah pernah diproses sebelumnya (Status: ${contribution.status})!` };
        }

        const now = new Date();

        if (savepointName) {
            await connection.query(`SAVEPOINT ${savepointName}`);
            savepointCreated = true;
        }

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
                description: ledgerDesc
            }, connection);

            if (ownsTransaction) {
                await connection.commit();
                transactionStarted = false;
            }

            // Notifikasi persetujuan iuran kas
            try {
                await createNotification({
                    familyId: contribution.family_id,
                    type: "kas",
                    title: "Iuran Kas Disetujui",
                    message: `Iuran Kas [${contribution.category.toUpperCase()}] Anda sebesar Rp ${Number(contribution.amount).toLocaleString('id-ID')} telah diverifikasi dan disetujui. Terima kasih!`,
                    referenceType: "kas_contribution",
                    referenceId: contributionId,
                    emitRealtime: ownsTransaction
                }, ownsTransaction ? undefined : connection);
            } catch (ne) {
                console.error("Non-blocking error notifikasi approve kas:", ne.message);
            }

            if (!ownsTransaction && savepointCreated) {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }

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

            if (ownsTransaction) {
                await connection.commit();
                transactionStarted = false;
            }

            // Notifikasi penolakan iuran kas dengan rejectReason
            try {
                await createNotification({
                    familyId: contribution.family_id,
                    type: "kas",
                    title: "Iuran Kas Ditolak",
                    message: `Iuran Kas [${contribution.category.toUpperCase()}] Anda sebesar Rp ${Number(contribution.amount).toLocaleString('id-ID')} ditolak. Alasan: ${rejectReason.trim()}`,
                    referenceType: "kas_contribution",
                    referenceId: contributionId,
                    emitRealtime: ownsTransaction
                }, ownsTransaction ? undefined : connection);
            } catch (ne) {
                console.error("Non-blocking error notifikasi reject kas:", ne.message);
            }

            if (!ownsTransaction && savepointCreated) {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
                savepointCreated = false;
            }

            return {
                message: "Iuran kas telah ditolak (Rejected).",
                contribution_id: contributionId,
                status: "rejected",
                reject_reason: rejectReason.trim()
            };
        }
    } catch (err) {
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error("error rollback verifyKasContributionService:", rollbackErr);
            }
            transactionStarted = false;
        } else if (savepointCreated) {
            try {
                await connection.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            } catch (rollbackErr) {
                console.error("error rollback savepoint verifyKasContributionService:", rollbackErr);
            }

            try {
                await connection.query(`RELEASE SAVEPOINT ${savepointName}`);
            } catch (releaseErr) {
                console.error("error release savepoint verifyKasContributionService:", releaseErr);
            }
        }

        console.error("error verifyKasContributionService:", err);
        return { error: "Gagal memverifikasi iuran kas: " + err.message };
    } finally {
        if (ownsTransaction) {
            connection.release();
        }
    }
}

/**
 * 3. Ambil Daftar Pending Iuran Kas untuk Verifikasi Bendahara
 */
export async function getPendingKasContributionsService(filters, executor = pool) {
    try {
        const list = await getPendingKasContributions(filters, executor);
        return list;
    } catch (err) {
        console.error("error getPendingKasContributionsService:", err);
        return { error: "Gagal mengambil daftar pending kas: " + err.message };
    }
}

/**
 * 4. Ambil Riwayat Iuran Kas Keluarga Sendiri (Family-Gate)
 */
export async function getMyKasHistoryService(userId, executor = pool) {
    try {
        const userData = await getAccountById(userId, executor);
        if (!userData || userData.length === 0) {
            return { error: "Akun warga tidak ditemukan!" };
        }
        const familyId = userData[0].family_id;
        if (!familyId) {
            return { error: "Akun Anda belum terhubung dengan Kartu Keluarga!" };
        }

        const list = await getKasContributionsByFamily(familyId, executor);
        return list;
    } catch (err) {
        console.error("error getMyKasHistoryService:", err);
        return { error: "Gagal mengambil riwayat kas keluarga: " + err.message };
    }
}

/**
 * 5. Ambil Audit Trail Iuran Kas untuk Bendahara & RT
 */
export async function getKasAuditService(filters, executor = pool) {
    try {
        const list = await getKasAuditList(filters, executor);
        return list;
    } catch (err) {
        console.error("error getKasAuditService:", err);
        return { error: "Gagal mengambil audit trail kas: " + err.message };
    }
}
