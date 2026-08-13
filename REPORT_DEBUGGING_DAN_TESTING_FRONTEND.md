# 📘 LAPORAN DEBUGGING BACKEND & PANDUAN INTEGRASI FRONTEND

Dokumen ini berisi rangkuman hasil debugging, perbaikan alur backend, serta spesifikasi lengkap **Request & Response API Payload** untuk seluruh modul fitur di sistem website RT (`backend-website-rt`).

---

## 🔑 1. Ketentuan Umum Autentikasi API
Seluruh endpoint berproteksi memerlukan Header HTTP berikut:
```http
Authorization: Bearer <TOKEN_JWT>
```

---

## ⚡ 2. Panduan Alur Pendaftaran Rumah, KK & Warga (Kependudukan)

Backend mendukung dua metode pendaftaran agar fleksibel dengan desain UI Frontend:

### A. Alur Sekuensial / Bertahap (3 Langkah)
1. **Langkah 1 (Tambah Rumah)**: `POST /admin/house`  
   Returns `insertId` $\rightarrow$ simpan sebagai `house_id`.
2. **Langkah 2 (Tambah KK)**: `POST /admin/resident`  
   Body: `{"noKK": "3201...", "house_id": 1}`.  
   Backend otomatis mengatur `kepala_keluarga_id = NULL` untuk menghindari error Foreign Key saat database kosong.  
   Returns `insertId` $\rightarrow$ simpan sebagai `family_id`.
3. **Langkah 3 (Tambah Warga)**: `POST /admin/datawarga`  
   Body: `{"nik": "3201...", "nama": "Budi", "jenisKelamin": "L", "tglLahir": "1990-01-01", "statusHidup": "Hidup", "noHp": "0812...", "umur": 34, "family_id": 1, "house_id": 1}`.  
   Backend otomatis menjadikan warga pertama di KK tersebut sebagai **Kepala Keluarga** (`UPDATE family SET kepala_keluarga_id = citizen_id`).

### B. Alur Instant / 1-Step Registration
- **Route**: `POST /admin/register-family`
- **Request Body**:
  ```json
  {
    "house": {
      "blok": "A",
      "nomor": "12",
      "alamat": "Jl. Mawar No. 12",
      "status": "tetap"
    },
    "family": {
      "noKK": "3201234567890001"
    },
    "kepalaKeluarga": {
      "nik": "3201234567890002",
      "nama": "Budi Santoso",
      "jenisKelamin": "L",
      "tglLahir": "1985-05-15",
      "statusHidup": "Hidup",
      "noHp": "081234567890",
      "umur": 39
    }
  }
  ```
- **Response**: Menjalankan transaksi otomatis untuk Rumah, KK, Warga, serta membuatkan Akun Login Warga secara instan.

---

## 📋 3. DOKUMENTASI REQUEST & RESPONSE PAYLOAD PER MODUL FITUR

---

### 1️⃣ Modul Autentikasi & Akun

#### A. Login User
- **Route**: `POST /post/login`
- **Request Body**:
  ```json
  {
    "username": "rt_admin",
    "password": "password123"
  }
  ```
- **Response 200 OK**:
  ```json
  {
    "status": "login berhasil",
    "user": {
      "id": 1,
      "username": "rt_admin",
      "email": "rt@example.com",
      "role": "rt",
      "family_id": null
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5..."
  }
  ```

#### B. Registrasi Akun Mandiri
- **Route**: `POST /post/register` (atau `POST /post/debug-regist`)
- **Request Body**:
  ```json
  {
    "username": "warga_budi",
    "password": "password123",
    "email": "budi@example.com",
    "role": "warga"
  }
  ```
- **Response 201 Created**:
  ```json
  {
    "response": 201,
    "message": "register berhasil"
  }
  ```

#### C. Lihat & Edit Profil Akun Mandiri
- **Route**: `GET /resident/my-account` (atau `GET /resident/profile`)
- **Route Edit**: `PATCH /resident/my-account` (Body: `{"username": "budi_new", "email": "budi_new@example.com"}`)
- **Response 200 OK**: Mengembalikan profil akun dan status keterikatan KK (`hasAccount`, `family_id`).

#### D. Ubah Password
- **Route**: `PATCH /resident/password`
- **Request Body**: `{"currentPassword": "oldpass", "newPassword": "newpassword123"}`

#### E. Buat Akun Warga Baru dari KK (Admin RT)
- **Route**: `POST /admin/create-account`
- **Request Body**: `{"familyId": 1}`
- **Response 200 OK**: Mengembalikan `username` dan `temporaryPassword`.

