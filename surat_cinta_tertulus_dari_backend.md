# 💌 Surat Cinta Tertulus Dari Backend (API Integration Guide)

Dokumentasi API lengkap, terstruktur, dan siap pakai untuk integrasi Frontend.

---

## 🌐 1. Konfigurasi Dasar

* **Base URL:** `http://172.20.32.62:3333`
* **Global Headers:**
  * `Content-Type: application/json`
  * `Authorization: Bearer <token_jwt>` (Untuk semua endpoint yang membutuhkan autentikasi)
* **Aturan Rate Limiting:**
  * Route Login, Register, & Verifikasi Password: Maksimal **10 request per 15 menit**.
  * Route API Lainnya: Maksimal **200 request per 15 menit**.

---

## 🔐 2. Autentikasi & Debug Akun

### A. Login User (Semua Role)
* **Method & Route:** `POST /post/login`
* **Request Body:**
  ```json
  {
    "username": "admin_rt",
    "password": "PasswordRT123!"
  }
  ```
* **Response Skenario 1 (Login Sukses Biasa):**
  ```json
  {
    "status": "login berhasil",
    "user": {
      "id": 1,
      "username": "admin_rt",
      "role": "rt",
      "family_id": null,
      "must_change_password": 0
    },
    "token": "eyJhbGciOi..."
  }
  ```
* **Response Skenario 2 (Login Warga Baru - Wajib Ganti Password):**
  ```json
  {
    "status": "must_change_password",
    "user": {
      "id": 12,
      "username": "keluarga_5",
      "role": "warga",
      "family_id": 5,
      "must_change_password": 1
    },
    "token": "eyJhbGciOi..."
  }
  ```
  > ⚠️ **Tindakan Frontend:** Jika statusnya `"must_change_password"`, simpan token sementara, lalu paksa user menuju ke halaman **Ganti Password**.

---

### B. Pembuatan Akun RT Dummy (Debug Only)
* **Method & Route:** `POST /post/debug-regist-rt`
* **Request Body:**
  ```json
  {
    "username": "rt_dummy",
    "password": "PasswordRT123!",
    "email": "rtdummy@gmail.com"
  }
  ```
* **Response Sukses (200):**
  ```json
  {
    "fieldCount": 0,
    "affectedRows": 1,
    "insertId": 2
  }
  ```

---

## 🛠️ 3. Alur Pengelolaan Data RT (Khusus Role: `rt`)

> [!IMPORTANT]
> ⚠️ **LOGIKA RELASI DATA (WAJIB DIPAHAMI FRONTEND!)** ⚠️
>
> Relasi data di database kita adalah: **Satu Rumah (`house`)** ditempati **Satu Keluarga (`family/KK`)**, dan **Satu Keluarga (`family/KK`)** berisi **Banyak Warga (`warga`)**.
>
> Saat ini terjadi bug di frontend di mana frontend memanggil `POST /admin/house` dan `POST /admin/resident` **tiap kali mendaftarkan satu individu warga**. Ini salah, karena membuat setiap warga seolah-olah jomblo yang punya rumah dan KK sendiri-sendiri!
>
> **Cara Kerja yang Benar:**
> 1. **Jika mendaftarkan warga ke dalam Keluarga yang SUDAH ADA (Anggota Keluarga Baru):**
>    - **JANGAN** buat Rumah baru (`POST /admin/house`) dan **JANGAN** buat KK baru (`POST /admin/resident`)!
>    - Langsung tembak **`POST /admin/datawarga`** menggunakan `fammilyId` dan `houseId` dari keluarga/KK yang bersangkutan (ambil dari dropdown list keluarga yang sudah ada).
> 2. **Jika mendaftarkan Keluarga yang BENAR-BENAR BARU (KK Baru & Rumah Baru):**
>    - Baru jalankan alur lengkap secara sekuensial:
>      `POST /admin/house` (Dapatkan `house_id`) ➔ `POST /admin/resident` (Dapatkan `family_id`) ➔ `POST /admin/datawarga`.

Pemasukan data harus berurutan secara sekuensial jika membuat keluarga baru karena adanya relasi Foreign Key (FK) di database.

