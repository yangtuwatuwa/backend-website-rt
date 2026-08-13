import pool from "../config/sqlconfig.js";
import { insertLedger } from "../models/financial.js";
import { emitSyncEvent } from "../utils/socket.js";
import crypto from "crypto";

/**
 * Service Payment Gateway Abstraksi (Midtrans / Xendit / Sandbox Ready)
 */
export async function createPaymentSessionService({ familyId, amount, paymentType = "ipl", months = [], year = new Date().getFullYear(), category = "kas", description = "" }) {
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
            // Simulasi/Aktual Midtrans Snap Token
            snapToken = `SNAP-MIDTRANS-${crypto.randomBytes(8).toString("hex")}`;
            paymentUrl = `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`;
        } else if (isXenditConfigured) {
            gatewayProvider = "xendit";
            paymentUrl = `https://checkout.xendit.co/web/${orderId}`;
        } else {
            // Mock Sandbox Mode (Gratis & Siap Demo Dosen)
            snapToken = `MOCK-SNAP-${Date.now()}`;
            paymentUrl = `http://localhost:5173/mock-payment?order_id=${orderId}&amount=${targetAmount}`;
        }

        // Catat transaksi awal di DB
        if (paymentType === "ipl") {
            const monthsJson = Array.isArray(months) ? JSON.stringify(months) : JSON.stringify([new Date().getMonth() + 1]);
            await pool.execute(
                `INSERT INTO ipl_payment (id, family_id, amount, month, year, status, payment_proof, payment_date) 
                 VALUES (NULL, ?, ?, ?, ?, 'pending', ?)`,
                [familyId, targetAmount, monthsJson, year, `order_id:${orderId}`, new Date()]
            );
        } else {
            await pool.execute(
                `INSERT INTO kas_payment (id, family_id, amount, category, description, status, payment_proof, payment_date) 
                 VALUES (NULL, ?, ?, ?, ?, 'pending', ?, ?)`,
                [familyId, targetAmount, category, description || "Payment Gateway Kas RT", `order_id:${orderId}`, new Date()]
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

        const isSuccess = ["settlement", "capture", "paid", "success", "diterima"].includes(targetStatus);
        const isFailed = ["deny", "cancel", "expire", "failed", "ditolak"].includes(targetStatus);

        const newStatus = isSuccess ? "diterima" : (isFailed ? "ditolak" : "pending");

        // Update ipl_payment
        const [iplRows] = await pool.execute("SELECT * FROM ipl_payment WHERE payment_proof LIKE ?", [`%${targetOrderId}%`]);
        if (iplRows && iplRows.length > 0) {
            const row = iplRows[0];
            await pool.execute("UPDATE ipl_payment SET status = ? WHERE id = ?", [newStatus, row.id]);

            if (isSuccess && row.status !== "diterima") {
                await insertLedger("in", row.amount, "ipl", `Pembayaran IPL Via Gateway (${targetOrderId})`);
            }
        }

        // Update kas_payment
        const [kasRows] = await pool.execute("SELECT * FROM kas_payment WHERE payment_proof LIKE ?", [`%${targetOrderId}%`]);
        if (kasRows && kasRows.length > 0) {
            const row = kasRows[0];
            await pool.execute("UPDATE kas_payment SET status = ? WHERE id = ?", [newStatus, row.id]);

            if (isSuccess && row.status !== "diterima") {
                await insertLedger("in", row.amount, "kas", `Sumbangan Kas Via Gateway (${targetOrderId})`);
            }
        }

        emitSyncEvent("finance");

        return {
            orderId: targetOrderId,
            paymentStatus: newStatus,
            message: `Callback webhook berhasil diproses (${newStatus})`
        };
    } catch (err) {
        console.error("error handlePaymentWebhookService:", err);
        throw err;
    }
}
