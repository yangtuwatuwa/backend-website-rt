# Backlog

## IPL publish: summary gagal setelah transaksi default sudah commit

- Status: keputusan desain diperlukan.
- Lokasi: `publishBillPeriodService()` di `services/iplBillingService.js`.
- Kondisi: pada jalur executor default, period dan batch bills di-commit sebelum
  broadcast notification dan query summary dijalankan.
- Dampak: jika query summary gagal, service mengembalikan response error meskipun
  period sudah berstatus `published` dan bills tetap tersimpan.
- Perbedaan: pada jalur executor injected, savepoint baru dilepas setelah summary
  berhasil sehingga kegagalan summary me-rollback publish, bills, dan notification.
- Keputusan tertunda: pertahankan sebagai known limitation atau ubah urutan
  transaksi agar response dan state database konsisten.

