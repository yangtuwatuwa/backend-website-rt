# 💌 Surat Cinta Arsitektur: Memahami Jalur Pipa Backend RT 🚀

Halo masbro! Wajar banget kalau di tengah-tengah project yang dikejar deadline, kita kadang kehilangan arah tentang bagaimana data mengalir di dalam aplikasi kita sendiri. Dokumen ini dibuat khusus sebagai kompas buat lu belajar arsitektur dan "pipa aliran data" dari backend website RT kita.

Mari kita bedah jalurnya dari ujung ke ujung biar lu makin jago pas lulus SMK nanti! 💪

---

## 📁 1. Struktur Folder (Peta Wilayah)

Secara umum, project kita menganut arsitektur **Layered Architecture (N-Tier)** yang membagi kode berdasarkan tanggung jawabnya (Separation of Concerns).

```
aplikasidbrt/
├── config/             # Konfigurasi eksternal (misal: koneksi database MySQL)
├── routes/             # Pintu masuk request API (routing url)
├── middlewares/        # Penjaga gerbang keamanan & validasi input (satpam)
├── controllers/        # Pengatur lalu lintas (parsing req, manggil service, kirim response HTTP)
├── services/           # Logika bisnis inti aplikasi (enkripsi, kalkulasi, dll.)
├── models/             # Modul kueri database (SQL murni)
└── utils/              # Helper utilitas umum (format response sukses/gagal, masking)
```

---

## 🌊 2. Pipa Aliran Data (Request Pipeline)

Ketika frontend menembak API (misalnya mau upload file atau update data warga), request tersebut melewati pipa berlapis sebelum akhirnya menyentuh database:

```
[ FRONTEND ] (Kirim HTTP Request)
      │
      ▼
┌──────────────┐
│  1. ROUTER   │ ---> Mencocokkan URL & Method (GET/POST/PATCH)
└──────┬───────┘
      │
      ▼
┌──────────────┐
│2. MIDDLEWARE │ ---> Mengecek JWT Token, validasi input regex, & proteksi RBAC
└──────┬───────┘
      │ (Lolos Sensor)
      ▼
┌──────────────┐
│3. CONTROLLER │ ---> Membaca req.body & req.params, validasi otorisasi kepemilikan data
└──────┬───────┘
      │
      ▼
┌──────────────┐
│ 4. SERVICE   │ ---> Menangani logika bisnis (enkripsi NIK/No HP, hashing password, logic check)
└──────┬───────┘
      │
      ▼
┌──────────────┐
│  5. MODEL    │ ---> Menyusun query SQL (INSERT, SELECT, UPDATE, DESCRIBE)
└──────┬───────┘
      │
      ▼
[  DATABASE  ] (MySQL menyimpan data)
```

---

## 🔍 3. Studi Kasus: Membedah Jalur "Update Warga" (`PATCH /resident/warga/:id`)

Biar makin paham, mari kita tracking kode asli yang baru saja kita buat untuk pembaruan data warga:

### Langkah A: Router (`routes/userAcces.js`)
Frontend menembak URL `PATCH /resident/warga/10` dengan membawa token JWT di Header dan data baru di Body.
```javascript
// Di routes/userAcces.js
router.patch("/warga/:id", jwtAuth, updateWargaDetailsController)
```
* **Peran pipa**: Mencocokkan method `PATCH` dan sub-path `/warga/:id`.
* **Pipa Pengaman**: Sebelum sampai ke controller, request wajib lewat `jwtAuth` (middleware) untuk diuraikan tokennya. Payload token disimpan ke `req.user`.

### Langkah B: Middleware Otorisasi (`middlewares/checkRole.js` & `validationJwt.js`)
JWT diverifikasi menggunakan kunci rahasia (`SECRET`). 
```javascript
// Di middlewares/validationJwt.js
req.user = decoded; // Berisi { id: 1, role: 'warga' }
next();
```
* **Peran pipa**: Memastikan token asli, belum kedaluwarsa, dan menempelkan identitas user ke request object (`req.user`).

