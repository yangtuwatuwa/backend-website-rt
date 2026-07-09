import rateLimit from "express-rate-limit";

// Rate limiter umum untuk seluruh request ke API
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    limit: 200, // Batasi 200 request per IP per 15 menit
    message: {
        pesan: "Woylah santai masbro, terlalu banyak request! Coba lagi nanti."
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

// Rate limiter ketat khusus login, register, dan verifikasi password (Sudo)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    limit: 10, // Batasi 10 request per IP per 15 menit
    message: {
        pesan: "Mencurigakan cuy, kebanyakan coba. Coba lagi dalam 15 menit."
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});
