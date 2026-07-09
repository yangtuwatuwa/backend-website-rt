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



export const verifyInput = (schema) => {
    return (req, res, next) => {

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