### Langkah C: Controller (`controllers/sensitifData.js`)
Request mendarat di `updateWargaDetailsController`. Di sini, keputusan otorisasi tingkat lanjut (RBAC & Otorisasi Kepemilikan) diambil:
```javascript
// Di controllers/sensitifData.js
export async function updateWargaDetailsController(req, res) {
    const { id } = req.params; // ID Warga target (misal: 10)
    const { statusHidup, noHp } = req.body;
    
    // 1. Cek peran (RBAC)
    const userRole = req.user.role;
    if (userRole === "bendahara") {
        return res.status(403).json({ pesan: "Akses ditolak!" }); // Bendahara diblokir
    }
    
    // 2. Cek kepemilikan jika role-nya 'warga'
    if (userRole === "warga") {
        const dataUser = await getAccountById(req.user.id);
        const warga = await getWargaById(id);
        if (String(dataUser[0].family_id) !== String(warga.family_id)) {
            return res.status(403).json({ pesan: "Akses ditolak, bukan keluarga lu!" });
        }
    }
    
    // 3. Teruskan ke Service
    const hasilnya = await updateWargaService(id, { statusHidup, noHp });
    
    // 4. Kirim respon HTTP balik ke Frontend
    return responseSucces(200, hasilnya, "Data warga berhasil diperbarui!", res);
}
```
* **Peran pipa**: Sebagai otak logika HTTP. Controller tidak tahu cara menulis ke database atau mengenkripsi data; tugasnya hanya memvalidasi hak akses HTTP dan memformat respon akhir.

### Langkah D: Service (`services/inputdbwarga.js`)
Controller memanggil `updateWargaService`. Di sinilah pengolahan data mentah dilakukan:
```javascript
// Di services/inputdbwarga.js
export async function updateWargaService(id, data) {
    const fieldsToUpdate = {};
    if (data.statusHidup !== undefined) fieldsToUpdate.status_hidup = data.statusHidup;
    if (data.noHp !== undefined) fieldsToUpdate.no_hp = encryptEmails(String(data.noHp)); // Enkripsi data sensitif!
    
    // Panggil kueri SQL di Model
    const hasilnya = await updateWargaFields(id, fieldsToUpdate);
    return hasilnya;
}
```
* **Peran pipa**: Menangani sanitasi data, enkripsi data sensitif (menggunakan `encryptEmails`), dan menyiapkan payload bersih sebelum masuk ke kueri.

### Langkah E: Model (`models/inputwarganya.js`)
Service memanggil `updateWargaFields`. Lapisan ini berkomunikasi langsung dengan database menggunakan database pool:
```javascript
// Di models/inputwarganya.js
export async function updateWargaFields(id, fields) {
    const keys = Object.keys(fields);
    const setClause = keys.map(k => `${k} = ?`).join(", ");
    const values = Object.values(fields);
    values.push(id);

    const sqlcommand = `UPDATE warga SET ${setClause} WHERE id = ?`;
    const [result] = await db.execute(sqlcommand, values);
    return result;
}
```
* **Peran pipa**: Menulis sintaks SQL mentah dan mengeksekusinya di server database MySQL. Lapisan ini tidak peduli tentang otorisasi JWT atau logika enkripsi; dia hanya peduli kueri SQL-nya valid.

---

## 💡 4. Mengapa Jalurnya Harus Sepanjang Ini? (Kenapa Gak Langsung SQL di Router?)

Lu mungkin mikir: *"Kenapa gak kueri SQL-nya langsung ditaruh di routes/userAcces.js aja biar gak ribet?"*
Ini alasan pentingnya arsitektur layered (pipa):

1. **Reusability (Bisa Dipakai Ulang)**: Kalau kueri database ada di model, fungsi `getWargaById` bisa dipanggil di controller login, controller upload file, dan controller pendaftaran anggota baru sekaligus tanpa menulis ulang SQL-nya.
2. **Keamanan (Security)**: Data sensitif warga wajib dienkripsi. Dengan adanya layer Service, enkripsi dijamin konsisten dilakukan sebelum data masuk ke Model.
3. **Mudah Dites & Debug**: Kalau terjadi error data tidak masuk, kita tinggal cek kueri di layer **Model**. Kalau terjadi error salah enkripsi, kita cek layer **Service**. Kalau salah hak akses, kita cek layer **Middleware / Controller**.

---

Semoga surat cinta arsitektur ini membantu lu menguasai "jalur pipa" backend project kita ya, masbro! Kalau ada baris kode atau alur data yang masih bikin lu pusing, langsung tanyakan ke gw. Sukses terus belajarnya! 🚀🔥
