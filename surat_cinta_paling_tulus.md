# 💌 Surat Cinta Paling Tulus Untuk Frontend

> Halo tim frontend! Ini adalah kelanjutan & panduan update sistem login baru yang lebih matang dan aman. Baca ini baik-baik ya biar integrasi kita lancar jaya! 🚀

---

## 🌐 Base URL
```
http://172.20.32.62:3333
```

---

## 🔄 Alur Pembuatan Akun & Login Baru

Sekarang, **warga tidak bisa mendaftar sendiri** (registrasi publik dimatikan). Semua dikelola oleh RT selaku Admin.

```
RT membuat data warga & keluarga (KK)
                  │
                  ▼
RT menekan tombol "Buat Akun" untuk Keluarga
                  │
                  ▼
Backend men-generate Username & Password sementara
                  │
                  ▼
Warga login pertama kali dengan password sementara
                  │
                  ▼
Backend mendeteksi 'must_change_password' = TRUE
                  │
                  ▼
Frontend memaksa Warga ganti password baru (PATCH /resident/password)
                  │
                  ▼
Setelah berhasil, status 'must_change_password' = FALSE
                  │
                  ▼
Selesai! Login berikutnya langsung masuk Dashboard
```

---

## 📋 Endpoint Baru & Update

---

### 1. `POST /admin/create-account` (Khusus RT / Admin)
> RT membuatkan akun untuk satu keluarga berdasarkan `familyId` (KK) yang baru di-input.

* **Method:** `POST`
* **URL:** `/admin/create-account`
* **Headers:**
  ```http
  Authorization: Bearer <token_jwt_rt>
  Content-Type: application/json
  ```
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
  > 📌 **Catatan:** Simpan dan berikan `username` & `temporaryPassword` ini ke warga (kepala keluarga).

---

### 2. Update `POST /post/login` (Untuk Semua User)
> Login menggunakan username dan password.

* **Method:** `POST`
* **URL:** `/post/login`
* **Request Body:**
  ```json
  {
    "username": "keluarga_5",
    "password": "temporaryPassword_atau_passwordBaru"
  }
  ```

#### Skenario A: Login Pertama Kali (Masih pakai Password Sementara)
Response sukses memiliki status `"must_change_password"`. Frontend **wajib** me-redirect user ke halaman **Ganti Password**.
* **Response (200):**
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

#### Skenario B: Login Biasa (Sudah ganti password baru)
Response sukses biasa untuk masuk ke dashboard.
* **Response (200):**
  ```json
  {
    "status": "login berhasil",
    "user": {
      "id": 12,
      "username": "keluarga_5",
      "role": "warga",
      "family_id": 5,
      "must_change_password": 0
    },
    "token": "eyJhbGciOi..."
  }
  ```

---

### 3. `PATCH /resident/password` (Untuk Warga - Ganti Password)
> Dipakai saat dipaksa ganti password di login pertama, atau menu ganti password di profil warga.

* **Method:** `PATCH`
* **URL:** `/resident/password`
* **Headers:**
  ```http
  Authorization: Bearer <token_jwt_sementara/permanen>
  Content-Type: application/json
  ```
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

---

### 4. `GET /resident/getmyfamily/:id` (Dengan Proteksi Anti-Intip / ID Snooping 🛡️)
> Mengambil data anggota keluarga milik warga yang sedang login.

* **Method:** `GET`
* **URL:** `/resident/getmyfamily/5`
* **Headers:**
  ```http
  Authorization: Bearer <token_jwt_warga>
  ```

> ⚠️ **Sistem Proteksi Kepemilikan Data:**  
> Backend mencocokkan `family_id` yang direquest (`:id` di URL) dengan `family_id` milik token yang sedang login.  
> Jika warga mencoba menembak `id` keluarga orang lain (misal `/resident/getmyfamily/6`), backend otomatis menolak dengan error **`403 Forbidden`**.

* **Response Error (403):**
  ```json
  {
    "pesan": "Akses ditolak, ini bukan data keluarga lu cuy!"
  }
  ```

---

*Semua endpoint baru sudah teruji dan siap diintegrasikan. Semangat ngodingnya frontend! 🚀🔥*
