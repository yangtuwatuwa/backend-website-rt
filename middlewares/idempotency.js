// In-Memory Fast Cache for Idempotency
const memoryCache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 jam


/**
 * Idempotency Middleware untuk mencegah Double Transaction / Double Charge
 * Memeriksa header 'idempotency-key' atau 'x-idempotency-key'
 */
export function idempotencyMiddleware(options = {}) {
    return async (req, res, next) => {
        // Ambil idempotency key dari header
        const idempotencyKey = req.headers["idempotency-key"] || req.headers["x-idempotency-key"];

        // Jika tidak ada Idempotency-Key header, lanjutkan request seperti biasa
        if (!idempotencyKey) {
            return next();
        }

        const cacheKey = `idempotency:${idempotencyKey.trim()}`;
        console.log(`[Idempotency Check] Key: ${idempotencyKey}`);

        try {
            // 1. Cek dari Memory Cache
            if (memoryCache.has(cacheKey)) {
                const cachedData = memoryCache.get(cacheKey);

                if (cachedData.status === "processing") {
                    return res.status(409).json({
                        response: 409,
                        message: "Transaksi dengan Idempotency-Key ini sedang dalam proses. Harap tunggu sebentar..."
                    });
                }

                console.log(`[Idempotency HIT] Returning cached response for key: ${idempotencyKey}`);
                res.setHeader("X-Cache-Lookup", "HIT (Idempotent)");
                return res.status(cachedData.statusCode).json(cachedData.body);
            }

            // Mark status sebagai processing
            memoryCache.set(cacheKey, { status: "processing", timestamp: Date.now() });

            // Intercept res.json untuk menyimpan respons akhir
            const originalJson = res.json;
            res.json = function (body) {
                // Simpan ke cache memory
                memoryCache.set(cacheKey, {
                    status: "completed",
                    statusCode: res.statusCode,
                    body: body,
                    timestamp: Date.now()
                });

                // Set timer pembersihan memory cache
                setTimeout(() => memoryCache.delete(cacheKey), TTL_MS);

                res.setHeader("X-Cache-Lookup", "MISS (New Execution)");
                return originalJson.call(this, body);
            };

            next();
        } catch (err) {
            console.error("[Idempotency Error]:", err);
            next();
        }
    };
}

export default idempotencyMiddleware;
