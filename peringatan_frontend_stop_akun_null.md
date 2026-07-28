# ⛔ SURAT CINTA UNTUK FRONTEND: STOP BIKIN AKUN WARGA 'NULL' NYAMPAH! 🛑

Halo tim Frontend! Surat ini dibuat biar database dev kita gak kotor/nyampah lagi oleh akun-akun warga yang `family_id`-nya `NULL`. 

---

## 🛑 MASALAHNYA APA?

Banyak akun warga dibuat asal-asalan via endpoint debug/register biasa tanpa menyertakan `family_id`. 
Akibatnya:
* Akun warga berdiri sendiri tanpa terikat ke Kartu Keluarga (KK) mana pun (`family_id = NULL`).
* Warga tersebut pas login gak bisa ngelihat data keluarga, gak bisa bayar IPL, dan gak bisa bikin pengaduan!

---

## 🛠️ CARA PENANGANAN YANG BENAR (WAJIB DIPAKAI FRONTEND)

### ✅ METODE 1 (REKOMENDASI UTAMA - 1x KLIK LENGKAP)
Gunakan endpoint **One-Step Family Registration** saat RT menambah keluarga baru:

* **Method & Route:** `POST /admin/register-family`
* **Headers:** `Authorization: Bearer <token_jwt_rt_atau_sekretaris>`
* **Payload Request:**
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
👉 **Hasil:** Rumah, KK, Warga Kepala Keluarga, dan **Akun Warga (otomatis ber-family_id)** dibuat seketika tanpa perlu pusing!

---

### ✅ METODE 2 (TOMBOL 'REGISTRASI AKUN' DI TABEL WARGA)
Jika keluarga sudah ada di tabel tapi belum punya akun, tombol `[Registrasi Akun]` di tabel **HARUS** memanggil endpoint ini:

* **Method & Route:** `POST /admin/create-account`
* **Headers:** `Authorization: Bearer <token_jwt_rt_atau_sekretaris>`
* **Payload Request:**
  ```json
  {
    "familyId": 3
  }
  ```
👉 **Hasil:** Backend membuatkan `username` (`keluarga_3`) + `temporaryPassword` yang **100% langsung terikat ke family_id = 3**! Tinggal munculkan modal/alert berisi username & password tersebut untuk diserahkan ke warga.

---

### 🔧 METODE 3 (SOLUSI AKUN LAMA YANG TERLANJUR `NULL`)
Jika ada akun warga lama yang terlanjur terdaftar dengan `family_id = NULL`, **PANGGIL ENDPOINT BIND INI** untuk mengaitkannya ke KK:

* **Method & Route:** `PATCH /admin/account/bind-family`
* **Headers:** `Authorization: Bearer <token_jwt_rt_atau_sekretaris>`
* **Payload Request:**
  ```json
  {
    "userId": 5,
    "familyId": 3
  }
  ```
👉 **Hasil:** Akun dengan `userId = 5` langsung di-update menjadi `family_id = 3`.

---

## 🚫 DILARANG KERAS (BANNED):
❌ **TIDAK BOLEH** memakai `POST /post/debug-regist` untuk bikin akun warga tanpa mengirimkan `family_id`! 

Ingat: Warga tanpa `family_id` = **AKUN NYAMPAH** yang gak bisa ngapa-ngapain di aplikasi. Terima kasih atas kerjasamanya bro! 🚀🔥
