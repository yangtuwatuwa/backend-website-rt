import { requestInterceptor } from "jsdom";
import z from "zod";

export const regex = z.object({
     username:z.string().min(3),
     password:z.string().min(8),
     email: z.email(),
     role: z.string()
    })

 export const residentSchema = z.object({
     noKK: z.string().min(5, "No KK minimal 5 karakter"),
     home: z.coerce.number().int().positive("ID Rumah harus berupa angka positif"),
     KepalaKeluarga: z.coerce.number().int().positive("ID Kepala Keluarga harus berupa angka positif")
 })

 export const updateResidentSchema = z.object({
     noKK: z.string().min(5, "No KK minimal 5 karakter")
 })

 export const announcementSchema = z.object({
     judul: z.string().min(1, "Judul tidak boleh kosong").max(50, "Judul maksimal 50 karakter"),
     isi: z.string().min(1, "Isi tidak boleh kosong").max(1000, "Isi maksimal 1000 karakter")
 })

export const updateAnnouncementSchema = z.object({
     judul: z.string().min(1, "Judul tidak boleh kosong").max(50, "Judul maksimal 50 karakter").optional(),
     isi: z.string().min(1, "Isi tidak boleh kosong").max(1000, "Isi maksimal 1000 karakter").optional()
 })

const isCalendarDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return year >= 1000
        && parsed.getUTCFullYear() === year
        && parsed.getUTCMonth() + 1 === month
        && parsed.getUTCDate() === day;
};

const tanggalRapatSchema = z.string()
    .trim()
    .refine(isCalendarDate, "tanggal_rapat wajib berupa tanggal kalender YYYY-MM-DD yang valid");

export const notulenRapatSchema = z.object({
    tanggal_rapat: tanggalRapatSchema,
    topik: z.string().trim().min(1, "Topik tidak boleh kosong").max(200, "Topik maksimal 200 karakter"),
    hasil_keputusan: z.string().trim().min(1, "Hasil keputusan tidak boleh kosong").max(200, "Hasil keputusan maksimal 200 karakter"),
});

export const updateNotulenRapatSchema = z.object({
    tanggal_rapat: tanggalRapatSchema.optional(),
    topik: z.string().trim().min(1, "Topik tidak boleh kosong").max(200, "Topik maksimal 200 karakter").optional(),
    hasil_keputusan: z.string().trim().min(1, "Hasil keputusan tidak boleh kosong").max(200, "Hasil keputusan maksimal 200 karakter").optional(),
}).refine((value) => Object.keys(value).length > 0, "Minimal satu field harus diperbarui");




export const verifyInput = (schema) => {
    return (req, res, next) => {
        if (req.body) {
            if (!req.body.judul && req.body.title) req.body.judul = req.body.title
            if (!req.body.isi && req.body.content) req.body.isi = req.body.content
            if (!req.body.deskripsi && req.body.description) req.body.deskripsi = req.body.description
        }

        const result = schema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                errors: result.error.issues
            });
        }

        req.body = result.data;

        next();
    };
};
