# Online langsung dari GitHub menggunakan Render

GitHub menyimpan source code. Aplikasi ini membutuhkan server Next.js, PostgreSQL dan disk persisten untuk foto nota; GitHub Pages tidak menjalankan komponen tersebut.

Blueprint `render.yaml` menyiapkan satu web service Docker dan satu PostgreSQL di Singapura, ditambah disk persisten 1 GB. Web dan worker berada pada instance yang sama agar keduanya dapat membaca bukti transfer pada disk yang sama. Entry point menyiapkan folder disk, kemudian menurunkan hak proses ke uid/gid 1000 sebelum menjalankan database setup, web, dan worker. Jika salah satu proses berhenti, proses lainnya dihentikan supaya hosting dapat memulai ulang layanan secara utuh.

**Biaya:** blueprint memakai web plan `starter`, database `basic-256mb`, dan disk persisten. Ini layanan berbayar, bukan klaim hosting gratis. Periksa nama plan, ketersediaan region dan estimasi biaya terbaru yang ditampilkan Render sebelum mengaktifkan resource. Menyimpan source code atau blueprint di GitHub tidak membuat resource hosting atau menimbulkan biaya hosting.

## Langkah pemilik akun

1. Buat/login akun Render di https://dashboard.render.com dan hubungkan akun GitHub yang dapat mengakses `dozwood12-cpu/Test-FAB`.
2. Pilih **New → Blueprint**, pilih repositori tersebut, lalu branch **main**. Render membaca `render.yaml` di root repositori.
3. Tinjau layanan dan biaya. Isi `ADMIN_INITIAL_PASSWORD` di formulir rahasia Render dengan kata sandi admin yang Anda pilih. Username awal tetap **FAB**. Jangan memasukkan password ke source code GitHub atau chat.
4. Jika setuju biaya dan konfigurasi, aktifkan deployment di Render. Tunggu database dan web selesai dibangun dan health check berhasil.
5. Buka URL HTTPS web service yang benar-benar diberikan Render. Buka `/login` atau `/admin`, masuk sebagai FAB, lalu tambahkan anggota dan PIC sebenarnya.

Source code sudah menyediakan Dockerfile dan migrasi schema otomatis. Tidak perlu mengunduh ZIP, menyalakan komputer lokal terus-menerus, atau membeli domain sendiri: Anda dapat menggunakan subdomain HTTPS dari hosting setelah deployment berhasil. Jangan menganggap nama service di blueprint sebagai URL yang sudah aktif; Render menentukan URL aktual.

## Setelah deployment

- Isi RAB, inventaris, dua PIC, dan kas yang benar-benar tersedia. Buat FA verifikator, GM, dan FA pencair berbeda dari pengusul.
- Tambahkan SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM pada Environment Render jika ingin email sampai ke inbox anggota. Gunakan TLS sesuai penyedia. Tanpa SMTP, notifikasi dalam aplikasi tetap tersedia dan email ditandai belum tersedia.
- APP_URL otomatis menggunakan RENDER_EXTERNAL_URL yang disediakan Render. Jika menggunakan domain sendiri, atur APP_URL menjadi URL HTTPS domain tersebut.
- Data anggota dan transaksi tersimpan pada PostgreSQL. Dokumen tersimpan di disk `/var/data/uploads`. Jangan menghapus database atau disk saat memperbarui aplikasi.
- Aktifkan dan uji backup sesuai docs/DEPLOYMENT.md. Membuat blueprint tidak membuktikan deployment atau pengiriman email produksi telah berhasil.
- Jangan memindahkan layanan ke paket tanpa disk persisten untuk data keuangan nyata; berkas pada filesystem sementara dapat hilang ketika layanan restart/deploy.
