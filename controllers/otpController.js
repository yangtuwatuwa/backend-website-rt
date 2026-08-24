import { requestOtpService, verifyOtpService } from "../services/otpService.js";

/**
 * Controller untuk meminta pengiriman kode OTP ke email
 * Endpoint: POST /auth/request-otp
 */
export async function requestOtpController(req, res) {
  const { userId, email, purpose } = req.body;
  const targetPurpose = purpose || 'VERIFICATION';

  console.log(`[Request OTP] userId: ${userId}, email: ${email}, purpose: ${targetPurpose}`);

  if (!userId || !email) {
    console.log('[Error Request OTP] userId atau email tidak diisi');
    return res.status(400).json({ 
      success: false, 
      pesan: "userId dan email wajib diisi!" 
    });
  }

  try {
    const result = await requestOtpService(userId, email, targetPurpose);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        pesan: result.message
      });
    }
    return res.status(200).json({
      success: true,
      pesan: result.message
    });
  } catch (err) {
    console.error(`[Error Request OTP]:`, err);
    return res.status(500).json({ 
      success: false, 
      pesan: "Gagal mengirim OTP: " + (err.message || err) 
    });
  }
}

/**
 * Controller untuk memverifikasi kode OTP yang diinputkan user
 * Endpoint: POST /auth/verify-otp
 */
export async function verifyOtpController(req, res) {
  const { userId, otp, otpCode, purpose } = req.body;
  const inputOtp = otp || otpCode;
  const targetPurpose = purpose || 'VERIFICATION';

  console.log(`[Verify OTP] userId: ${userId}, inputOtp: ${inputOtp}, purpose: ${targetPurpose}`);

  if (!userId || !inputOtp) {
    console.log('[Error Verify OTP] userId atau kode OTP tidak diisi');
    return res.status(400).json({ 
      success: false, 
      pesan: "userId dan kode OTP wajib diisi!" 
    });
  }

  try {
    const result = await verifyOtpService(userId, inputOtp, targetPurpose);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        pesan: result.message
      });
    }

    return res.status(200).json({
      success: true,
      pesan: result.message
    });
  } catch (err) {
    console.error(`[Error Verify OTP]:`, err);
    return res.status(500).json({ 
      success: false, 
      pesan: "Gagal memverifikasi OTP: " + (err.message || err) 
    });
  }
}
