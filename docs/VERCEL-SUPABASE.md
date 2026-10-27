# Online dengan Vercel Hobby dan Supabase Free

Konfigurasi ini untuk mencoba aplikasi dalam kuota gratis layanan masing-masing. Tidak menjanjikan kapasitas tanpa batas atau SLA urgent; periksa ketentuan dan kuota terbaru penyedia saat mendaftar. Jangan memakai blueprint Render jika ingin mengikuti jalur ini.

## 1. Siapkan GitHub

Kode berada di branch **main** pada `dozwood12-cpu/Test-FAB`. Branch unduhan ZIP bukan branch yang digunakan panduan deployment ini. Di GitHub Settings, ubah **Default branch** menjadi **main**. Ini juga diperlukan agar penjadwal GitHub Actions berjalan dari kode yang benar. Jangan menghapus branch unduhan atau perubahan milik Anda.

## 2. Buat project Supabase

1. Buat **New project** pada organisasi dengan plan Free. Pilih Singapore jika tersedia.
2. Tentukan dan simpan password database secara aman. Jika menggunakan karakter khusus pada password, password dalam connection string perlu di-URL-encode.
3. Pada **Connect**, pilih connection string **Transaction pooler** (umumnya port 6543). Salin URL PostgreSQL, lalu ganti placeholder password dengan password database. Gunakan URL ini untuk DATABASE_URL di Vercel. Jangan gunakan anon key sebagai password database dan jangan kirim URL berpassword ke chat.
4. Cari **Project URL** (format `https://<project-ref>.supabase.co`) pada pengaturan API/Data API. Ini nilai SUPABASE_URL; bukan URL halaman dashboard Supabase.
5. Pada pengaturan API keys, buka **Legacy API Keys** dan salin key **service_role** untuk SUPABASE_SERVICE_ROLE_KEY. Ini rahasia server, berbeda dari anon/publishable key. Jangan menggunakan awalan NEXT_PUBLIC untuk key ini dan jangan memasukkannya ke kode GitHub.
6. Buka **Storage → New bucket**, buat bucket bernama **fab-documents**, dan biarkan **Public bucket mati**. Izinkan JPEG, PNG, WebP, PDF, application/zip, dan application/vnd.openxmlformats-officedocument.spreadsheetml.sheet jika mengaktifkan pembatasan MIME. ZIP diperlukan untuk ekspor laporan/serah terima. Batas file bucket minimal 40 MB agar arsip ekspor dapat disimpan; batas unggah anggota tetap 3 MB pada Vercel.

File hanya diakses melalui pemeriksaan izin aplikasi dan signed URL berumur pendek. Tidak perlu membuat policy Storage yang mengizinkan semua pengguna membaca/menulis. Akun anggota adalah akun database aplikasi, bukan Supabase Auth.

## 3. Impor ke Vercel

1. Buka **Add New → Project**, hubungkan GitHub dan pilih **Test-FAB**.
2. Pastikan branch produksi **main** dan Framework **Next.js**. Root directory tetap root repo. Build command `npm run build`; jangan menjalankan database setup di build command. Gunakan Node.js 24.
3. Pada **Environment Variables**, masukkan nilai berikut untuk Production:

| Nama | Nilai |
|---|---|
| DATABASE_URL | Connection string Transaction pooler Supabase, termasuk password yang diisi dengan aman |
| STORAGE_DRIVER | `supabase` |
| SUPABASE_URL | Project URL Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Legacy service_role key, rahasia server |
| SUPABASE_STORAGE_BUCKET | `fab-documents` |
| ADMIN_INITIAL_PASSWORD | Kata sandi awal akun FAB yang Anda pilih |
| SETUP_SECRET | Kode acak minimal 32 karakter; berbeda dari kata sandi login |
| COOKIE_SECURE | `true` |
| CRON_SECRET | Kode acak minimal 32 karakter untuk pengingat otomatis |

Buat kode acak menggunakan password manager; jangan pakai nilai contoh publik sebagai secret. Jika ingin Preview deployment, gunakan project Supabase terpisah untuk percobaan, bukan database keuangan operasional.

4. Klik **Deploy** dan tunggu build berhasil. Buka URL HTTPS Production yang benar-benar diberikan Vercel. Jangan memakai deployment preview yang dilindungi login Vercel untuk akses anggota/penjadwal.

## 4. Penyiapan pertama

