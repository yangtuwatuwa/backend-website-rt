# 💌 Surat Cinta Untuk Frontend

> Halo tim frontend! Baca ini dulu sebelum mulai integrasi ya, biar gak pusing dan gak bolak-balik nanya. Sayang banget kalau sampe salah urutan 🙏

---

## 🌐 Base URL

```
http://172.20.32.62:3333
```

---

## ⚠️ Wajib Baca: Urutan Pengisian Data

Sistem ini punya **relasi antar tabel (Foreign Key)**. Artinya, data harus dimasukkan dengan **urutan yang benar**. Kalau salah urutan, data **PASTI GAGAL** masuk ke database.

```
STEP 1          STEP 2              STEP 3
   │               │                   │
   ▼               ▼                   ▼
/admin/house ──► /admin/resident ──► /admin/datawarga
  (Rumah)         (Kartu Keluarga)     (Data Warga)

 Tidak ada FK    FK ke house          FK ke house
                                      FK ke resident/family
```

### Kenapa harus urutan ini?
- **`/admin/house`** adalah entitas paling awal. Tidak bergantung ke tabel manapun.
  Setelah berhasil dibuat, sistem akan menghasilkan **`id` rumah**.
- **`/admin/resident`** butuh **`id` rumah** dari step 1 untuk diisi di field `home`.
  Setelah berhasil, sistem menghasilkan **`id` keluarga (family)**.
- **`/admin/datawarga`** butuh **`id` rumah** dari step 1 dan **`id` family** dari step 2.
  Ini adalah entitas warga yang sebenarnya.

---

## 📋 Detail Setiap Endpoint

---

### STEP 1 — `POST /admin/house`
> Buat data rumah terlebih dahulu.

**Method:** `POST`  
**URL:** `http://172.20.32.62:3333/admin/house`  
**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "blok": "A",
  "nomor": 12,
  "alamat": "Jl. Melati No. 12",
  "status": "pribadi"
}
```

| Field    | Tipe     | Wajib | Keterangan                              |
|----------|----------|-------|-----------------------------------------|
| `blok`   | `string` | ✅    | Blok / cluster rumah                    |
| `nomor`  | `number` | ✅    | Nomor rumah                             |
| `alamat` | `string` | ✅    | Alamat lengkap rumah                    |
| `status` | `string` | ✅    | Status kepemilikan: `"kontrak"` atau `"pribadi"` |

> 🔒 **Data `blok`, `nomor`, dan `alamat` dienkripsi otomatis di server sebelum masuk ke database.**  
> ⚠️ **`status` hanya boleh diisi `"kontrak"` atau `"pribadi"`** (selain itu akan ditolak database).

**Response Sukses (200):**
```json
{
  "response": 200,
  "output": {
    "pesan": { "fieldCount": 0, "affectedRows": 1, "insertId": 3 },
    "token": null
  },
  "message": "data nya sudah terkirim"
}
```

> 📌 **Simpan nilai `insertId`** dari response! Itu adalah `id` rumah yang akan dipakai di step 2 dan 3.

---

### STEP 2 — `POST /admin/resident`
> Buat data kartu keluarga. Harus sudah punya `id` rumah dari step 1.

**Method:** `POST`  
**URL:** `http://172.20.32.62:3333/admin/resident`  
**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "noKK": "3201234567890001",
  "home": 3,
  "KepalaKeluarga": 1
}
```

| Field            | Tipe     | Wajib | Keterangan                                              |
|------------------|----------|-------|---------------------------------------------------------|
| `noKK`           | `string` | ✅    | Nomor Kartu Keluarga. **Minimal 5 karakter**            |
| `home`           | `number` | ✅    | **`id` rumah dari step 1** (harus angka positif)        |
| `KepalaKeluarga` | `number` | ✅    | ID warga kepala keluarga (angka positif)                |

> 🔒 **`noKK` dienkripsi otomatis di server.**  
> ⚠️ **Perhatikan huruf besar `K` pada `KepalaKeluarga`** — field ini case-sensitive!

**Response Sukses (200):**
```json
{
  "response": 200,
  "output": {
    "pesan": { "fieldCount": 0, "affectedRows": 1, "insertId": 5 },
    "token": null
  },
  "message": "masuk dengan sempurna"
}
```

> 📌 **Simpan nilai `insertId`** dari response! Itu adalah `id` keluarga (family) yang akan dipakai di step 3 sebagai `fammilyId`.

**Response Error Validasi (400):**
```json
{
  "success": false,
  "errors": [
    { "message": "No KK minimal 5 karakter", "path": ["noKK"] }
  ]
}
```

---

### STEP 3 — `POST /admin/datawarga`
> Buat data warga. Harus sudah punya `id` rumah dari step 1 dan `id` family dari step 2.

**Method:** `POST`  
**URL:** `http://172.20.32.62:3333/admin/datawarga`  
**Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "nik": "3201234501010001",
  "nama": "Budi Santoso",
  "jenisKelamin": "Laki-laki",
  "tglLahir": "1990-01-01",
  "statusHidup": "Hidup",
  "noHp": "081234567890",
  "umur": 34,
  "fammilyId": 5,
  "houseId": 3
}
```

| Field          | Tipe     | Wajib | Keterangan                                               |
|----------------|----------|-------|----------------------------------------------------------|
| `nik`          | `string` | ✅    | Nomor Induk Kependudukan                                 |
| `nama`         | `string` | ✅    | Nama lengkap warga                                       |
| `jenisKelamin` | `string` | ✅    | `"Laki-laki"` atau `"Perempuan"`                         |
| `tglLahir`     | `string` | ✅    | Format `"YYYY-MM-DD"` contoh: `"1990-01-01"`             |
| `statusHidup`  | `string` | ✅    | `"Hidup"` atau `"Meninggal"`                             |
| `noHp`         | `string` | ✅    | Nomor HP warga                                           |
| `umur`         | `number` | ✅    | Umur warga dalam tahun                                   |
| `fammilyId`    | `number` | ✅    | **`id` keluarga dari step 2** ⚠️ ada 2 huruf `m`!        |
| `houseId`      | `number` | ✅    | **`id` rumah dari step 1**                               |

> 🔒 **`nik`, `tglLahir`, dan `noHp` dienkripsi otomatis di server.**

**Response Sukses (200):**
```json
{
  "response": 200,
  "output": {
    "pesan": { "fieldCount": 0, "affectedRows": 1, "insertId": 0 },
    "token": null
  },
  "message": "masuk dengan sempurnaaa"
}
```

---

## 📖 Endpoint Tambahan (Khusus RT & Butuh JWT)

---

### `GET /admin/resident`
> Ambil semua data kartu keluarga. `no_kk` dan `kepala_keluarga_nik` otomatis di-masking (`320xxxxxxxxxx001`) oleh server demi alasan keamanan.

**Method:** `GET`  
**URL:** `http://172.20.32.62:3333/admin/resident`

