# Anargya FAB — versi sederhana

Aplikasi keuangan tim berbahasa Indonesia. Fokus hanya pada **pengajuan → verifikasi FO → persetujuan Lead → pencairan**, dengan anggaran per divisi dan jurnal double-entry otomatis. Dibangun ulang untuk menggantikan alur versi sebelumnya yang terlalu banyak fitur.

## Menu yang tersedia

- **Pengajuan**: buat + upload nota dalam satu form, lihat status, edit/ganti nota sebelum verifikasi, minta perbaikan, batalkan sebelum verifikasi, verifikasi FO, Approve/Reject oleh Lead, dan pembayaran penuh/sebagian dengan bukti transfer.
- **Keuangan** (FO/Lead/Admin): saldo kas, cost center/divisi dinamis, anggaran Gen 8, hutang belum lunas, jurnal otomatis, penerimaan dana, CoA, dan laporan Excel.
- **Anggota** (Admin): tambah/edit anggota, reset password, hapus akses/aktifkan kembali, serta data dummy.
- **Panduan** dan **Akun saya**.

Tidak ada menu urgent, advance, sanksi, nota hilang, inventaris, carry-over, atau serah terima pada alur baru. Aplikasi tidak menggunakan OCR atau integrasi transfer bank. Fitur piutang sponsor, periode akuntansi multi-tahun, reversal mandiri dan PO/penerimaan gudang belum termasuk versi sederhana ini.

## Peran

| Peran di aplikasi | Kode kompatibilitas | Fungsi |
| --- | --- | --- |
| Staff | ANGGOTA (HOD lama juga Staff/Koordinator) | Pengajuan sendiri |
| Financial Operation | FA | Verifikasi, pembayaran, penerimaan kas, baca jurnal |
| Financial Lead | GM | Persetujuan, anggaran dan CoA |
| Admin | ADMIN | Akun, anggaran dan CoA; tidak otomatis menyetujui/mencairkan |

Pengusul, verifikator, penyetuju dan pencair wajib berbeda orang. Empat akun dibutuhkan untuk simulasi alur lengkap. Password tersimpan sebagai salted scrypt; sesi HttpOnly dan pemeriksaan hak akses dilakukan di server.

## Menjalankan lokal

Node.js 24 dan PostgreSQL 17 direkomendasikan. Pasang Docker bila memakai database lokal melalui helper.

```bash
cp .env.example .env.local
# Isi DATABASE_URL, ADMIN_INITIAL_PASSWORD dan SETUP_SECRET melalui editor lokal.
npm ci
node --env-file=.env.local scripts/setup.mjs
npm run build
npm start
```

Helper `./scripts/prepare-local.sh` juga tersedia. Login awal `FAB` dengan nilai `ADMIN_INITIAL_PASSWORD`. Password tidak ditulis di repository.

1. Admin menambah divisi dan menetapkan anggaran di Keuangan; tidak ada plafon fiktif yang dianggap saldo kas.
2. Admin menambah akun Staff, dua FO, dan Lead.
3. FO mencatat dana yang benar-benar masuk melalui Keuangan → Catat penerimaan dana.
4. Staff mengirim pengajuan beserta nota; FO memverifikasi; Lead menyetujui; FO lain mencairkan.

Untuk dummy: Admin → Coba dengan data dummy. Isi password sendiri; sistem membuat `contoh.staff`, `contoh.fo`, `contoh.lead`, `contoh.pencair` dan dua pengajuan PDF. Tidak menambahkan anggaran atau kas fiktif. Data contoh muncul dalam laporan sehingga sebaiknya dicoba di project percobaan.

## Vercel + Supabase

Ikuti [panduan hosting](docs/VERCEL-SUPABASE.md). Tidak memerlukan ZIP. Login memakai database aplikasi, bukan Supabase Auth. Storage harus private; `service_role` hanya di environment server. `.env.local`, data bank dan API key tidak boleh di-commit.

## Upgrade dari versi lama

Migrasi aditif dijalankan otomatis saat halaman baru dibuka. Pengajuan dan dokumen lama tidak dihapus: tersedia melalui Arsip versi lama di halaman Pengajuan. Arsip bersifat read-only dan tidak diposting ulang ke jurnal baru. Buku kas lama menjadi saldo pembukaan satu kali; **rekonsiliasikan dengan rekening bank**. Hutang/pengajuan lama yang belum selesai harus ditinjau sebelum membuat pengajuan pengganti agar tidak dibayar dua kali. Anggaran versi baru dimulai dari nol sampai Lead/Admin menetapkannya.

Master divisi dapat menampung 12 divisi atau lebih. Nama dan pembagian Rp1,8 miliar harus diisi tim sendiri; tiga kelompok lama tidak dianggap sebagai daftar final 12 divisi. Anggaran versi sederhana memakai satu periode Gen 8, bukan reset tahunan otomatis.

## Pengujian

```bash
npm test
node --env-file=.env.local tests/run-simple.mjs
npm run build
node --env-file=.env.local tests/run-simple.mjs --browser
```

Runner membuat database sementara lokal dan Storage sementara, lalu menghapus keduanya; tidak menguji atau mengubah Supabase produksi. Browser memerlukan Chromium (`CHROMIUM_PATH` opsional). Detail desain dan keterbatasan ada pada [arsitektur](docs/ARCHITECTURE.md) dan [validasi](docs/VALIDATION.md).
