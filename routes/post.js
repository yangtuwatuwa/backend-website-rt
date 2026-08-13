import e from "express";
import { regist, login } from "../controllers/registandlogin.js";
// import debugRegisterFamily removed – endpoint now uses regular regist
import { regex , verifyInput } from "../middlewares/verivyGmail.js";
import { authLimiter } from "../middlewares/rateLimiter.js";

const app = e()


app.post("/login", authLimiter, login)
app.post("/register", verifyInput(regex), regist);
app.post("/debug-regist", verifyInput(regex), regist);



// Route Dashboard Landing Page — 1 endpoint gendut, angka doang, tanpa JWT
import { dashboardSummaryController } from "../controllers/dashboardController.js"

app.get("/dashboard-summary", dashboardSummaryController)

// Route Payment Gateway Webhook (Midtrans / Xendit / Tripay / Sandbox Callback)
import { handlePaymentWebhookController } from "../controllers/paymentGatewayController.js"
app.post("/payment-webhook", handlePaymentWebhookController)

export default app

