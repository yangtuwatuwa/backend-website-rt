/**
 * ageCalculator.js
 * Helper untuk menghitung umur secara presisi dan realtime berdasarkan tanggal lahir (tgl_lahir).
 * 
 * Scalable & Future-Proof:
 * - Tidak perlu DB UPDATE berulang-ulang
 * - Mampu memparsing berbagai format tanggal ("YYYY-MM-DD", "DD-MM-YYYY", "YYYY/MM/DD", ISO)
 * - Selalu mengembalikan umur akurat di hari ulang tahunnya
 */

/**
 * Hitung umur presisi dari string tanggal lahir.
 * 
 * @param {string|Date} tglLahir - Tanggal lahir (plain text ter-decrypt)
 * @param {number|null} fallbackAge - Umur default dari DB jika tglLahir gagal di-parse
 * @returns {number|null} Umur realtime dalam angka
 */
export function calculateAge(tglLahir, fallbackAge = null) {
    if (!tglLahir) return fallbackAge;

    if (typeof tglLahir === "number") return tglLahir;

    let birthDate = null;
    const str = String(tglLahir).trim();

    // Format DD-MM-YYYY atau DD/MM/YYYY
    if (/^\d{1,2}[-\/]\d{1,2}[-\/]\d{4}$/.test(str)) {
        const parts = str.split(/[-\/]/);
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        birthDate = new Date(year, month, day);
    } else {
        birthDate = new Date(str);
    }

    if (!birthDate || isNaN(birthDate.getTime())) {
        return fallbackAge !== null ? Number(fallbackAge) : null;
    }

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age >= 0 ? age : (fallbackAge !== null ? Number(fallbackAge) : 0);
}
