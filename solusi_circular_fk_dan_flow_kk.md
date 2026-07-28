# 💡 Dokumentasi Alur Pendaftaran KK & Otomatisasi Kepala Keluarga

Dokumen ini menjelaskan alur **Pendaftaran Sekuensial (Bertahap)** dan **Alur Instant (1-Step)** untuk menambahkan Rumah, Kartu Keluarga (KK), dan Warga tanpa error *Foreign Key Constraint (Data Yatim/Orphan)*, serta mekanisme **Otomatisasi Penentuan Kepala Keluarga**.

---

## ⚡ 1. Mekanisme Otomatisasi Kepala Keluarga (Auto-Head of Family)

Di backend, saat warga baru di-input ke dalam suatu `family_id` (KK):
1. System mengecek kolom `kepala_keluarga_id` pada tabel `family`.
2. Jika `family.kepala_keluarga_id` masih **`NULL`**, **`0`**, atau `1` (dummy lama), maka warga **pertama** yang di-insert akan **otomatis di-update menjadi Kepala Keluarga** (`UPDATE family SET kepala_keluarga_id = citizen_id`).
3. Warga berikutnya yang ditambahkan ke KK yang sama **tidak akan mengangkangi/mengubah** Kepala Keluarga yang sudah ada (kecuali parameter `isKepalaKeluarga: true` dikirim secara eksplisit).

---

## 🔁 2. ALUR SEKUANSIAL (BERTAHAP 3-LANGKAH)

Cocok digunakan jika UI Frontend menggunakan form wizard/step-by-step (misalnya: Form Tambah Rumah $\rightarrow$ Form Tambah KK $\rightarrow$ Form Tambah Warga).

### 📍 Langkah 1: Tambah Rumah Baru
* **Method & Route:** `POST /admin/house`
* **Headers:** `Authorization: Bearer <token_jwt_rt_atau_sekretaris>`
* **Request Body (JSON):**
  ```json
  {
    "blok": "A",
    "nomor": "12",
    "alamat": "Jl. Mawar No. 12",
    "status": "tetap"
  }
  ```
* **Response:** Mengembalikan `insertId` (simpan nilai ini sebagai `house_id`).

### 📍 Langkah 2: Tambah KK (Kartu Keluarga) Baru
* **Method & Route:** `POST /admin/resident`
* **Headers:** `Authorization: Bearer <token_jwt_rt_atau_sekretaris>`
* **Request Body (JSON):**
  ```json
  {
    "noKK": "3201234567890001",
    "house_id": 1
  }
  ```
  *(Catatan: Menerima nama field `house_id`, `houseId`, atau `home`)*
* **Response:** Mengembalikan `insertId` (simpan nilai ini sebagai `family_id`). Di database, `family.kepala_keluarga_id` awal di-set `NULL` (aman dari FK error).

### 📍 Langkah 3: Tambah Warga Pertama (Otomatis Jadi Kepala Keluarga)
* **Method & Route:** `POST /admin/datawarga`
* **Headers:** `Authorization: Bearer <token_jwt_rt_atau_sekretaris>`
* **Request Body (JSON):**
  ```json
  {
    "nik": "3201234567890002",
    "nama": "Budi Santoso",
    "jenisKelamin": "L",
    "tglLahir": "1985-05-15",
    "statusHidup": "Hidup",
    "noHp": "081234567890",
    "umur": 39,
    "family_id": 1,
    "house_id": 1
  }
  ```
  *(Catatan: Menerima `family_id` / `familyId` dan `house_id` / `houseId`)*
* **Hasil:** Warga berhasil dibuat, dan backend **otomatis meng-update** `family.kepala_keluarga_id = ID Warga ini`!

---

## ⚡ 3. ALUR INSTANT (1-STEP FAMILY REGISTRATION)

Cocok jika UI Frontend menggunakan satu modal/form besar yang langsung meminta data Rumah, KK, dan Kepala Keluarga sekaligus.

* **Method & Route:** `POST /admin/register-family`
* **Headers:** `Authorization: Bearer <token_jwt_rt_atau_sekretaris>`
* **Request Body (JSON):**
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
* **Hasil Backend:** Menjalankan transaksi 4-langkah secara otomatis, memisahkan pembuatan Rumah, KK, Warga, serta membuatkan Akun Login Warga secara instan.
