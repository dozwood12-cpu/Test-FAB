# Hosting gratis: Vercel + Supabase

Gunakan Next.js di Vercel Hobby serta PostgreSQL dan private Storage di Supabase Free. Paket gratis memiliki kuota dan dapat berhenti/pause; bukan jaminan layanan produksi. Tidak perlu membeli domain atau mengunduh ZIP.

## Supabase

1. Buat project baru dan simpan **Database Password**. Password ini bukan password login aplikasi.
2. Connect → **Transaction pooler** (biasanya port 6543). Salin connection string lengkap termasuk username pooler; ganti placeholder password dengan password database yang di-URL-encode.
3. Storage → buat bucket **fab-documents**, **Public dimatikan**. Bucket harus menerima JPEG, PNG, WebP, PDF serta XLSX untuk laporan; limit objek minimal 40 MB untuk ekspor. Upload nota anggota dibatasi 3 MB di Vercel.
4. Ambil Project URL dan **legacy service_role key** melalui pengaturan API. Kunci service_role hanya untuk server, bukan anon/publishable key dan jangan diberi awalan NEXT_PUBLIC.
5. Unduh CA certificate dari pengaturan SSL database bila diperlukan. Isi PEM lengkap digunakan pada DATABASE_SSL_CA. Verifikasi TLS tidak dimatikan.

## Vercel

Import repo Test-FAB, branch **main**, preset **Next.js**, root `./`, Node.js 24. Build `npm run build`; jangan menjalankan setup database saat build. Pastikan domain Production yang dibuka adalah milik deployment terbaru, bukan domain project lama.

Environment Variables **Production**:

| Nama | Nilai |
| --- | --- |
| DATABASE_URL | Connection string Transaction pooler Supabase dengan password database |
| STORAGE_DRIVER | supabase |
| SUPABASE_URL | URL HTTPS project Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Legacy service_role key, disimpan sebagai rahasia server |
| SUPABASE_STORAGE_BUCKET | fab-documents |
| ADMIN_INITIAL_PASSWORD | Password awal akun FAB pilihan pemilik |
| SETUP_SECRET | Kode acak minimal 32 karakter, berbeda dari password login |
| COOKIE_SECURE | true |
| CRON_SECRET | Kode acak minimal 32 karakter untuk worker email |
| DATABASE_SSL_CA | Opsional: seluruh isi PEM CA Supabase termasuk BEGIN/END CERTIFICATE |
| APP_URL | Opsional: URL HTTPS Production aplikasi |

Jangan memasukkan password/kunci ke chat atau repository. Setelah mengubah environment variables, **redeploy** agar deployment menggunakan nilai baru.

## Mulai menggunakan aplikasi

1. Untuk database baru: buka `/setup`, masukkan SETUP_SECRET, lalu login `FAB` dengan ADMIN_INITIAL_PASSWORD.
2. Admin membuka **Keuangan** untuk menambah cost center/divisi dan menetapkan anggaran Gen 8. Rp1,8 miliar bukan saldo kas; alokasi 12 divisi diisi sesuai keputusan tim.
3. Admin membuka **Anggota** untuk membuat Staff, FO verifikator, Financial Lead dan FO pencair. Keempat tugas harus dilakukan orang berbeda. Kode kompatibilitas FA = FO, GM = Lead.
4. FO mencatat kas yang benar-benar diterima melalui **Keuangan → Catat penerimaan dana**.
5. Staff mengirim form dan nota sekaligus. FO memverifikasi; Lead Approve/Reject; FO lain mencatat pencairan dengan bukti transfer. Jurnal dibuat otomatis.

Data dummy berada di **Anggota → Coba dengan data dummy**. Password ditentukan Admin. Empat akun `contoh.staff`, `contoh.fo`, `contoh.lead`, `contoh.pencair` dan dua pengajuan PDF dibuat tanpa kas/anggaran fiktif. Data ini tampil dalam laporan; gunakan project percobaan bila perlu pemisahan dari data asli.

## Upgrade versi lama

Tidak perlu menghapus database. Migrasi aditif berjalan otomatis ketika halaman utama baru dibuka. Akun/password lama tetap berlaku. Pengajuan dan dokumen lama tersedia sebagai **Arsip versi lama**, read-only; tidak diposting ulang ke GL baru. Saldo buku kas lama menjadi jurnal pembukaan satu kali, bukan bukti bank sudah cocok. Cocokkan saldo dan hutang/advance lama sebelum mulai transaksi asli. Hindari membuat ulang pengajuan lama yang sudah dibayar. Anggaran baru dimulai dari nol sampai ditetapkan Lead/Admin.

Jika migrasi gagal, lihat Vercel Logs. Jangan reset/drop database untuk mengatasi error. Backup database dan Storage sebelum upgrade; uji dahulu pada salinan staging bila memuat data operasional penting.

## Email opsional

Isi SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM; SMTP_REQUIRE_TLS default aktif dan SMTP_SECURE=true untuk port465. Tanpa SMTP aplikasi tetap berfungsi dengan status dan antrean tugas, tetapi email tidak terkirim.

`vercel.json` menjalankan `/api/cron` sekali sehari pukul 06.00 WIB. Vercel memakai CRON_SECRET. Worker hanya mengirim email versi sederhana dan membersihkan export kedaluwarsa; eskalasi urgent/sanksi versi lama dihentikan. Pengiriman SMTP belum tentu masuk inbox walau server menerima.

Workflow GitHub Actions opsional tersedia untuk interval sekitar 30 menit: isi secrets FAB_APP_URL dan FAB_CRON_SECRET serta repository variable FAB_REMINDERS_ENABLED=true. Default branch GitHub harus main. Actions menggunakan kuota dan jadwal bisa tertunda; tidak menjamin SLA. Akses domain aplikasi harus dapat dijangkau tim/worker tanpa Vercel dashboard login, sementara login aplikasi tetap wajib.

## Diagnosis

- 404 `/setup`: periksa domain, branch main, commit dan deployment Production.
- 28P01: username/password DATABASE_URL tidak cocok; salin pooler dan encode password dengan benar.
- SELF_SIGNED_CERT_IN_CHAIN: isi DATABASE_SSL_CA dengan PEM CA resmi Supabase dan redeploy.
- Anggaran tidak cukup: isi plafon cost center di Keuangan, bukan saldo kas.
- Saldo kas tidak cukup: FO mencatat penerimaan dana nyata; menambah budget tidak menambah uang.
- Tidak ada tombol pencairan: akun harus FO dan berbeda dari pengusul/verifikator/Lead.