#### F. Buat Akun Staff (Sekretaris / Bendahara)
- **Route**: `POST /admin/create-staff-account`
- **Request Body**: `{"username": "sekretaris1", "password": "password123", "email": "sek@gmail.com", "role": "sekretaris"}`

#### G. Edit Akun Login Warga (Admin RT / Sekretaris)
- **Route**: `PATCH /admin/account/:id` (atau `PATCH /admin/account/family/:familyId` / `PATCH /admin/account-warga/:familyId`)
- **Headers**: `Authorization: Bearer <token_rt_atau_sekretaris>`
- **Request Body**:
  ```json
  {
    "username": "keluarga1",
    "email": "warga@domain.com",
    "password": "passwordBaru123"
  }
  ```
  *(Catatan: Menerima `username`, `email`, dan `password` / `newPassword`. Jika password dikosongkan, password lama tidak berubah)*
- **Response 200 OK**:
  ```json
  {
    "response": 200,
    "output": {
      "id": 5,
      "username": "keluarga1",
      "email": "warga@domain.com",
      "role": "warga",
      "familyId": 1
    },
    "message": "Akun warga berhasil diperbarui oleh admin!"
#### H. Verifikasi Pendaftaran Warga Mandiri (Admin RT / Sekretaris)
- **Tampilkan Daftar Warga Pending**: `GET /admin/pending-warga` (atau `GET /admin/warga/pending`)
  - **Headers**: `Authorization: Bearer <token_rt_atau_sekretaris>`
  - **Response 200 OK**:
    ```json
    [
      {
        "warga_id": 12,
        "nama": "Bagas Aditya Utama",
        "jenis_kelamin": "L",
        "umur": 28,
        "nik": "3276051508980004",
        "family_id": 1,
        "family_nokk": "3276051010180007",
        "house_blok": "B4",
        "house_nomor": "15",
        "house_alamat": "Jl. Sawangan Green Park Blok B4 No. 15",
        "status": "pending",
        "ktp_document_id": 5,
        "ktp_url": "/resident/sensitifdata/file/5",
        "has_ktp": true
      }
    ]
    ```

- **Aksi Setujui / Tolak Warga**:
  - **Route**: `PATCH /admin/pending-warga/:id` (atau `PATCH /admin/verify-warga/:id`)
  - **Request Body**: `{"status": "diterima"}` *(Setujui)* atau `{"status": "ditolak"}` *(Tolak)*
  - **Response 200 OK**: `{"response": 200, "message": "verifikasi status warga berhasil diupdate"}`

- **Tombol [Lihat KTP] (Akses Aman Gambar KTP)**:
  - **Route**: `GET /admin/sensitifdata/file/:ktp_document_id` (atau `GET /admin/warga/:warga_id/ktp`)
  - **Headers**: `Authorization: Bearer <token_rt_atau_sekretaris>`
  - **Response**: Langsung menyajikan file berkas foto KTP dari penampungan folder aman (`./secure_uploads`).

---


### 2️⃣ Modul Pengaduan Warga

#### A. Kirim Pengaduan Warga
- **Route**: `POST /resident/pengaduan`
- **Request Body**:
  ```json
  {
    "jenis_pengaduan": "Fasilitas",
    "isi": "Lampu jalan di Blok A mati total"
  }
  ```

#### B. Review Pengaduan (Admin RT/Sekretaris)
- **Route**: `GET /admin/pengaduan`
- **Response 200 OK**: Array daftar pengaduan warga beserta `no_kk`.

#### C. Update Status & Catatan Tindak Lanjut RT
- **Route**: `PATCH /admin/pengaduan/:id`
- **Request Body**:
  ```json
  {
    "status": "Proses",
    "catatan": "Petugas RT telah memanggil teknisi PLN"
  }
  ```
  *(Status diterima: `"Proses"`, `"Selesai"`, `"pending"`, `"disetujui"`, `"ditolak"`. Catatan juga menerima alias `catatan_tindak_lanjut` atau `tindak_lanjut`)*

#### D. Hapus Pengaduan
- **Route**: `DELETE /admin/pengaduan/:id`
- **Response 200 OK**: `{"response": 200, "message": "laporan pengaduan berhasil dihapus"}`

---

### 3️⃣ Modul Keuangan RT (IPL, Kas & Pengeluaran)

#### A. Pembayaran IPL Mandiri Warga
- **Route**: `POST /resident/pay-ipl`
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `months`: `[1, 2]` *(stringified JSON / array)*
  - `year`: `2026`
  - `amount`: `400000`
  - `file`: `[File Transfer JPG/PNG/PDF]` *(Max 5MB)*

#### B. Pembayaran Kas RT Mandiri Warga
- **Route**: `POST /resident/pay-kas`
- **Content-Type**: `multipart/form-data`
- **Form Data**: `amount=50000`, `category="kematian"`, `description="Iuran duka"`, `file=[Bukti]`

#### C. Approve / Tolak Pembayaran IPL (Bendahara)
- **Route**: `PATCH /admin/finance/approve-ipl/:id`
- **Request Body**: `{"status": "diterima"}`
- **Hasil**: Jika disetujui, backend otomatis mencatat pemasukan IPL ke Buku Kas (`financial_ledger`).

#### D. Catat Pengeluaran Kas RT (+ Upload Struk)
- **Route**: `POST /admin/finance/expense`
- **Content-Type**: `multipart/form-data`
- **Form Data**:
  - `amount`: `150000`
  - `sourceType`: `kebersihan` *(kebersihan, keamanan, taman, operasional_rt, kematian, sosial, kegiatan, lainnya)*
  - `description`: `Pembelian perlengkapan sapu dan tempat sampah`
  - `file`: `[File Foto Struk Nota]` *(Max 5MB, opsional)*
- **Response 200 OK**:
  ```json
  {
    "response": 200,
    "output": { "insertId": 15 },
    "message": "Pengeluaran kas RT berhasil dicatat cuy!"
  }
  ```

#### E. Laporan Rekapitulasi Arus Kas Bulanan
- **Route**: `GET /admin/finance/summary?year=2026`
- **Response 200 OK**:
  ```json
  {
    "response": 200,
    "output": {
      "year": 2026,
      "previous_balance": 5000000,
      "total_income": 12500000,
      "total_expense": 3200000,
      "monthly_breakdown": [
        {
          "month": 8,
          "year": 2026,
          "total_income": "4500000",
          "total_expense": "1200000"
        }
      ]
    },
    "message": "Rekapitulasi arus kas bulanan berhasil diambil masbro"
  }
  ```

#### F. Tracking Tunggakan Warga Bulanan
- **Route**: `GET /admin/finance/tracking?month=8&year=2026`
- **Response 200 OK**: Mengembalikan status ketepatan waktu & pembayaran per KK (`Lunas`, `Nunggak`, `Pending Verifikasi`).

#### G. Terbitkan Tagihan IPL Periode (Batch Bill Generation oleh Bendahara)
- **Route**: `POST /admin/finance/generate-bills`
- **Headers**: `Authorization: Bearer <token_rt_atau_bendahara>`
- **Request Body**:
  ```json
  {
    "title": "IPL 2027",
    "nominal": 200000,
    "startMonth": 1,
    "startYear": 2027,
    "endMonth": 12,
    "endYear": 2027
  }
  ```
- **Response 201 Created**:
  ```json
  {
    "response": 201,
    "output": {
      "title": "IPL 2027",
      "amount_per_month": 200000,
      "total_families": 125,
      "total_months": 12,
      "total_bills_generated": 1500,
      "start_month": 1,
      "start_year": 2027,
      "end_month": 12,
      "end_year": 2027,
      "message": "Tagihan IPL periode 1/2027 - 12/2027 berhasil diterbitkan untuk 125 KK!"
    },
#### H. Idempotency Key Header & Future-Proof Payment Gateway
- **Header Tambahan (Opsional/Sangat Direkomendasikan)**:
  ```http
  Idempotency-Key: c9b3a0e1-7d24-4f81-8a9d-123456789abc
  ```
  *(Dipasang pada `POST /resident/pay-ipl`, `POST /resident/pay-kas`, `POST /admin/finance/manual-payment` untuk mencegah transaksi ganda saat sinyal lemot).*

- **Checkout Payment Gateway (Midtrans / Xendit / Sandbox Mode)**:
  - **Route**: `POST /resident/payment-gateway/checkout`
  - **Headers**: `Authorization: Bearer <token_warga>`, `Idempotency-Key: <uuid>`
  - **Request Body**: `{"amount": 200000, "paymentType": "ipl", "months": [8], "year": 2026}`
  - **Response 201 Created**:
    ```json
    {
      "response": 201,
      "output": {
        "orderId": "RT-IPL-17208888-123",
        "amount": 200000,
        "gatewayProvider": "sandbox_mock",
        "snapToken": "MOCK-SNAP-17208888",
        "paymentUrl": "http://localhost:5173/mock-payment?order_id=RT-IPL-17208888-123&amount=200000",
        "qrCodeUrl": "https://api.qrserver.com/v1/create-qr-code/?size=250x250..."
      },
      "message": "Sesi pembayaran Payment Gateway berhasil dibuat!"
    }
    ```

- **Webhook Callback Payment Gateway**:
  - **Route**: `POST /post/payment-webhook`
  - **Request Body**: `{"order_id": "RT-IPL-17208888-123", "transaction_status": "settlement", "gross_amount": 200000}`
  - **Efek Backend**: Otomatis mengubah status iuran warga di DB menjadi **`diterima (Lunas)`** dan mencatat transaksi ke Buku Kas (`financial_ledger`).

---



### 4️⃣ Modul Voting Petugas Terbaik (Karyawan)

#### A. Lihat Daftar Kandidat Petugas
- **Route**: `GET /resident/karyawan`

#### B. Kirim Vote
- **Route**: `POST /resident/vote`
- **Request Body**: `{"karyawanId": 2}`
- **Ketentuan**: Dibatasi 1 Vote per Akun Warga.

#### C. Hasil Perhitungan Vote Realtime
- **Route**: `GET /resident/vote/results`

#### D. Tambah Kandidat Petugas Baru (Admin)
- **Route**: `POST /admin/karyawan`
- **Payload**: `{"nama": "Budi Santoso", "jabatan": "Petugas Ronda Malam", "deskripsi": "Rajin dan siaga"}` *(Mendukung foto)*

#### E. Hapus Kandidat Petugas (Admin)
- **Route**: `DELETE /admin/karyawan/:id`
- **Response 200 OK**: `{"response": 200, "message": "Kandidat karyawan berhasil dihapus!"}`

---

### 5️⃣ Modul Pengumuman & Agenda RT

#### A. Tambah Pengumuman Publik
- **Route**: `POST /admin/announcement`
- **Request Body**: `{"judul": "Kerja Bakti", "isi": "Pembersihan selokan blok A"}` *(Mendukung alias `title` & `content`)*

#### B. Hapus Pengumuman
- **Route**: `DELETE /admin/announcement/:id`

#### C. Tambah Agenda Kegiatan Warga
- **Route**: `POST /admin/agenda`
- **Request Body**:
  ```json
  {
    "kategori": "Kegiatan Warga",
    "judul": "Rapat RT Bulanan",
    "deskripsi": "Pembahasan kas dan persiapan 17an",
    "tanggal": "2026-08-20",
    "waktu": "19:30:00",
    "tempat": "Balai Warga"
  }
  ```

#### D. Hapus Agenda Kegiatan
- **Route**: `DELETE /admin/agenda/:id`

---

### 6️⃣ Modul Keamanan Audit Log & Berkas Sensitif

#### A. Audit Log Akses & Login Keamanan
- **Route**: `GET /admin/access-logs?limit=100`
- **Response 200 OK**:
  ```json
  {
    "response": 200,
    "output": [
      {
        "id": 1,
        "username": "rt_admin",
        "event_type": "LOGIN_SUCCESS",
        "ip_address": "192.168.1.10",
        "user_agent": "Mozilla/5.0...",
        "status": "success",
        "details": "Role: rt",
        "created_at": "2026-08-10T08:24:26.000Z"
      }
    ],
    "message": "Riwayat log akses keamanan berhasil diambil masbro"
  }
  ```

#### B. Upload Dokumen Sensitif Warga
- **Route**: `POST /resident/uploadsensitifdata/:id`
- **Content-Type**: `multipart/form-data`
- **Form Data**: `type="ktp"`, `file=[Berkas]` *(Max 5MB)*

#### C. Unduh Dokumen Sensitif
- **Route**: `GET /resident/sensitifdata/file/:document_id`

#### D. Hapus Dokumen Sensitif
- **Route**: `DELETE /resident/sensitifdata/:id` (atau `DELETE /admin/resident/sensitifdata/:id`)
- **Response 200 OK**: `{"response": 200, "message": "Dokumen kependudukan terunggah berhasil dihapus!"}` *(Backend menghapus data di DB dan berkas fisik di folder `./secure_uploads`)*

---

## 🛠️ 4. RESET & CLEAR DATABASE UNTUK TESTING (DEV MODE)

Jika tim frontend ingin mengosongkan seluruh isi data pengujian untuk pengetesan dari nol, jalankan script ini di terminal backend:

```bash
npm run reset-db
```
 Script akan mengosongkan seluruh 20 tabel database tanpa merusak Foreign Key constraint dan otomatis menginisialisasi ulang record dasar `financial_settings`.