### STEP 1 — Tambah Data Rumah (`POST /admin/house`)
* **Method & Route:** `POST /admin/house`
* **Request Body:**
  ```json
  {
    "blok": "B",
    "nomor": 15,
    "alamat": "Jl. Kamboja No. 15",
    "status": "pribadi"
  }
  ```
  * `status`: Hanya boleh `"pribadi"` atau `"kontrak"`.
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "pesan": { "insertId": 3 },
      "token": null
    },
    "message": "data nya sudah terkirim"
  }
  ```
  > 📌 **Tindakan Frontend:** Simpan `insertId` (id rumah) untuk dipakai pada Step 2 dan 3.

---

### STEP 2 — Tambah Data KK (`POST /admin/resident`)
* **Method & Route:** `POST /admin/resident`
* **Request Body:**
  ```json
  {
    "noKK": "3201234567890002",
    "home": 3,
    "KepalaKeluarga": 1
  }
  ```
  * `home`: ID Rumah dari Step 1.
  * `KepalaKeluarga`: ID Warga Kepala Keluarga (dapat diisi `1` untuk inisialisasi sementara, lalu di-update nanti).
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "pesan": { "insertId": 5 },
      "token": null
    },
    "message": "masuk dengan sempurna"
  }
  ```
  > 📌 **Tindakan Frontend:** Simpan `insertId` (id keluarga/family) untuk dipakai pada Step 3.

---

### STEP 3 — Tambah Anggota Keluarga Warga (`POST /admin/datawarga`)
* **Method & Route:** `POST /admin/datawarga`
* **Request Body:**
  ```json
  {
    "nik": "3201234501010002",
    "nama": "Ahmad Subarjo",
    "jenisKelamin": "Laki-laki",
    "tglLahir": "1994-05-12",
    "statusHidup": "Hidup",
    "noHp": "081298765432",
    "umur": 30,
    "fammilyId": 5,
    "houseId": 3
  }
  ```
  * `fammilyId`: ID Keluarga (Family) dari Step 2.
  * `houseId`: ID Rumah dari Step 1.
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "pesan": { "insertId": 10 }
    },
    "message": "masuk dengan sempurnaaa"
  }
  ```

---

### STEP 4 — Buat Akun Warga (`POST /admin/create-account`)
> Membuat kredensial login untuk satu KK.

* **Method & Route:** `POST /admin/create-account`
* **Request Body:**
  ```json
  {
    "familyId": 5
  }
  ```
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "username": "keluarga_5",
      "temporaryPassword": "xT8$2aQ9"
    },
    "message": "Akun berhasil dibuat"
  }
  ```
  > 📌 **Tindakan Frontend:** Tampilkan username dan password sementara ini ke RT agar bisa diberikan kepada Warga.

---

### STEP 5 — Review Semua Pengaduan Warga (Tabel `report`) (`GET /admin/pengaduan`)
> RT melihat daftar pengaduan warga yang masuk beserta nomor KK (tersensor).

* **Method & Route:** `GET /admin/pengaduan`
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Response Sukses (200):**
  ```json
  [
    {
      "id": 1,
      "family_id": 5,
      "isi": "Selokan mampet depan pos ronda",
      "jenis_pengaduan": "Fasilitas Publik",
      "status": "pending",
      "no_kk": "320xxxxxxxxxx001"
    }
  ]
  ```

---

### STEP 6 — Update Status Pengaduan (`PATCH /admin/pengaduan/:id`)
> RT menyetujui atau menolak laporan pengaduan warga.

* **Method & Route:** `PATCH /admin/pengaduan/1`
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Request Body:**
  ```json
  {
    "status": "disetujui"
  }
  ```
  > ⚠️ **Aturan Status:** Nilai `status` hanya boleh diisi `"pending"`, `"disetujui"`, atau `"ditolak"`.
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "fieldCount": 0,
      "affectedRows": 1,
      "info": "",
      "serverStatus": 2,
      "warningStatus": 0,
      "changedRows": 1
    },
    "message": "status pengaduan berhasil diupdate"
  }
  ```

---

### STEP 7 — Review Semua Pengajuan Warga (Tabel `letter`) (`GET /admin/pengajuan`)
> RT melihat daftar pengajuan surat warga yang masuk beserta nomor KK (tersensor).

* **Method & Route:** `GET /admin/pengajuan`
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Response Sukses (200):**
  ```json
  [
    {
      "id": 1,
      "family_id": 5,
      "keperluan": "Bikin KTP Baru",
      "jenis": "Administrasi",
      "status": "pending",
      "no_kk": "320xxxxxxxxxx001"
    }
  ]
  ```

---

### STEP 8 — Update Status Pengajuan (`PATCH /admin/pengajuan/:id`)
> RT menyetujui atau menolak laporan pengajuan warga.

* **Method & Route:** `PATCH /admin/pengajuan/1`
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Request Body:**
  ```json
  {
    "status": "disetujui"
  }
  ```
  > ⚠️ **Aturan Status:** Nilai `status` hanya boleh diisi `"pending"`, `"disetujui"`, atau `"ditolak"`.
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "fieldCount": 0,
      "affectedRows": 1,
      "info": "",
      "serverStatus": 2,
      "warningStatus": 0,
      "changedRows": 1
    },
    "message": "status pengajuan berhasil diupdate"
  }
  ```

---

### STEP 7 — Mengelola Pengumuman RT (`/admin/announcement`)
> RT dapat membuat, mengubah, menghapus, atau melihat pengumuman untuk warga.

