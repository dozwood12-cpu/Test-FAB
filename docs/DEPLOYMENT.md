# Deployment, email, backup dan pemulihan

## Syarat link publik

Diperlukan mesin Linux/VPS dengan Docker Compose, domain yang mengarah ke IP mesin, port 80/443 terbuka, dan kapasitas awal sekitar 2 vCPU / 4 GB RAM / disk persisten. Belum ada akun hosting atau domain yang diberikan/terhubung pada tugas ini. Link publik tidak dapat diterbitkan hanya dengan kode sumber atau snapshot lingkungan Codex. Jangan mengekspos database atau Mailpit ke Internet.

## Menjalankan paket Docker

1. Salin `.env.compose.example` menjadi `.env`. Isi POSTGRES_PASSWORD dengan nilai acak URL-safe dan ADMIN_INITIAL_PASSWORD melalui pengaturan rahasia server. Jangan masukkan file ini ke Git. Admin awal username FAB; setup berulang tidak mengganti kata sandi yang ada.
2. Jalankan `docker compose up -d --build`. Aplikasi tersedia pada port loopback sesuai APP_PORT, database tanpa port publik. Worker mulai setelah web siap.
3. Untuk domain publik: isi APP_DOMAIN (hostname tanpa skema), APP_URL dengan alamat HTTPS lengkap, dan COOKIE_SECURE=true. Arahkan DNS domain ke server. Jalankan `docker compose --profile https up -d --build`. Caddy mengelola sertifikat TLS dan meneruskan permintaan ke web.
4. Verifikasi `docker compose ps`, `docker compose logs --tail=50 web worker`, dan `/api/health` dari host. Login melalui domain, tambahkan anggota dan dua PIC sebenarnya, masukkan RAB/inventaris serta kas yang benar-benar tersedia.
5. Jalankan uji pembelian nonproduksi terpisah, bukan transaksi fiktif dalam buku kas nyata.

Aplikasi tidak menyediakan pendaftaran publik. Admin menambahkan akun. Untuk memenuhi pemisahan tugas, dibutuhkan minimal anggota pengusul, FA verifikator, GM, dan FA pencair yang berbeda. Admin tidak dapat melewati pembatasan ini.

## SMTP

Isi SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD dan SMTP_FROM pada environment server. Port 465 menggunakan SMTP_SECURE=true. Port 587 menggunakan SMTP_SECURE=false dan SMTP_REQUIRE_TLS=true. Jangan menonaktifkan verifikasi sertifikat. Pastikan domain pengirim memiliki SPF/DKIM sesuai penyedia email.

Untuk pengujian lokal, Mailpit di 127.0.0.1:1025 dengan SMTP_REQUIRE_TLS=false menerima pesan tanpa mengirim ke Internet. HTTP Mailpit di 127.0.0.1:8025 hanya untuk inspeksi internal. Ini bukan bukti email terkirim ke inbox ITS atau inbox anggota.

Worker berjalan setiap 10 detik. Outbox mencoba ulang kegagalan maksimum lima kali; status pengiriman terlihat di notifikasi. SMTP yang belum diatur ditampilkan sebagai belum tersedia dan akan diperiksa ulang. Bukti transfer dilampirkan pada email pencairan. APP_URL dipakai untuk tautan detail pengajuan dalam email. Pengiriman bersifat at-least-once; kegagalan proses setelah SMTP menerima email dapat menyebabkan pengiriman ulang.

## Backup

Backup harus mencakup database dan volume dokumen dalam satu titik waktu yang konsisten. Simpan salinan terenkripsi di luar host. Jangan menganggap ZIP serah terima sebagai backup pemulihan server.

Contoh maintenance terencana (jalankan dari direktori compose, melindungi berkas backup sebagai data sensitif):

```sh
mkdir -p backups
chmod 700 backups
docker compose stop web worker
docker compose exec -T db pg_dump -U fab -d fab -Fc > backups/fab.dump
docker compose run --rm --no-deps --entrypoint tar web -C /app/data -czf - uploads > backups/uploads.tgz
docker compose up -d web worker
```

Gunakan nama backup bertanggal pada operasional agar tidak menimpa backup lama. Verifikasi exit status dan ukuran berkas. Jadwalkan backup sesuai kebutuhan tim dan uji restore secara berkala.

Untuk restore pada lingkungan baru yang kosong, hentikan web/worker, pulihkan dump dengan pg_restore dan ekstrak uploads ke volume dokumen dengan kepemilikan uid 1000 (node), kemudian jalankan schema setup dan layanan. Jangan menggunakan `--clean` pada database berisi data pengguna tanpa rencana pemulihan dan persetujuan.

## Batasan operasional

- Saldo kas, bukti bank, dan stok inventaris memerlukan input manusia yang benar. Tidak ada API transfer bank atau sinkronisasi rekening.
- Foto dicek format, ukuran, resolusi dan kontras dasar; keterbacaan/keaslian akhirnya diverifikasi FA. PDF valid maksimal 50 halaman; belum ada pemindaian malware/OCR.
- Pencarian duplikasi dan splitting menggunakan normalisasi nama toko/tujuan, bukan identitas merchant universal.
- FAQ dan dua slot PIC tersedia; Admin harus memasukkan kontak tim yang benar. Tidak dibuat identitas atau nomor kontak fiktif sebagai PIC nyata.
- Dokumen menggunakan volume lokal persisten; jangan menjalankan beberapa replika web dengan disk yang berbeda. Enkripsi volume dan backup dilakukan di infrastruktur hosting.
- Arsip audit eksternal dengan retensi terkunci dan kanal WhatsApp/Line belum dikonfigurasi.

## Build di lingkungan cloud dengan proxy

BuildKit pada lingkungan onboarding ini tidak dapat menyelesaikan hostname proxy bawaan melalui DNS-nya sendiri. Helper `node scripts/build-cloud-image.mjs` menggunakan alamat DNS proxy yang sudah disediakan lingkungan dan sertifikat CA dari NODE_EXTRA_CA_CERTS sebagai BuildKit secret. Tidak menonaktifkan TLS atau mengganti checksum paket. Pada hosting biasa tanpa proxy, gunakan build Compose standar. Sertifikat/proxy lokal tidak disalin ke image runtime.

## Snapshot lingkungan onboarding

`data/bootstrap.dump` adalah cadangan bootstrap lokal yang diabaikan Git dan tidak dimasukkan ke image. Pemulihannya telah diuji ke database sementara. `scripts/prepare-local.sh` hanya memulihkannya bila database lokal benar-benar kosong; data yang sudah ada tidak ditimpa. Ini bukan pengganti backup berkala untuk penggunaan operasional.
