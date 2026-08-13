import express from "express";
import { requestOtpController, verifyOtpController } from "../controllers/otpController.js";
import { authLimiter } from "../middlewares/rateLimiter.js";

const router = express.Router();

// Route untuk meminta kode OTP
router.post("/request-otp", authLimiter, requestOtpController);

// Route untuk memverifikasi kode OTP
router.post("/verify-otp", authLimiter, verifyOtpController);

export default router;