#### A. Membuat Pengumuman (`POST /admin/announcement`)
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Request Body:**
  ```json
  {
    "judul": "Gotong Royong",
    "isi": "Ayo bersihkan lingkungan hari Minggu besok jam 08.00 WIB."
  }
  ```
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "pesan": {
        "affectedRows": 1,
        "insertId": 1
      }
    },
    "message": "pengumuman berhasil dibuat masbro"
  }
  ```

#### B. Mengubah Pengumuman (`PATCH /admin/announcement/:id`)
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Request Body (Bisa kirim judul/isi saja):**
  ```json
  {
    "isi": "Ralat jam: Mulai jam 09.00 WIB."
  }
  ```
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "pesan": {
        "affectedRows": 1
      }
    },
    "message": "pengumuman berhasil diperbarui masbro"
  }
  ```

#### C. Menghapus Pengumuman (`DELETE /admin/announcement/:id`)
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "pesan": {
        "affectedRows": 1
      }
    },
    "message": "pengumuman berhasil dihapus masbro"
  }
  ```

#### D. Melihat Pengumuman (Sebagai RT) (`GET /admin/announcement`)
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Response Sukses (200):**
  ```json
  [
    {
      "id": 1,
      "judul": "Gotong Royong",
      "isi": "Ralat jam: Mulai jam 09.00 WIB."
    }
  ]
  ```

---

### STEP 9 — Verifikasi Pendaftaran Warga Mandiri (RT Only)
> RT melihat daftar warga baru yang didaftarkan secara mandiri oleh warga (status pending) dan melakukan verifikasi.

#### A. Melihat Daftar Pending (`GET /admin/pending-warga`)
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Response Sukses (200):**
  ```json
  [
    {
      "warga_id": 15,
      "nik": "320xxxxxxxxxx012",
      "nama": "Siti Aminah",
      "jenis_kelamin": "Perempuan",
      "tgl_lahir": "1998-07-20",
      "status_hidup": "Hidup",
      "no_hp": "08122334455",
      "umur": 28,
      "family_id": 5,
      "family_nokk": "320xxxxxxxxxx001",
      "house_id": 3,
      "house_blok": "A",
      "house_nomor": "12",
      "house_alamat": "Jl. Melati No. 12",
      "status": "pending"
    }
  ]
  ```

#### B. Menyetujui / Menolak Warga Baru (`PATCH /admin/pending-warga/:id`)
* **Headers:** `Authorization: Bearer <token_jwt_rt>`
* **Request Body:**
  ```json
  {
    "status": "diterima"
  }
  ```
  > ⚠️ **Aturan Status:** Nilai `status` hanya boleh diisi `"diterima"` atau `"ditolak"`.
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "pesan": {
        "affectedRows": 1
      }
    },
    "message": "verifikasi status warga berhasil diupdate"
  }
  ```

---

## 🔒 4. Verifikasi & Buka Kunci Data Sensitif (Sudo Mode)

Data `nik` dan `no_kk` yang dikembalikan dari API `/admin/resident` dan `/admin/datawarga` secara bawaan disensor (**masking**) dengan karakter `x`. Untuk melihat data lengkapnya, RT harus memasukkan password kembali.

### A. Reveal NIK Warga
* **Method & Route:** `POST /admin/reveal-warga/:id_warga`
* **Request Body:**
  ```json
  {
    "password": "password_rt_yang_sedang_login"
  }
  ```
* **Response Sukses (200):**
  ```json
  {
    "nik": "3201234501010002"
  }
  ```

### B. Reveal No KK Keluarga
* **Method & Route:** `POST /admin/reveal-resident/:id_family`
* **Request Body:**
  ```json
  {
    "password": "password_rt_yang_sedang_login"
  }
  ```
* **Response Sukses (200):**
  ```json
  {
    "no_kk": "3201234567890002"
  }
  ```

---

## 👥 5. Fitur & Endpoint Warga (Role: `warga`)

### A. Ganti Password Pertama Kali (Wajib)
* **Method & Route:** `PATCH /resident/password`
* **Headers:** `Authorization: Bearer <token_jwt_sementara>`
* **Request Body:**
  ```json
  {
    "newPassword": "PasswordBaruWarga123!"
  }
  ```
* **Response Sukses (200):**
  ```json
  {
    "pesan": "Password berhasil diperbarui masbro!"
  }
  ```

