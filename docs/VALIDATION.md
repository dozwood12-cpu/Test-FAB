# Validasi versi sederhana

Pemeriksaan dilakukan pada PostgreSQL lokal dan Storage sementara, bukan Supabase/Vercel pengguna. Pengujian cloud Storage memakai mock HTTP; koneksi provider nyata belum diverifikasi oleh lingkungan ini.

Pengujian domain `tests/simple/core.mjs`:
- Saldo pembukaan dari buku kas lama hanya dibukukan sekali.
- Pengajuan memerlukan nota, nominal minimum, tanggal sah dan cost center berwenang; edit mempertahankan nomor dan terkunci setelah verifikasi.
- Persetujuan membukukan hutang seimbang tanpa mengurangi kas; pembayaran sebagian/penuh melunasi hutang dan mengurangi kas.
- Pemisahan petugas, otorisasi dan idempotensi token pembayaran/penerimaan.
- Jurnal tidak seimbang gagal commit; jurnal posted menolak update, delete dan append baris dari transaksi lain.
- Persetujuan bersamaan tidak melewati plafon anggaran; anggaran tidak dapat diturunkan di bawah komitmen.
- Nota identik lintas pengajuan ditolak, pembatalan hanya sebelum verifikasi.
- Saldo tidak cukup membatalkan pembayaran, metadata berkas dan jurnal secara atomik.
- Dummy dapat dijalankan ulang tanpa menggandakan akun/pengajuan atau menambah kas/pembayaran.

Pengujian browser `tests/simple/browser/app.spec.mjs` pada desktop dan mobile:
- Submit beserta nota → edit → verifikasi FO → Approve Lead → pencairan FO berbeda.
- Dokumen hanya dapat diakses pemilik/keuangan; Staff ditolak dari halaman keuangan.
- Laporan XLSX berhasil dibuat; halaman utama tidak melebar keluar viewport.
- Admin tambah/edit anggota, reset password dan hapus akses; akun nonaktif gagal login.
- Setup berulang tidak membuat ulang Admin; endpoint setup/cron tanpa secret ditolak; API fitur yang dihentikan mengembalikan 410.

Unit test memeriksa password, helper aturan kompatibilitas, secret setup, serta adaptor Supabase private Storage dan batas upload Vercel. Aturan urgent/splitting pada unit helper merupakan kompatibilitas historis, bukan fitur alur baru.

Perintah: `npm test`, `node --env-file=.env.local tests/run-simple.mjs`, `npm run build`, `node --env-file=.env.local tests/run-simple.mjs --browser`.

Belum diverifikasi: bank aktual, layanan SMTP produksi, saldo rekening pengguna, migrasi pada Supabase pengguna dan deployment Vercel pengguna. Export untuk data sangat besar dapat dibatasi memori/durasi serverless; alur ini ditargetkan skala ribuan transaksi. Reversal, AR dan laporan PDF belum termasuk versi sederhana.

Pengujian tambahan membuktikan RLS menolak pembacaan data oleh role database non-owner dan, bila Mailpit diaktifkan, outbox pembayaran terkirim melalui SMTP lokal dengan bukti transfer. Hal ini tidak membuktikan pengiriman ke inbox produksi.

Uji cut-off memastikan stale deployment tidak bisa menambah mutasi buku kas atau pengajuan versi lama setelah saldo pembukaan dibuat. Pembacaan arsip tetap tersedia.
