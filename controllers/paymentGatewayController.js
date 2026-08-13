import { createPaymentSessionService, handlePaymentWebhookService } from "../services/paymentGatewayService.js";
import { responseSucces } from "../utils/response.js";
import pool from "../config/sqlconfig.js";

export async function createPaymentSessionController(req, res) {
    const { amount, paymentType, payment_type, months, year, category, description } = req.body;
    const familyId = req.user ? req.user.family_id || req.user.familyId : req.body.familyId;

    console.log(`[Request Payment Gateway Checkout] familyId: ${familyId}, amount: ${amount}, type: ${paymentType || payment_type}`);

    try {
        const session = await createPaymentSessionService({
            familyId,
            amount,
            paymentType: paymentType || payment_type || "ipl",
            months,
            year,
            category,
            description
        });

        return responseSucces(201, session, "Sesi pembayaran Payment Gateway berhasil dibuat!", res);
    } catch (err) {
        console.error("[Error Payment Gateway Checkout]:", err);
        return res.status(500).json({ pesan: "Error di controller createPaymentSessionController: " + err });
    }
}

export async function handlePaymentWebhookController(req, res) {
    console.log("[Request Payment Webhook Payload]:", req.body);

    try {
        const result = await handlePaymentWebhookService(req.body);
        if (typeof result === "string" && result.startsWith("error")) {
            return res.status(400).json({ pesan: result });
        }
        return res.status(200).json({
            response: 200,
            output: result,
            message: "Webhook payment notification accepted successfully"
        });
    } catch (err) {
        console.error("[Error Payment Webhook]:", err);
        return res.status(500).json({ pesan: "Error di controller handlePaymentWebhookController: " + err });
    }
}

export async function checkPaymentStatusController(req, res) {
    const { orderId } = req.params;
    console.log(`[Request Check Payment Status] OrderId: ${orderId}`);

    try {
        const [iplRows] = await pool.execute("SELECT * FROM ipl_payment WHERE payment_proof LIKE ?", [`%${orderId}%`]);
        const [kasRows] = await pool.execute("SELECT * FROM kas_payment WHERE payment_proof LIKE ?", [`%${orderId}%`]);

        const record = (iplRows && iplRows.length > 0) ? iplRows[0] : ((kasRows && kasRows.length > 0) ? kasRows[0] : null);

        if (!record) {
            return res.status(404).json({ pesan: "Order ID transaksi tidak ditemukan" });
        }

        return res.status(200).json({
            response: 200,
            output: {
                orderId,
                status: record.status,
                amount: record.amount,
                paymentDate: record.payment_date
            },
            message: "Status transaksi berhasil diambil"
        });
    } catch (err) {
        console.error("[Error Check Payment Status]:", err);
        return res.status(500).json({ pesan: "Error di controller checkPaymentStatusController: " + err });
    }
}