### B. Ambil Data Anggota Keluarga
* **Method & Route:** `GET /resident/getmyfamily/:id_family`
* **Headers:** `Authorization: Bearer <token_jwt_warga>`
* **Response Sukses (200):**
  ```json
  [
    {
      "warga_id": 10,
      "nik": "320xxxxxxxxxx002",
      "nama": "Ahmad Subarjo",
      "jenis_kelamin": "Laki-laki",
      "tgl_lahir": "1994-05-12",
      "status_hidup": "Hidup",
      "no_hp": "081298765432",
      "umur": 30,
      "family_id": 5,
      "house_id": 3,
      "house_blok": "B",
      "house_nomor": "15",
      "house_alamat": "Jl. Kamboja No. 15",
      "house_status": "pribadi"
    }
  ]
  ```
  > 🛡️ **Proteksi Keamanan:** Warga biasa hanya diizinkan memanggil endpoint ini jika `:id_family` sesuai dengan `family_id` milik akunnya sendiri. Jika berbeda, backend mengembalikan status **`403 Forbidden`** (Akses ditolak).

### C. Buat Pengaduan Warga (Tabel `report`)
* **Method & Route:** `POST /resident/pengaduan`
* **Headers:** `Authorization: Bearer <token_jwt_warga>`
* **Request Body:**
  ```json
  {
    "isi": "Selokan mampet depan pos ronda",
    "jenis_pengaduan": "Fasilitas Publik"
  }
  ```
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "fieldCount": 0,
      "affectedRows": 1,
      "insertId": 1
    },
    "message": "pengaduan berhasil terkirim"
  }
  ```
  > 📌 **Catatan:** Kolom `status` otomatis di-set `'pending'` secara bawaan di database.

### D. Cek Status Pengaduan Warga
> Warga mengambil riwayat pengaduan milik keluarganya untuk melihat apakah sudah di-approve atau belum.

* **Method & Route:** `GET /resident/pengaduan`
* **Headers:** `Authorization: Bearer <token_jwt_warga>`
* **Response Sukses (200):**
  ```json
  [
    {
      "id": 1,
      "family_id": 5,
      "isi": "Selokan mampet depan pos ronda",
      "jenis_pengaduan": "Fasilitas Publik",
      "status": "pending"
    }
  ]
  ```

### E. Buat Pengajuan Warga (Tabel `letter`)
* **Method & Route:** `POST /resident/pengajuan`
* **Headers:** `Authorization: Bearer <token_jwt_warga>`
* **Request Body:**
  ```json
  {
    "keperluan": "Bikin KTP Baru",
    "jenis": "Administrasi"
  }
  ```
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "fieldCount": 0,
      "affectedRows": 1,
      "insertId": 1
    },
    "message": "pengajuan berhasil dikirim"
  }
  ```

### F. Cek Status Pengajuan Warga
> Warga mengambil riwayat pengajuan surat milik keluarganya.

* **Method & Route:** `GET /resident/pengajuan`
* **Headers:** `Authorization: Bearer <token_jwt_warga>`
* **Response Sukses (200):**
  ```json
  [
    {
      "id": 1,
      "family_id": 5,
      "keperluan": "Bikin KTP Baru",
      "jenis": "Administrasi",
      "status": "pending"
    }
  ]
  ```

### E. Melihat Pengumuman Warga (`GET /resident/announcement`)
> Warga dapat melihat pengumuman yang dikirim oleh RT.

* **Headers:** `Authorization: Bearer <token_jwt_warga>`
* **Response Sukses (200):**
  ```json
  [
    {
      "id": 1,
      "judul": "Gotong Royong",
      "isi": "Ralat jam: Mulai jam 09.00 WIB."
    }
  ]
  ```

### H. Pendaftaran Anggota Keluarga Mandiri (Tabel `warga` - Pending)
> Warga mendaftarkan anggota keluarga baru. Data tidak langsung resmi, melainkan menunggu verifikasi dari RT.
>
> 🔒 **Keamanan:** `family_id` dan `house_id` tidak perlu dikirim di request body. Backend otomatis mengambil dari KK warga yang login untuk mencegah kecurangan.

* **Method & Route:** `POST /resident/datawarga`
* **Headers:** `Authorization: Bearer <token_jwt_warga>`
* **Request Body:**
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
* **Response Sukses (200):**
  ```json
  {
    "response": 200,
    "output": {
      "pesan": {
        "fieldCount": 0,
        "affectedRows": 1,
        "insertId": 15
      },
      "token": null
    },
    "message": "pengajuan pendaftaran anggota keluarga berhasil terkirim, menunggu verifikasi RT"
  }
  ```

---

## ⚠️ 6. Format Response Error Standar

### A. Error Validasi Parameter / Input (400)
```json
{
  "success": false,
  "errors": [
    {
      "message": "No KK minimal 5 karakter",
      "path": ["noKK"]
    }
  ]
}
```

### B. Error Autentikasi / Token Tidak Valid (403)
```json
{
  "message": "Token tidak valid"
}
```

### C. Error Akses Ditolak / Bukan Hak Milik (403)
```json
{
  "pesan": "Akses ditolak, ini bukan data keluarga lu cuy!"
}
```
