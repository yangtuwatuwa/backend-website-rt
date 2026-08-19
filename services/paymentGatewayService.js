import pool from "../config/sqlconfig.js";
import { writeLedgerEntry } from "../models/financial.js";
import { updateMultipleBillStatus } from "../models/billModel.js";
import { emitSyncEvent } from "../utils/socket.js";
import crypto from "crypto";

/**
 * Service Payment Gateway Abstraksi (Midtrans / Xendit / Sandbox Ready)
 */
export async function createPaymentSessionService({ familyId, amount, paymentType = "ipl", billIds = [], category = "sosial", description = "" }) {
    try {
        const orderId = `RT-${paymentType.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const targetAmount = Number(amount);

        const isMidtransConfigured = Boolean(process.env.MIDTRANS_SERVER_KEY);
        const isXenditConfigured = Boolean(process.env.XENDIT_SECRET_KEY);

        let snapToken = null;
        let paymentUrl = null;
        let gatewayProvider = "sandbox_mock";

        if (isMidtransConfigured) {
            gatewayProvider = "midtrans";
            snapToken = `SNAP-MIDTRANS-${crypto.randomBytes(8).toString("hex")}`;
            paymentUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`;
        } else if (isXenditConfigured) {
            gatewayProvider = "xendit";
            paymentUrl = `https://checkout.xendit.co/web/${orderId}`;
        } else {
            // Mock Sandbox Mode
            snapToken = `MOCK-SNAP-${Date.now()}`;
            paymentUrl = `http://localhost:5173/mock-payment?order_id=${orderId}&amount=${targetAmount}`;
        }

        // Cari resident_id
        const [wargaRows] = await pool.execute(
            "SELECT id FROM warga WHERE family_id = ? ORDER BY id ASC LIMIT 1",
            [familyId]
        );
        const residentId = wargaRows.length > 0 ? wargaRows[0].id : 1;

        // Catat transaksi awal di DB
        if (paymentType === "ipl") {
            let targetBillIds = Array.isArray(billIds) ? billIds.filter(id => Boolean(id)) : [];
            if (targetBillIds.length === 0) {
                // Cari bill unpaid untuk family ini
                const [bills] = await pool.execute(`
                    SELECT b.id, b.amount FROM bills b
                    JOIN warga w ON b.resident_id = w.id
                    WHERE w.family_id = ? AND b.status = 'unpaid'
                    ORDER BY b.due_date ASC LIMIT 1
                `, [familyId]);
                if (bills.length > 0) targetBillIds = [bills[0].id];
            }

            const [payRes] = await pool.execute(
                `INSERT INTO payments (resident_id, total_amount, channel, proof_url, status, created_at)
                 VALUES (?, ?, 'transfer', ?, 'pending', NOW())`,
                [residentId, targetAmount, `order_id:${orderId}`]
            );
            const paymentId = payRes.insertId;

            for (const bId of targetBillIds) {
                await pool.execute(
                    "INSERT INTO payment_bill_links (payment_id, bill_id, allocated_amount) VALUES (?, ?, ?)",
                    [paymentId, bId, targetAmount / (targetBillIds.length || 1)]
                );
            }
            if (targetBillIds.length > 0) {
                await updateMultipleBillStatus(targetBillIds, 'waiting_verification');
            }
        } else {
            await pool.execute(
                `INSERT INTO kas_contributions (resident_id, amount, category, description, channel, proof_url, status, created_at)
                 VALUES (?, ?, ?, ?, 'transfer', ?, 'pending', NOW())`,
                [residentId, targetAmount, category || "sosial", description || "Payment Gateway Kas RT", `order_id:${orderId}`]
            );
        }

        return {
            orderId,
            amount: targetAmount,
            gatewayProvider,
            snapToken,
            paymentUrl,
            status: "pending",
            qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(paymentUrl)}`,
            message: `Sesi pembayaran ${paymentType.toUpperCase()} berhasil dibuat (Provider: ${gatewayProvider})`
        };
    } catch (err) {
        console.error("error createPaymentSessionService:", err);
        throw err;
    }
}

/**
 * Handler Webhook Notification Callback dari Payment Gateway (Midtrans / Xendit / Mock)
 */
export async function handlePaymentWebhookService(payload) {
    try {
        const { order_id, orderId, transaction_status, transactionStatus, status, gross_amount, amount } = payload;
        const targetOrderId = order_id || orderId;
        const targetStatus = (transaction_status || transactionStatus || status || "").toLowerCase();

        console.log(`[Payment Webhook Received] OrderId: ${targetOrderId}, Status: ${targetStatus}`);

        if (!targetOrderId) {
            return "error: order_id wajib disertakan dalam callback webhook";
        }

        const isSuccess = ["settlement", "capture", "paid", "success", "approved", "diterima"].includes(targetStatus);
        const isFailed = ["deny", "cancel", "expire", "failed", "rejected", "ditolak"].includes(targetStatus);

        const newPaymentStatus = isSuccess ? "approved" : (isFailed ? "rejected" : "pending");

        // 1. Update payments & linked bills
        const [payRows] = await pool.execute("SELECT * FROM payments WHERE proof_url LIKE ?", [`%${targetOrderId}%`]);
        if (payRows && payRows.length > 0) {
            const row = payRows[0];
            await pool.execute("UPDATE payments SET status = ?, verified_at = NOW() WHERE id = ?", [newPaymentStatus, row.id]);

            const [links] = await pool.execute("SELECT bill_id FROM payment_bill_links WHERE payment_id = ?", [row.id]);
            const billIds = links.map(l => l.bill_id);

            if (isSuccess) {
                if (billIds.length > 0) await updateMultipleBillStatus(billIds, 'paid');
                if (row.status !== "approved") {
                    await writeLedgerEntry({
                        type: "in",
                        amount: row.total_amount,
                        sourceType: "ipl",
                        description: `Pembayaran IPL Via Gateway (${targetOrderId})`
                    });
                }
            } else if (isFailed) {
                if (billIds.length > 0) await updateMultipleBillStatus(billIds, 'unpaid');
            }
        }

        // 2. Update kas_contributions
        const [kasRows] = await pool.execute("SELECT * FROM kas_contributions WHERE proof_url LIKE ?", [`%${targetOrderId}%`]);
        if (kasRows && kasRows.length > 0) {
            const row = kasRows[0];
            await pool.execute("UPDATE kas_contributions SET status = ?, verified_at = NOW() WHERE id = ?", [newPaymentStatus, row.id]);

            if (isSuccess && row.status !== "approved") {
                await writeLedgerEntry({
                    type: "in",
                    amount: row.amount,
                    sourceType: "kas",
                    description: `Sumbangan Kas Via Gateway (${targetOrderId})`
                });
            }
        }

        emitSyncEvent("finance");

        return {
            orderId: targetOrderId,
            paymentStatus: newPaymentStatus,
            message: `Callback webhook berhasil diproses (${newPaymentStatus})`
        };
    } catch (err) {
        console.error("error handlePaymentWebhookService:", err);
        throw err;
    }
}
