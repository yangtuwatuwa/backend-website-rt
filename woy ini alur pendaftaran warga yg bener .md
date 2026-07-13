# 📢 WOY! INI ALUR PENDAFTARAN WARGA YANG BENER! (PENTING COK ⚠️)

> *"Satu rumah itu bisa diisi satu keluarga. Satu keluarga isinya bisa banyak orang. Jangan tiap daftarin satu orang, lu bikinin rumah baru sama KK baru! Emang warga kita jomblo tajir melintir semua apa? 😭"*

---

## 🧐 LOGIKA DASAR DATABASE KITA

Biar gak salah paham, ini struktur hubungan data kita di database:
- **1 Rumah (`house`)** ➔ Ditempati **1 Keluarga (`family/KK`)**
- **1 Keluarga (`family/KK`)** ➔ Isinya **Banyak Warga (`warga`)**

---

## 🛠️ SKENARIO PENDAFTARAN YANG BENAR

Frontend **HARUS** membagi pendaftaran warga menjadi **3 Skenario** ini di UI/UX:

### SKENARIO A: RT Mendaftarkan Anggota Keluarga Baru (KK-nya sudah terdaftar)
> **Contoh:** RT mau daftarin anak baru lahir, atau istri yang baru pindah gabung KK suami yang sudah terdaftar di sistem.

* **Langkah Frontend:**
  1. **JANGAN** panggil `POST /admin/house` ❌
  2. **JANGAN** panggil `POST /admin/resident` ❌
  3. **LANGSUNG TEMBAK** ➔ `POST /admin/datawarga` (Role Admin) ✅
     * Kirim parameter `fammilyId` dan `houseId` dari KK yang sudah terdaftar (RT tinggal pilih nama kepala keluarga dari dropdown di UI).
     * Status warga ini otomatis langsung **diterima** (aktif).

---

### SKENARIO B: RT Mendaftarkan Keluarga Baru (KK Baru & Rumah Baru)
> **Contoh:** Ada satu keluarga baru yang baru pindah ke lingkungan RT kita.

* **Langkah Frontend (Harus Sekuensial):**
  1. Tembak **`POST /admin/house`** untuk daftarin rumah baru mereka ➔ Dapetin `house_id` (dari `insertId`).
  2. Tembak **`POST /admin/resident`** untuk daftarin Kartu Keluarga baru ➔ Masukin `home: <house_id>` dari step 1. Dapetin `family_id` (dari `insertId`).
  3. Tembak **`POST /admin/datawarga`** untuk daftarin Kepala Keluarga ➔ Masukin `fammilyId: <family_id>` dan `houseId: <house_id>`.
  4. Untuk anggota keluarga lainnya (istri/anak), daftarkan menggunakan **SKENARIO A** di atas (langsung tembak `POST /admin/datawarga` pakai ID yang sama).

---

### SKENARIO C: Warga Mendaftarkan Anggota Keluarganya Sendiri (Mandiri) 🌟
> **Contoh:** Akun warga login ke website, lalu mendaftarkan anggota keluarga barunya secara mandiri.

* **Langkah Frontend:**
  1. **LANGSUNG TEMBAK** ➔ **`POST /resident/datawarga`** (Role Warga) ✅
  2. **JANGAN** kirim `fammilyId` dan `houseId` di request body! ❌ Server otomatis mengambil data KK warga yang sedang login demi keamanan.
  3. Data warga yang dikirim berstatus **pending** (menunggu verifikasi RT). Warga baru ini **tidak akan langsung muncul** di list anggota keluarga (`GET /resident/getmyfamily/:id`) sebelum RT menyetujuinya di dashboard RT.

---

## ❗ REQUEST BODY & PARAMETER

### 1. RT Menambahkan Warga (`POST /admin/datawarga`)
```json
{
  "nik": "3201234501010002",
  "nama": "Ahmad Subarjo",
  "jenisKelamin": "Laki-laki",
  "tglLahir": "1994-05-12",
  "statusHidup": "Hidup",
  "noHp": "081298765432",
  "umur": 30,
  "fammilyId": 5, // ⚠️ AWAS TYPO! Pake double 'm' (fammilyId)
  "houseId": 3
}
```

### 2. Warga Menambahkan Anggota Keluarga Mandiri (`POST /resident/datawarga`)
```json
{
  "nik": "3201234567890012",
  "nama": "Siti Aminah",
  "jenisKelamin": "Perempuan",
  "tglLahir": "1998-07-20",
  "statusHidup": "Hidup",
  "noHp": "08122334455",
  "umur": 28
}
```

---

*Silakan dipahami ya tim frontend kesayangan backend. Biar database kita gak jebol gara-gara kebanyakan rumah fiktif wkwkwk! 🚀🔥*
