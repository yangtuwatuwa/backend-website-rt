import { requestInterceptor } from "jsdom";
import z from "zod";


   
 export  const regex = z.object({
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