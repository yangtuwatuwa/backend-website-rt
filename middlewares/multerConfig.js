import multer from "multer"
import path from "path"
import fs from "fs"

// Konfigurasi tempat penyimpanan dan penamaan file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = "./secure_uploads"
        // Selalu pastikan folder ada demi keamanan runtime
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }
        cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9)
        const ext = path.extname(file.originalname).toLowerCase()
        cb(null, file.fieldname + "-" + uniqueSuffix + ext)
    }
})

// Filter format file yang diperbolehkan (hanya jpeg, jpg, png, pdf)
const fileFilter = (req, file, cb) => {
    const allowedExtensions = [".jpg", ".jpeg", ".png", ".pdf"]
    const ext = path.extname(file.originalname).toLowerCase()

    if (allowedExtensions.includes(ext)) {
        cb(null, true)
    } else {
        cb(new Error("Format file tidak didukung masbro! Cuma boleh JPG, JPEG, PNG, dan PDF."), false)
    }
}

// Batas ukuran file 5MB
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5 Megabytes
    }
})

// Middleware wrapper untuk menangkap error dari multer secara rapi
export const uploadSensitifMiddleware = (req, res, next) => {
    const singleUpload = upload.single("file")

    singleUpload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({ pesan: "File kegedean masbro, maksimal cuma boleh 5MB!" })
            }
            return res.status(400).json({ pesan: "Terjadi error pas upload file: " + err.message })
        } else if (err) {
            return res.status(400).json({ pesan: err.message })
        }
        next()
    })
}

// Konfigurasi tempat penyimpanan dan penamaan file template
const templateStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = "./uploads/templates"
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }
        cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9)
        const ext = path.extname(file.originalname).toLowerCase()
        cb(null, "template-" + uniqueSuffix + ext)
    }
})

const templateFileFilter = (req, file, cb) => {
    const allowedExtensions = [".pdf", ".doc", ".docx", ".xls", ".xlsx"]
    const ext = path.extname(file.originalname).toLowerCase()

    if (allowedExtensions.includes(ext)) {
        cb(null, true)
    } else {
        cb(new Error("Format file template tidak didukung masbro! Cuma boleh PDF, DOC, DOCX, XLS, atau XLSX."), false)
    }
}

const templateUpload = multer({
    storage: templateStorage,
    fileFilter: templateFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 Megabytes
    }
})

export const uploadTemplateMiddleware = (req, res, next) => {
    const singleUpload = templateUpload.single("file")

    singleUpload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({ pesan: "File template kegedean masbro, maksimal cuma boleh 10MB!" })
            }
            return res.status(400).json({ pesan: "Terjadi error pas upload file template: " + err.message })
        } else if (err) {
            return res.status(400).json({ pesan: err.message })
        }
        next()
    })
}
