# Anargya Gen 8 — FAB

Aplikasi web pengadaan dan reimbursement berbahasa Indonesia dengan Next.js 16, React 19 dan PostgreSQL 17. Responsif untuk desktop/mobile. Login menggunakan akun database yang ditambahkan Admin, sesuai keputusan tim.

**Untuk mencoba online dengan paket gratis:** ikuti [panduan Vercel + Supabase](docs/VERCEL-SUPABASE.md). Tidak perlu ZIP atau blueprint Render.

## Fitur

- Dashboard per peran, pengelolaan anggota, deaktivasi, reset kata sandi dan penetapan wakil GM.
- Pengajuan multi-item RAB, inventaris, minimum Rp10.000, limit mingguan dan carry-over terbatas, realokasi GM, serta riwayat status.
- Upload privat, validasi foto/PDF, hash nota ganda, kemiripan gambar, deteksi splitting dan jalur langsung/urgent.
- FA → GM → pencair FA berbeda. Checklist dan alasan penolakan, perbaikan tiga hari, banding, bukti transfer dan arsip nota fisik.
- Advance dan pengembalian sisa dana, nota hilang, retur, sanksi bertahap dan onboarding anggota.
- Notifikasi dalam aplikasi, outbox email, pengingat tenggat dan eskalasi urgent ke wakil GM.
- Saldo kas, reservasi dana, rekonsiliasi rekening bulanan, pembandingan RAB/pengajuan/pencairan, laporan Excel/PDF, audit append-only, FAQ dan dua slot PIC.
- ZIP serah terima seluruh data operasional dan dokumen tanpa hash kata sandi/sesi.

Arsitektur, diagram, halaman dan keputusan kebijakan: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Hosting, email dan backup: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Instalasi lokal

Prasyarat Node.js 24, Docker, dan checkout yang ada. Tidak perlu worktree baru.

```sh
npm ci --cache /tmp/fab-npm-cache
cp .env.example .env.local
docker run -d --name fab-postgres -e POSTGRES_USER=fab -e POSTGRES_DB=fab \
  -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:5432:5432 \
  -v fab-pgdata:/var/lib/postgresql/data postgres:17
```

Database `trust` hanya untuk pengembangan lokal dengan port loopback. Untuk produksi gunakan paket Compose yang mewajibkan password dan tidak menerbitkan port database.

Isi ADMIN_INITIAL_PASSWORD melalui environment proses secara aman untuk akun pertama, kemudian:

```sh
npm run setup
npm run build
npm start
# Terminal lain:
npm run worker
```

Admin awal username **FAB**. Kata sandi disimpan sebagai hash dan tidak ditulis ke kode. Setup berulang tidak mengubah password akun yang sudah ada. `/admin` mengharuskan login.

Untuk menjalankan ulang database yang sudah dibuat: `docker start fab-postgres`.

## Data contoh

Tetapkan DEMO_PASSWORD minimal delapan karakter melalui environment proses, lalu `npm run seed`. Script idempotent menambahkan akun `demo.anggota`, `demo.hod`, `demo.fa`, `demo.pencair`, `demo.gm`, `demo.wakil`, RAB/inventaris, serta pengajuan contoh. Semua diberi label **[CONTOH]**. Seed tidak memasukkan uang kas atau melakukan pencairan. Gunakan database demo terpisah dari data operasional.

## Email lokal

```sh
docker run -d --name fab-mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit:v1.27
```

Di `.env.local`, isi SMTP_HOST=127.0.0.1, SMTP_PORT=1025 dan SMTP_REQUIRE_TLS=false untuk Mailpit. Ini pengiriman ke kotak uji lokal, bukan inbox anggota. SMTP produksi harus memakai TLS dan konfigurasi pengirim yang benar. WhatsApp/Line opsional belum diintegrasikan.

## Pengujian otomatis

```sh
npm test
npm run test:integration
# Setelah build; Chromium tersedia pada /usr/bin/chromium atau CHROMIUM_PATH:
npm run test:e2e
# Termasuk pengujian email sungguhan ke SMTP lokal dan seed idempotent:
MAILPIT_TEST_URL=http://127.0.0.1:8025 node --env-file=.env.local tests/run-integration.mjs --browser --seed
```

Runner integrasi membuat database PostgreSQL lokal sementara `fab_test_<acak>` dan direktori dokumen sementara, kemudian membersihkan keduanya. Ia tidak menjalankan skenario finansial uji pada database operasional. Pemeriksaan email ditandai skipped jika Mailpit tidak diminta. Tes browser menguji login, anggota, alur pembelian sampai pencairan, batas akses, Excel/PDF/ZIP dan halaman mobile/desktop. Tes domain mencakup limit bersamaan, duplikasi, splitting, advance, sisa advance, urgent, nota hilang, banding dan audit.

## Deployment

Paket `Dockerfile`, `compose.yaml` dan Caddyfile menyediakan web, worker, PostgreSQL dan HTTPS opsional. Salin `.env.compose.example` menjadi `.env`, isi rahasia, lalu `docker compose up -d --build`. Untuk HTTPS gunakan domain yang diarahkan ke VPS dan profil `https` sesuai dokumentasi deployment.

**Belum ada URL publik:** lingkungan pengembangan ini belum terhubung ke akun hosting/domain. Build dan pengujian lokal tidak membuat deployment publik. Untuk operasional, Admin juga perlu memasukkan RAB, kas, kontak PIC sebenarnya dan akun petugas yang berbeda. Transfer bank tetap dilakukan petugas di bank, lalu dicatat di aplikasi.

## Online tanpa ZIP

Kode dapat dibangun langsung dari GitHub menggunakan blueprint Render (`render.yaml`). Ikuti [docs/RENDER.md](docs/RENDER.md). Akun hosting dan persetujuan biaya tetap diperlukan; menambahkan blueprint tidak menerbitkan URL publik.

## Vercel + Supabase untuk demo gratis

Ikuti [docs/VERCEL-SUPABASE.md](docs/VERCEL-SUPABASE.md). Storage privat Supabase menggantikan disk lokal, halaman `/setup` menyiapkan schema/akun awal dengan secret, dan penjadwal best-effort menggantikan worker tetap. Batas unggah Vercel 3 MB; dokumen/laporan menggunakan signed URL. Tidak menjamin SLA urgent pada paket gratis.
