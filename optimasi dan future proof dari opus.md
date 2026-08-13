# 🛡️ Optimasi & Future-Proof: Security Patch Backend RT

> **Untuk siapa dokumen ini?**  
> Tim Backend & **Tim Frontend**. Dokumen ini menjelaskan perubahan keamanan di backend
> beserta **panduan lengkap request/response** untuk setiap endpoint yang terdampak.

---

## 📋 Daftar Isi

1. [Ringkasan Masalah](#-ringkasan-masalah)
2. [Panduan Frontend: Endpoint yang Berubah](#-panduan-frontend-endpoint-yang-berubah)
   - [POST /post/login](#1-post-postlogin--login)
   - [POST /admin/create-account](#2-post-admincreate-account--buat-akun-warga)
   - [POST /admin/register-family](#3-post-adminregister-family--registrasi-keluarga-baru)
   - [DELETE /admin/datawarga/:id](#4-delete-admindatawargaid--hapus-anggota-keluarga-baru-)
   - [PATCH /resident/my-account](#5-patch-residentmy-account--update-profil--ganti-password)
   - [PATCH /resident/password](#6-patch-residentpassword--ganti-password-first-login)
   - [GET /resident/my-account](#7-get-residentmy-account--lihat-profil)
   - [PATCH /pengajuan/:id/archive](#8-patch-pengajuanidarchive--arsip--menyatakan-surat-selesai-baru-)
3. [Yang TIDAK Berubah](#-yang-tidak-berubah)
4. [Penjelasan Teknis untuk Backend](#-penjelasan-teknis-untuk-backend)
5. [Arsitektur Future-Proof](#-arsitektur-future-proof)

---

## 🔍 Ringkasan Masalah

Ada **6 celah keamanan** yang ditutup:

| # | Masalah | Dampak | Status |
|---|---|---|---|
| 1 | Login mengirim **password hash** ke browser | Attacker bisa offline brute-force | ✅ Fixed |
| 2 | Create account mengirim **password plaintext 5x** di response | Password terekspos di DevTools | ✅ Fixed |
| 3 | Query database pakai `SELECT *` — selalu ambil kolom `password` | Password ada di memory setiap request | ✅ Fixed |
| 4 | Ganti password **tanpa verifikasi password lama** | Siapapun punya JWT bisa ganti password | ✅ Fixed |
| 5 | Password di-generate pakai `Math.random()` | Output predictable, bisa ditebak | ✅ Fixed |
| 6 | `console.log` cetak full user object ke server log | Password tersimpan di log selamanya | ✅ Fixed |

---

## 📘 Panduan Frontend: Endpoint yang Berubah

> **PENTING:** Baca section ini baik-baik. Kalau frontend tidak menyesuaikan, beberapa fitur bisa error.

---

### 1. `POST /post/login` — Login

**Request — TIDAK BERUBAH:**
```json
{
    "username": "warga123",
    "password": "passwordnya"
}
```

**Response — BERUBAH ⚠️:**

<table>
<tr>
<th>❌ Response LAMA</th>
<th>✅ Response BARU</th>
</tr>
<tr>
<td>

```json
{
    "status": "login berhasil",
    "user": {
        "id": 1,
        "username": "warga123",
        "password": "$argon2id$v=19$...",
        "email": "U2FsdGVkX1+abc...",
        "role": "warga",
        "family_id": 5,
        "must_change_password": 0
    },
    "token": "eyJhbGciOiJ..."
}
```

</td>
<td>

```json
{
    "status": "login berhasil",
    "user": {
        "id": 1,
        "username": "warga123",
        "role": "warga",
        "family_id": 5,
        "must_change_password": 0
    },
    "token": "eyJhbGciOiJ..."
}
```

</td>
</tr>
</table>

**Yang hilang dari `user`:**
- ~~`password`~~ — hash password dihapus
- ~~`email`~~ — encrypted email dihapus (ambil lewat endpoint profil kalau butuh)

**Yang perlu diubah di frontend:**
```diff
  // Menyimpan data user setelah login
  const { user, token } = response.data

  // ✅ Field ini masih ada, aman:
  localStorage.setItem("token", token)
  localStorage.setItem("userId", user.id)
  localStorage.setItem("username", user.username)
  localStorage.setItem("role", user.role)
  localStorage.setItem("familyId", user.family_id)

  // ❌ HAPUS baris ini kalau ada:
- localStorage.setItem("password", user.password)
- localStorage.setItem("email", user.email)
```

**Response login gagal — TIDAK BERUBAH:**
```json
"username tidak ditemukan"
```
```json
"password salah"
```

**Response must change password — BERUBAH ⚠️:**

```json
{
    "status": "must_change_password",
    "user": {
        "id": 1,
        "username": "keluarga_5",
        "role": "warga",
        "family_id": 5,
        "must_change_password": 1
    },
    "token": "eyJhbGciOiJ..."
}
```

> `user.password` dan `user.email` tidak ada lagi di response ini juga.

---

### 2. `POST /admin/create-account` — Buat Akun Warga

> Endpoint ini hanya bisa diakses oleh role **RT**.

**Request — TIDAK BERUBAH:**
```json
{
    "familyId": 5,
    "username": "warga_pak_budi",
    "password": "opsional_custom_password"
}
```
> `username` dan `password` opsional. Kalau kosong, auto-generate.

**Response — BERUBAH ⚠️:**

<table>
<tr>
<th>❌ Response LAMA</th>
<th>✅ Response BARU</th>
</tr>
<tr>
<td>

```json
{
    "response": 200,
    "output": {
        "username": "warga_pak_budi",
        "password": "xK9#mNpQ",
        "temporaryPassword": "xK9#mNpQ",
        "pesan": { ... }
    },
    "data": {
        "username": "warga_pak_budi",
        "password": "xK9#mNpQ",
        "temporaryPassword": "xK9#mNpQ"
    },
    "username": "warga_pak_budi",
    "password": "xK9#mNpQ",
    "temporaryPassword": "xK9#mNpQ",
    "message": "Akun berhasil dibuat"
}
```

</td>
<td>

```json
{
    "response": 201,
    "data": {
        "username": "warga_pak_budi",
        "temporaryPassword": "aB3$kL9mNpQx"
    },
    "message": "Akun berhasil dibuat. Catat password sementara ini, tidak bisa dilihat lagi setelah halaman ditutup."
}
```

</td>
</tr>
</table>

**Yang berubah:**
- Status code: `200` → `201` (Created)
- Password hanya ada di **satu tempat**: `response.data.temporaryPassword`
- ~~`response.password`~~ — dihapus
- ~~`response.output`~~ — dihapus
- ~~`response.username`~~ (root level) — dihapus
- Password lebih panjang: dari 8 → 12 karakter

**Yang perlu diubah di frontend:**
```diff
  // Di SweetAlert / Modal setelah buat akun:
  const res = await axios.post("/admin/create-account", payload)

- const username = res.data.username || res.data.output?.username
- const password = res.data.password || res.data.output?.password

+ const username = res.data.data.username
+ const password = res.data.data.temporaryPassword

  Swal.fire({
      title: "Akun Berhasil Dibuat!",
      html: `
          <p>Username: <b>${username}</b></p>
          <p>Password Sementara: <b>${password}</b></p>
          <p>⚠️ Catat sekarang, tidak bisa dilihat lagi!</p>
      `
  })
```

---

### 3. `POST /admin/register-family` — Registrasi Keluarga Baru

> Endpoint ini hanya bisa diakses oleh role **RT** dan **Sekretaris**.

**Request — TIDAK BERUBAH:**
```json
{
    "blok": "A",
    "nomor": "12",
    "alamat": "Jl. Mawar No. 12",
    "statusRumah": "milik_sendiri",
    "noKK": "3201234567890001",
    "nik": "3201234567890002",
    "nama": "Budi Santoso",
    "jenisKelamin": "laki-laki",
    "tglLahir": "1980-05-15",
    "statusHidup": "hidup",
    "noHp": "081234567890",
    "umur": 46
}
```

**Response — TIDAK BERUBAH (tapi perlu perhatian):**
```json
{
    "response": 200,
    "output": {
        "pesan": {
            "houseId": 10,
            "familyId": 15,
            "kepalaKeluargaId": 20,
            "account": {
                "username": "keluarga_15",
                "temporaryPassword": "aB3$kL9mNpQx"
            }
        }
    },
    "message": "Pendaftaran kepala keluarga dan pembuatan akun berhasil..."
}
```

> Endpoint ini sudah dari awal hanya mengirim `temporaryPassword` di `account`, jadi **tidak ada breaking change**. Tapi perlu dicatat: password sekarang lebih panjang (12 karakter vs 8 sebelumnya).

**Cara ambil data:**
```js
const res = await axios.post("/admin/register-family", payload)
const { username, temporaryPassword } = res.data.output.pesan.account
```

---

### 4. `DELETE /admin/datawarga/:id` — Hapus Anggota Keluarga (BARU 🆕)

> Endpoint ini hanya bisa diakses oleh role **RT** dan **Sekretaris**.
> Digunakan untuk menghapus anggota keluarga yang ditambahkan tanpa sepengetahuan RT.

**Business Rules:**
- ✅ Anggota keluarga biasa bisa dihapus
- ❌ **Kepala keluarga TIDAK BISA dihapus** — harus ganti kepala keluarga dulu kalau memang mau dihapus
- Warga harus exist di database

**Request:**
```
DELETE /admin/datawarga/42
Authorization: Bearer <token_rt_atau_sekretaris>
```

> Tidak butuh request body. ID warga dikirim lewat URL parameter.

**Response Sukses (200):**
```json
{
    "success": true,
    "response": 200,
    "data": {
        "deletedId": 42,
        "nama": "Andi Setiawan",
        "family_id": 5
    },
    "message": "Data warga \"Andi Setiawan\" berhasil dihapus dari sistem"
}
```

**Response Gagal — Warga Tidak Ditemukan (404):**
```json
{
    "success": false,
    "pesan": "Data warga tidak ditemukan"
}
```

**Response Gagal — Kepala Keluarga Tidak Boleh Dihapus (403):**
```json
{
    "success": false,
    "pesan": "Warga ini adalah Kepala Keluarga dan tidak dapat dihapus. Hubungi admin jika perlu mengganti kepala keluarga terlebih dahulu."
}
```

**Contoh implementasi di frontend:**
```js
async function hapusWarga(wargaId, namaWarga) {
    // 1. Konfirmasi dulu pakai SweetAlert
    const confirm = await Swal.fire({
        title: "Hapus Warga?",
        html: `Yakin mau hapus data <b>${namaWarga}</b> dari sistem?<br>Aksi ini tidak bisa dibatalkan!`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        confirmButtonText: "Ya, hapus!",
        cancelButtonText: "Batal"
    })
    
    if (!confirm.isConfirmed) return
    
    // 2. Kirim request DELETE
    try {
        const res = await axios.delete(`/admin/datawarga/${wargaId}`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        
        Swal.fire("Berhasil!", res.data.message, "success")
        // 3. Refresh tabel warga
        fetchDataWarga()
        
    } catch (err) {
        const pesan = err.response?.data?.pesan || "Gagal menghapus warga"
        Swal.fire("Gagal!", pesan, "error")
    }
}
```

---

### 5. `PATCH /resident/my-account` — Update Profil + Ganti Password

> Endpoint ini bisa diakses oleh **semua role** yang sudah login.

**Request — BERUBAH ⚠️:**

<table>
<tr>
<th>❌ Request LAMA (oldPassword opsional)</th>
<th>✅ Request BARU (oldPassword WAJIB)</th>
</tr>
<tr>
<td>

```json
{
    "newPassword": "password_baru_123"
}
```
*Bisa ganti password tanpa tau password lama* 😱

</td>
<td>

```json
{
    "oldPassword": "password_lama_456",
    "newPassword": "password_baru_123"
}
```
*WAJIB isi oldPassword kalau mau ganti password*

</td>
</tr>
</table>

**Semua field yang bisa dikirim:**
```json
{
    "username": "username_baru",
    "email": "email_baru@gmail.com",
    "oldPassword": "password_lama",
    "newPassword": "password_baru"
}
```

> Semua field bersifat **opsional**. Kirim hanya yang mau diubah.
> Tapi kalau kirim `newPassword`, maka `oldPassword` **WAJIB** diisi juga.

**Response sukses — TIDAK BERUBAH:**
```json
{
    "response": 200,
    "output": {
        "id": 1,
        "username": "username_baru",
        "email": "email_baru@gmail.com",
        "role": "warga",
        "familyId": 5,
        "family_id": 5,
        "mustChangePassword": 0
    },
    "data": { "...sama seperti output..." },
    "message": "Profil akun berhasil diperbarui masbro!"
}
```

**Response error BARU:**
```json
{
    "pesan": "error: Password lama wajib diisi untuk mengubah password"
}
```
> Error ini muncul kalau kirim `newPassword` tanpa `oldPassword`.

**Yang perlu diubah di frontend:**
```diff
  // Form ganti password harus punya input oldPassword
  const payload = {}

  if (newPassword) {
+     if (!oldPassword) {
+         return alert("Password lama wajib diisi!")
+     }
+     payload.oldPassword = oldPassword
      payload.newPassword = newPassword
  }

  if (username) payload.username = username
  if (email) payload.email = email

  await axios.patch("/resident/my-account", payload, { headers: { Authorization: `Bearer ${token}` } })
```

---

### 6. `PATCH /resident/password` — Ganti Password (First Login)

> Endpoint ini biasa dipanggil setelah login pertama kali (`must_change_password: 1`).

**Request — TIDAK BERUBAH:**
```json
{
    "newPassword": "password_baru_pilihan_saya"
}
```

> ⚠️ Endpoint ini **TIDAK** meminta `oldPassword` karena memang untuk first-login (warga belum tau password lama, dikasih temporary password oleh RT).  
> Ini **by design**, bukan bug.

**Response sukses — TIDAK BERUBAH:**
```json
{
    "pesan": "Password berhasil diperbarui masbro!"
}
```

---

### 7. `GET /resident/my-account` — Lihat Profil

> Alias: `GET /resident/profile`

**Request — TIDAK BERUBAH:**
```
GET /resident/my-account
Authorization: Bearer <token>
```

**Response — TIDAK BERUBAH:**
```json
{
    "response": 200,
    "output": {
        "id": 1,
        "username": "warga123",
        "email": "email_terdekripsi@gmail.com",
        "role": "warga",
        "familyId": 5,
        "family_id": 5,
        "mustChangePassword": 0
    },
    "data": { "...sama seperti output..." },
    "message": "Data profil akun berhasil diambil"
}
```

> Endpoint ini **aman** dan tidak berubah. Email tetap ditampilkan dalam bentuk terdekripsi melalui service layer (bukan dari raw database).

---

### 8. `PATCH /pengajuan/:id/archive` — Arsip / Menyatakan Surat Selesai (BARU 🆕)

> Endpoint ini digunakan oleh **RT & Sekretaris** untuk menandai surat pengajuan warga sebagai **Selesai (Diarsipkan)**.

**Tabel Database (`letter`):**
* Tambahan kolom: `is_archived` (`TINYINT(1)` / `BOOLEAN`, default `0`).
* Auto-migration sudah otomatis berjalan menambahkan kolom `is_archived` jika belum ada.

**Request Option 1 — Dedicated Archive Endpoint:**
```http
PATCH /pengajuan/12/archive
Authorization: Bearer <token_admin>
Content-Type: application/json

{
    "is_archived": true
}
```

**Request Option 2 — Sekaligus Update Status & Archive:**
```http
PATCH /pengajuan/12
Authorization: Bearer <token_admin>
Content-Type: application/json

{
    "status": "disetujui",
    "is_archived": true
}
```

**Response GET /pengajuan (Bagi Frontend):**
Setiap item dalam `GET /pengajuan` atau `GET /user/pengajuan` sekarang menyertakan field `is_archived`:

```json
[
    {
        "id": 12,
        "family_id": 5,
        "keperluan": "Surat Pengantar Pembuatan KTP",
        "jenis": "Surat Pengantar",
        "status": "disetujui",
        "is_archived": true,
        "is_archived_bool": true,
        "no_kk": "3201***"
    }
]
```

**Contoh Akses Frontend (Axios & UI State Toggle):**
```js
// 1. Fungsi Toggle Archive ke Backend
async function toggleArchiveSurat(letterId, currentArchivedStatus) {
    try {
        const nextStatus = !currentArchivedStatus; // toggle boolean
        await axios.patch(`/pengajuan/${letterId}/archive`, {
            is_archived: nextStatus
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        // Refresh list surat
        fetchListPengajuan();
    } catch (err) {
        alert("Gagal mengubah status arsip surat");
    }
}
```

**Contoh Rendering UI / Styling tombol (React / Vue / HTML):**
```jsx
// Menggunakan field `surat.is_archived` dari response backend:
<button 
  onClick={() => toggleArchiveSurat(surat.id, surat.is_archived)}
  style={{
    backgroundColor: surat.is_archived ? "#1e293b" : "#2563eb", // Hitam (Off/Arsip) vs Biru (On/Aktif)
    color: "#ffffff",
    padding: "8px 16px",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer"
  }}
>
  {surat.is_archived ? "📦 Selesai / Diarsipkan (Hitam)" : "🔵 Aktif / Proses (Biru)"}
</button>
```

---

## ✅ Yang TIDAK Berubah

Endpoint-endpoint berikut **tidak terdampak** perubahan ini:

| Endpoint | Keterangan |
|---|---|
| `POST /post/register` | Request & response tetap sama |
| `GET /resident/getmyfamily/:id` | Tidak berhubungan dengan tabel `acount` |
| `POST /resident/pengaduan` | Tidak berhubungan dengan data akun |
| `POST /resident/pengajuan` | Tidak berhubungan dengan data akun |
| `GET /resident/announcement` | Tidak berhubungan dengan data akun |
| `GET /resident/agenda` | Tidak berhubungan dengan data akun |
| Semua endpoint `/admin/finance/*` | Tidak berhubungan dengan data akun |
| Semua endpoint `/admin/announcement/*` | Tidak berhubungan dengan data akun |
| Semua endpoint `/admin/pengaduan/*` | Tidak berhubungan dengan data akun |
| `POST /admin/register-family` | Sudah benar dari awal, hanya panjang password berubah |
| `PATCH /admin/account/*` | Response tetap sama (admin update tanpa perlu password lama) |

---

## 📐 Cheat Sheet: Quick Reference

```
┌────────────────────────────────────────────────────────────────┐
│                   RESPONSE FIELD CHANGES                       │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  POST /post/login                                              │
│  ├─ user.password        ❌ DIHAPUS                            │
│  ├─ user.email           ❌ DIHAPUS                            │
│  ├─ user.id              ✅ tetap ada                          │
│  ├─ user.username        ✅ tetap ada                          │
│  ├─ user.role            ✅ tetap ada                          │
│  ├─ user.family_id       ✅ tetap ada                          │
│  └─ user.must_change_password  ✅ tetap ada                    │
│                                                                │
│  POST /admin/create-account                                    │
│  ├─ response.password    ❌ DIHAPUS                            │
│  ├─ response.username    ❌ DIHAPUS (dari root level)          │
│  ├─ response.output      ❌ DIHAPUS                            │
│  ├─ data.password        ❌ DIHAPUS                            │
│  ├─ data.username        ✅ tetap ada                          │
│  ├─ data.temporaryPassword ✅ tetap ada (satu-satunya)         │
│  └─ response code        ⚠️ 200 → 201                         │
│                                                                │
│  PATCH /resident/my-account                                    │
│  ├─ request.oldPassword  ⚠️ WAJIB (kalau ganti password)      │
│  └─ response             ✅ tidak berubah                      │
│                                                                │
│  DELETE /admin/datawarga/:id  🆕 ENDPOINT BARU                 │
│  ├─ method               DELETE (bukan POST!)                  │
│  ├─ param :id            ID warga yang mau dihapus             │
│  ├─ response.success     true/false                            │
│  ├─ response.data        { deletedId, nama, family_id }        │
│  └─ proteksi             ❌ Kepala keluarga gak bisa dihapus   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Penjelasan Teknis untuk Backend

### File Baru: `helpers/sanitizeUser.js`

Satu file "gatekeeper" untuk semua data sensitif user:

| Export | Fungsi | Kapan Pakai |
|---|---|---|
| `toSafeUser(user)` | Whitelist — hanya loloskan field aman | Response ke client |
| `stripSensitiveFields(user)` | Blacklist — hapus field sensitif | Alternatif dari whitelist |
| `toSafeUsers(users)` | Sanitize array user | Kalau return list user |
| `SAFE_COLUMNS_SQL` | SQL `SELECT` tanpa password | Query umum |
| `AUTH_COLUMNS_SQL` | SQL `SELECT` dengan password | Hanya untuk login & verify |

### Perubahan Model: `models/login.js`

Dari 2 fungsi jadi 3 fungsi:

| Fungsi | Ambil Password? | Boleh Dipanggil Dari |
|---|---|---|
| `loginAccount(username)` | ✅ Ya | Hanya `bisnisRegisterAndLogin.js` |
| `getAccountById(id)` | ❌ Tidak | Semua controller/service |
| `getAccountByIdWithAuth(id)` | ✅ Ya | Hanya `accountProfileService.js` |

### Perubahan Service Layer

| File | Perubahan |
|---|---|
| `bisnisRegisterAndLogin.js` | `return { user: user }` → `return { user: toSafeUser(user) }` |
| `accountProfileService.js` | `oldPassword` sekarang wajib + pakai `getAccountByIdWithAuth` |
| `createAccount.js` | `Math.random` → `crypto.randomBytes`, hapus field `password` dari return |
| `familyRegistrationService.js` | `Math.random` → `crypto.randomBytes` |
| `changePassword.js` | Tidak diubah (endpoint ini untuk first-login, by design tanpa old password) |

### Perubahan Controller Layer

| File | Perubahan |
|---|---|
| `accountController.js` | Response dari password 5x → `temporaryPassword` 1x, status `201` |
| `registandlogin.js` | `console.log(hasilnya)` → `console.log(hasilnya.status)` |

---

## 🔮 Arsitektur Future-Proof

### Pertahanan Berlapis (Defense in Depth)

```
    Request masuk
         │
         ▼
  ┌──────────────────────┐
  │  Layer 1: SQL Query   │   Query default TANPA password.
  │  (SAFE_COLUMNS_SQL)   │   Password gak pernah di-fetch
  │                       │   kecuali endpoint auth.
  └──────────┬────────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Layer 2: Service     │   toSafeUser() strip field sensitif
  │  (toSafeUser)         │   sebelum return ke controller.
  │                       │   Bahkan kalau Layer 1 pakai SELECT *,
  │                       │   layer ini tetap melindungi.
  └──────────┬────────────┘
             │
             ▼
  ┌──────────────────────┐
  │  Layer 3: Controller  │   Response hanya berisi data
  │  (Clean Response)     │   yang sudah disanitize.
  │                       │   Tidak ada console.log data sensitif.
  └──────────┬────────────┘
             │
             ▼
       🔒 Response ke Client AMAN
```

### Bagaimana Kalau Nanti Tambah Kolom Baru?

**Skenario: Tambah fitur 2FA, ada kolom `two_factor_secret` di database**

Tanpa sistem ini:
> Developer bikin `SELECT * FROM acount`, return ke client. `two_factor_secret` bocor. 💀

Dengan sistem ini:
> 1. `two_factor_secret` sudah ada di `SENSITIVE_FIELDS` (sudah disiapkan dari awal)
> 2. Query non-auth pakai `SAFE_COLUMNS_SQL` → gak fetch kolom itu
> 3. Kalau pun ada yang pakai `SELECT *`, `toSafeUser()` auto-exclude (whitelist)
> 4. **Zero code change needed** ✅

**Skenario: Developer baru bikin endpoint baru**

> Mereka pasti pakai `getAccountById()` yang default-nya **tanpa password**.
> Harus sengaja pakai `getAccountByIdWithAuth()` untuk dapat password — dan nama fungsinya sudah jelas 🚫.

### Daftar Field yang Sudah Disiapkan untuk Masa Depan

| Field | Status | Keterangan |
|---|---|---|
| `password` | 🔴 Aktif dipakai | Hash argon2 |
| `temporaryPassword` | 🔴 Aktif dipakai | Temp password saat buat akun |
| `email` | 🔴 Aktif dipakai | Encrypted email |
| `two_factor_secret` | 🔮 Disiapkan | Untuk fitur 2FA nanti |
| `refresh_token` | 🔮 Disiapkan | Untuk token rotation nanti |
| `reset_token` | 🔮 Disiapkan | Untuk fitur lupa password nanti |
| `otp_secret` | 🔮 Disiapkan | Untuk OTP auth nanti |

---

> **Dokumen ini dibuat sebagai referensi untuk tim Backend & Frontend.**  
> Terakhir diperbarui: 12 Agustus 2026