**Response Sukses (200):**
```json
[
  {
    "family_id": 5,
    "no_kk": "320xxxxxxxxxx001",
    "house_id": 3,
    "house_blok": "A",
    "house_nomor": "12",
    "house_alamat": "Jl. Melati No. 12",
    "house_status": "pribadi",
    "kepala_keluarga_id": 1,
    "kepala_keluarga_nama": "Budi Santoso",
    "kepala_keluarga_nik": "320xxxxxxxxxx001",
    "kepala_keluarga_nohp": "081234567890"
  }
]
```

---

### `GET /admin/datawarga`
> Ambil semua data warga. `nik` dan `family_nokk` otomatis di-masking (`320xxxxxxxxxx001`) oleh server.

**Method:** `GET`  
**URL:** `http://172.20.32.62:3333/admin/datawarga`

**Response Sukses (200):**
```json
[
  {
    "warga_id": 1,
    "nik": "320xxxxxxxxxx001",
    "nama": "Budi Santoso",
    "jenis_kelamin": "Laki-laki",
    "tgl_lahir": "1990-01-01",
    "status_hidup": "Hidup",
    "no_hp": "081234567890",
    "umur": 34,
    "family_id": 5,
    "family_nokk": "320xxxxxxxxxx001",
    "house_id": 3,
    "house_blok": "A",
    "house_nomor": "12",
    "house_alamat": "Jl. Melati No. 12",
    "house_status": "pribadi"
  }
]
```

---

### `PATCH /admin/resident/:id`
> Update nomor KK berdasarkan ID.

**Method:** `PATCH`  
**URL:** `http://172.20.32.62:3333/admin/resident/5`

**Request Body:**
```json
{
  "noKK": "3201234567890999"
}
```

---

### `POST /admin/reveal-warga/:id`
> Buka NIK warga lengkap dengan memasukkan password RT saat ini (Sudo Mode).

**Method:** `POST`  
**URL:** `http://172.20.32.62:3333/admin/reveal-warga/1`  
**Request Body:**
```json
{
  "password": "password_rt_yang_login_sekarang"
}
```

**Response Sukses (200):**
```json
{
  "nik": "3201234501010001"
}
```

---

### `POST /admin/reveal-resident/:id`
> Buka Nomor KK lengkap dengan memasukkan password RT saat ini (Sudo Mode).

**Method:** `POST`  
**URL:** `http://172.20.32.62:3333/admin/reveal-resident/5`  
**Request Body:**
```json
{
  "password": "password_rt_yang_login_sekarang"
}
```

**Response Sukses (200):**
```json
{
  "no_kk": "3201234567890001"
}
```

---

## 🗺️ Ringkasan Alur

```
[Form Tambah Rumah]
      │
      ▼
POST /admin/house
{ blok, nomor, alamat, status }
      │
      │  Simpan insertId → house_id
      ▼
[Form Tambah Kartu Keluarga]
      │
      ▼
POST /admin/resident
{ noKK, home: house_id, KepalaKeluarga }
      │
      │  Simpan insertId → family_id
      ▼
[Form Tambah Data Warga]
      │
      ▼
POST /admin/datawarga
{ nik, nama, jenisKelamin, tglLahir,
  statusHidup, noHp, umur,
  fammilyId: family_id,
  houseId: house_id }
      │
      ▼
✅ Data warga berhasil tersimpan!
```

---

## ❗ Hal Penting yang Sering Bikin Salah

1. **Urutan jangan dibalik** — house dulu, baru resident, baru warga.
2. **`KepalaKeluarga`** — huruf `K` besar, bukan `kepalaKeluarga`.
3. **`fammilyId`** — ada **2 huruf `m`** (`fammily`), bukan `family`. Ikuti saja yang ada.
4. **`status` di `/house`** — hanya boleh `"kontrak"` atau `"pribadi"`, selain itu error.
5. **`insertId`** dari setiap response harus disimpan untuk dipakai di form berikutnya.
6. **Jangan enkripsi data di frontend** — enkripsi sudah ditangani otomatis oleh server.
7. **Rate Limiting** — Route login/reveal dibatasi maksimal 10 request per 15 menit. Route umum dibatasi 200 request per 15 menit.

---

*Server berjalan di `http://172.20.32.62:3333`. Kalau ada yang bingung, tanya tim backend! 🚀*
