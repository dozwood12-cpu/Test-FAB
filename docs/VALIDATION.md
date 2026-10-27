# Validasi implementasi — 27 Oktober 2026

Dilakukan pada lingkungan pengembangan, bukan deployment publik.

- Build Next.js berhasil.
- Enam unit test lulus: hash password, validasi anggota, tanggal akhir bulan/WIB, ambang jalur, jendela splitting, dan pemisahan tugas.
- Enam integration test PostgreSQL lulus: batas pengajuan, dokumen dan duplikasi, persetujuan bersamaan, advance, urgent/escalation idempotent, online evidence, nota hilang/cap, banding, audit append-only, email SMTP lokal, serta pengembalian sisa advance.
- Empat pengujian browser lulus: pengelolaan anggota dan pembelian sampai pencairan masing-masing pada desktop dan mobile. Termasuk penolakan akses dokumen milik anggota lain, Excel/PDF/ZIP, dan pemeriksaan halaman keuangan/katalog/panduan/notifikasi/audit/serah terima/akun.
- Seed data contoh dijalankan dua kali pada database uji dan selesai tanpa menggandakan pengajuan demo.
- `npm audit --omit=dev --audit-level=high` tidak menemukan kerentanan setelah override uuid untuk ExcelJS; ekspor Excel diuji setelah perubahan.
- Docker image berhasil dibangun dengan npm ci dan verifikasi TLS/checksum tetap aktif. Paket Compose web/worker/PostgreSQL dijalankan pada database dan volume uji terpisah.
- Login dan penambahan akun melalui image Docker berhasil; akun tetap ada setelah restart web/worker. Volume upload dapat ditulis oleh pengguna runtime non-root; akun dan berkas tetap ada setelah pembaruan image. Konfigurasi Caddy lolos validasi sintaks; sertifikat domain publik belum diterbitkan.
- Cadangan bootstrap database dipulihkan ke database sementara; akun FAB ditemukan. Database uji dibersihkan.

Keterbatasan: email diverifikasi dengan Mailpit lokal, bukan inbox anggota. Tidak ada layanan hosting/domain/SMTP produksi yang terhubung. Percobaan koneksi ke layanan tunnel sementara ditolak proxy jaringan (HTTP CONNECT 403). Tidak ada URL publik atau sertifikat domain produksi yang diterbitkan. Kontak PIC asli dan data operasional harus diisi Admin. Integrasi WhatsApp/Line dan arsip WORM eksternal belum dikonfigurasi.

## Persiapan deployment dari GitHub

Dockerfile.render berhasil dibangun. Entry point gabungan diuji pada PostgreSQL dan volume disk baru: login FAB berhasil, web/worker berjalan sebagai uid 1000, worker membuat limit mingguan, dan penghentian worker menyebabkan supervisor menghentikan web untuk restart. Startup ulang berhasil dengan akun yang sama. YAML blueprint berhasil diparse lokal; pembuatan layanan, biaya, health check publik, serta URL aktual Render belum diuji/diaktifkan karena akun hosting belum terhubung.

## Adaptasi Vercel dan Supabase

Sembilan unit test lulus, termasuk API Storage tiruan, signed URL, batas Vercel, dan secret setup. Delapan integration test lulus pada PostgreSQL lokal, termasuk RLS yang menolak pembacaan oleh role lain, lifecycle upload cloud tiruan, pembersihan arsip, dan SMTP Mailpit. Enam pengujian browser desktop/mobile lulus, termasuk endpoint setup/cron tanpa otorisasi, setup ulang yang menjaga password, serta pengajuan sampai pencairan dan ekspor. Build dengan VERCEL=1 berhasil dan SQL schema ditemukan dalam manifest tracing setup. Supabase/Vercel milik pengguna belum dikoneksikan; uji API tiruan bukan verifikasi layanan nyata.

Penyederhanaan navigasi: menu pendukung dikelompokkan di Menu lainnya; Beranda dan Pengajuan menampilkan petunjuk per peran, kolom langkah berikutnya dan tautan Buka detail. Halaman Admin `/admin/database` menyediakan pemeriksaan read-only dan penambahan dummy eksplisit. Uji browser tambahan memeriksa akses Admin, penambahan dummy berulang tanpa duplikasi atau kas, login demo dan penolakan akses anggota.