1. Buka `/setup` pada URL Production.
2. Masukkan kode SETUP_SECRET yang Anda simpan di Vercel; bukan service_role key dan bukan password database.
3. Klik **Siapkan database dan akun FAB**. Schema dibuat melalui koneksi privat; RLS dan pencabutan hak akses anon/authenticated melindungi tabel aplikasi dari akses publik Supabase.
4. Setelah diarahkan ke login, masuk dengan username **FAB** dan nilai ADMIN_INITIAL_PASSWORD Anda.
5. Tambahkan akun Anggota, FA verifikator, GM dan FA pencair berbeda untuk mencoba alur lengkap. Isi dua PIC, RAB, inventaris dan kas dengan data yang benar. Untuk demo gunakan akun/data fiktif yang jelas ditandai sebagai contoh.
6. Penyiapan berulang tidak mereset password atau menghapus data. Setelah sukses, SETUP_SECRET dapat dihapus dari environment Vercel lalu redeploy agar endpoint penyiapan tidak lagi dapat dipakai. Migrasi versi berikutnya perlu pengaturan rahasia kembali atau tooling setup privat.

Jika mendapat kegagalan verifikasi sertifikat PostgreSQL, ambil CA resmi project dari Supabase dan isi DATABASE_SSL_CA dengan PEM tersebut. TLS tetap diverifikasi; jangan menonaktifkan certificate verification. Jangan menempelkan seluruh log koneksi/connection string berpassword ke chat.

## 5. Pengingat otomatis

`vercel.json` menyediakan cron harian pukul 06.00 WIB sebagai cadangan. Pengingat lebih sering memakai GitHub Actions agar tidak mengandalkan proses worker yang terus hidup:

1. Pastikan default branch GitHub **main**.
2. Buka GitHub **Settings → Secrets and variables → Actions**.
3. Tambahkan `FAB_APP_URL` berisi URL HTTPS Production Vercel (tanpa `/login`) dan `FAB_CRON_SECRET` yang nilainya sama persis dengan CRON_SECRET di Vercel.
4. Buka **Actions → Pengingat Anargya FAB → Run workflow** untuk mencoba. Setelah itu jadwal meminta eksekusi sekitar setiap 30 menit. Jika deployment protection memblokirnya, pastikan URL Production dapat diakses anggota dan penjadwal tanpa login dashboard Vercel. Endpoint cron tetap memerlukan secret.
5. Admin juga dapat menjalankan antrean dari **Kebijakan → Jalankan pengingat sekarang**.

GitHub Actions/Vercel cron gratis bersifat best-effort: eksekusi bisa terlambat, berhenti karena kuota/inaktivitas, atau dibatasi penyedia. Ini **tidak menjamin SLA urgent 2–4 jam**. Gunakan scheduler/worker yang memiliki jaminan operasional sebelum memakai alur urgent untuk transaksi nyata.

## 6. Email dan dokumen

Notifikasi dalam aplikasi aktif tanpa penyedia email. Untuk mengirim ke inbox anggota, tambahkan SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM serta konfigurasi TLS yang sesuai penyedia di Vercel. SMTP juga punya kuota/ketentuan tersendiri. Tanpa SMTP, email ditampilkan belum tersedia.

Vercel memiliki batas request/response serverless. Karena itu:

- Upload anggota maksimal 3 MB per berkas pada Vercel; 10 MB tetap berlaku untuk instalasi lokal.
- Dokumen dan laporan cloud diunduh langsung dari Supabase melalui signed URL setelah izin diperiksa aplikasi.
- Ekspor serah terima besar dibagi menjadi beberapa ZIP, maksimal sekitar 40 MB per bagian; unduh semua bagian saat data tidak sedang diubah.
- Arsip ekspor sementara dibersihkan oleh penjadwal setelah satu hari. Jika penjadwal belum aktif, objek privat tersebut tetap memakai kuota Storage sampai dibersihkan.
- Ekspor masih dapat melewati batas waktu fungsi bila jumlah dokumen sangat banyak. Untuk serah terima operasional besar, gunakan backup/database tooling pada server sesuai docs/DEPLOYMENT.md.

## Status yang sudah dan belum diverifikasi

Adaptor Storage diuji dengan respons API tiruan dan database lokal; schema/RLS serta alur aplikasi diuji pada PostgreSQL lokal. Pengujian ini tidak membuktikan bucket, API key, pooler, email atau URL project Supabase/Vercel Anda sudah berfungsi. Validasi layanan nyata dilakukan setelah Anda membuat project dan mengisi variabel secara aman.
