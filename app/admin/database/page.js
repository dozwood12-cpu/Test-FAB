import {redirect} from 'next/navigation';
import {requireUser} from '../../../lib/auth.mjs';
import pool from '../../../lib/db.mjs';
import Shell,{Field} from '../../ui';
import {createDemo} from '../../work-actions';
export const maxDuration=60;
export default async function Database({searchParams}){
 const user=await requireUser();if(user.role!=='ADMIN')redirect('/');
 const tables=['users','requests','documents','rab_items','inventory','audit_events','cash_entries'];
 const counts=await Promise.all(tables.map(async table=>({table,count:(await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n})));
 const checks=(await pool.query(`SELECT
 (SELECT count(*) FROM requests r LEFT JOIN users u ON u.id=r.proposer_id WHERE u.id IS NULL) AS orphan,
 (SELECT count(*) FROM requests WHERE proposer_id=verifier_id OR proposer_id=approver_id OR proposer_id=payer_id OR verifier_id=approver_id OR verifier_id=payer_id OR approver_id=payer_id) AS conflicts,
 (SELECT count(*) FROM pg_class WHERE oid IN ('users'::regclass,'requests'::regclass,'documents'::regclass) AND relrowsecurity) AS protected`)).rows[0];
 return <Shell user={user} active="/admin/database" title="Database & data contoh" subtitle="Pemeriksaan langsung pada database yang digunakan aplikasi ini." query={await searchParams}>
 <section className="card"><h2>Hasil pemeriksaan</h2><p>Koneksi database: berhasil · Pengajuan tanpa pengusul: {checks.orphan} · Pelanggaran pemisahan tugas: {checks.conflicts} · RLS tabel utama: {checks.protected}/3.</p><div className="tablewrap"><table><thead><tr><th>Tabel</th><th>Jumlah data</th></tr></thead><tbody>{counts.map(c=><tr key={c.table}><td>{c.table}</td><td>{c.count}</td></tr>)}</tbody></table></div><p className="muted">Pemeriksaan ini tidak mengecek isi berkas Storage atau kecocokan saldo rekening bank.</p></section>
 <section className="card spaced"><h2>Coba aplikasi dengan data dummy</h2><p>Membuat 6 akun demo, RAB tiga divisi, inventaris, dan 3 pengajuan contoh: reimbursement dengan nota PDF, dana muka, serta urgent. Tidak menambahkan saldo kas atau pencairan.</p><p><b>Data bertanda [CONTOH] tersimpan di database ini dan ikut muncul dalam daftar serta laporan. Gunakan project percobaan untuk memisahkan dari data tim.</b> Menjalankan ulang tidak menggandakan pengajuan atau mengganti password akun demo lama.</p><form action={createDemo}><Field label="Password untuk akun demo baru" name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password"/><label className="check"><input name="acknowledge" type="checkbox" required/> Saya memahami data contoh akan ditambahkan ke database ini.</label><button>Buat data dummy</button></form><h3>Akun untuk mencoba alur</h3><p>demo.anggota → membuat pengajuan dan upload nota<br/>demo.fa → verifikasi dokumen<br/>demo.gm → persetujuan akhir<br/>demo.pencair → pencairan<br/>demo.hod → pantau divisi · demo.wakil → wakil GM</p><p className="muted">Login memakai password yang Anda isi. Password tidak ditampilkan atau dikirim melalui email. Nonaktifkan akun demo melalui menu Anggota setelah selesai mencoba.</p></section></Shell>;
}
