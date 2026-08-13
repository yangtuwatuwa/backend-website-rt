import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, '../config/emailConfig.json');

/**
 * Mengambil kredensial email dari config/emailConfig.json
 * Jika di file json kosong, maka fallback ke environment variable (.env)
 */
function getEmailCredentials() {
  let user = process.env.GMAIL || process.env.EMAIL_USER || '';
  let pass = process.env.APIGMAIL || process.env.EMAIL_PASS || '';
  let service = 'gmail';

  if (fs.existsSync(configPath)) {
    try {
      const rawConfig = fs.readFileSync(configPath, 'utf-8');
      const jsonConfig = JSON.parse(rawConfig);
      
      if (jsonConfig.service) {
        service = jsonConfig.service;
      }
      if (jsonConfig.auth?.user && jsonConfig.auth.user.trim() !== '') {
        user = jsonConfig.auth.user;
      }
      if (jsonConfig.auth?.pass && jsonConfig.auth.pass.trim() !== '') {
        pass = jsonConfig.auth.pass;
      }
    } catch (e) {
      console.warn("Gagal membaca emailConfig.json, menggunakan environment variable:", e.message);
    }
  }

  return { service, user, pass };
}

function getTransporter() {
  const { service, user, pass } = getEmailCredentials();

  if (!user || !pass) {
    throw new Error("Kredensial email belum diisi! Silakan isi 'GMAIL' & 'APIGMAIL' di .env atau di config/emailConfig.json.");
  }

  return nodemailer.createTransport({
    service: service || 'gmail',
    auth: {
      user: user,
      pass: pass
    }
  });
}

/**
 * Mengirim email berisi kode OTP ke user
 * @param {string} toEmail - Email penerima
 * @param {string} otpCode - Kode OTP 6 digit
 */
export async function sendOtpEmail(toEmail, otpCode) {
  if (!toEmail) {
    throw new Error("Email penerima (toEmail) tidak boleh kosong.");
  }
  if (!otpCode) {
    throw new Error("Kode OTP (otpCode) tidak boleh kosong.");
  }

  const transporter = getTransporter();
  const { user } = getEmailCredentials();

  const mailOptions = {
    from: `"Verifikasi OTP" <${user}>`,
    to: toEmail,
    subject: 'Kode Verifikasi OTP Anda',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; max-width: 500px; margin: 0 auto; background-color: #ffffff;">
        <h2 style="color: #333333; text-align: center;">Kode Verifikasi OTP</h2>
        <p style="color: #555555; font-size: 14px;">Gunakan kode OTP di bawah ini untuk melanjutkan proses verifikasi Anda. Kode ini hanya berlaku selama <strong>5 menit</strong>.</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #2b6cb0; text-align: center; margin: 25px 0; background: #edf2f7; padding: 15px; border-radius: 6px;">
          ${otpCode}
        </div>
        <p style="color: #888888; font-size: 12px; text-align: center;">Jika Anda tidak meminta kode ini, silakan abaikan email ini.</p>
      </div>
    `
  };

  return await transporter.sendMail(mailOptions);
}