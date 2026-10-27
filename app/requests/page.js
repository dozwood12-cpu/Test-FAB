import Link from 'next/link';
import {requireUser} from '../../lib/auth.mjs';
import pool from '../../lib/db.mjs';
import {statuses} from '../../lib/rules.mjs';
import Shell,{RequestTable} from '../ui';
export default async function Requests({searchParams}){
 const user=await requireUser(),q=await searchParams;
 const where=['TRUE'],args=[];
 if(!['FA','GM','ADMIN'].includes(user.role)){args.push(user.role==='HOD'?user.division:user.id);where.push(user.role==='HOD'?`r.division=$${args.length}`:`r.proposer_id=$${args.length}`);}
 if(statuses.includes(q.status)){args.push(q.status);where.push(`r.status=$${args.length}`);}
 if(q.q){args.push('%'+String(q.q).slice(0,100)+'%');where.push(`(r.number ILIKE $${args.length} OR r.title ILIKE $${args.length})`);}
 const rows=(await pool.query(`SELECT r.*,u.name AS proposer_name FROM requests r JOIN users u ON u.id=r.proposer_id WHERE ${where.join(' AND ')} ORDER BY submitted_at DESC LIMIT 200`,args)).rows;
 return <Shell user={user} active="/requests" title="Pengajuan" subtitle="Klik Buka detail untuk melihat nota dan memproses pengajuan." query={q}><section className="card"><h2>Yang perlu Anda lakukan</h2><p>{({ANGGOTA:'Buat pengajuan, unggah nota di halaman detail, lalu pantau statusnya di sini.',FA:'Buka pengajuan berstatus Diajukan untuk verifikasi. Pengajuan Disetujui dapat dicairkan oleh FA lain.',GM:'Buka pengajuan berstatus Diverifikasi untuk menyetujui atau menolak.',HOD:'Pantau kebutuhan dan pengajuan anggota divisi Anda.',ADMIN:'Kelola akun FA dan GM melalui Anggota & akses. Admin tidak memberi persetujuan pengajuan.'})[user.role]}</p></section><div className="toolbar spaced"><span>{rows.length} pengajuan ditampilkan · maksimal 200 terbaru</span>{user.division&&<Link href="/requests/new" className="button">＋ Buat pengajuan</Link>}</div><section className="card"><form className="filter" action="/requests"><input aria-label="Cari pengajuan" name="q" defaultValue={q.q} placeholder="Cari nomor atau judul"/><select aria-label="Filter status" name="status" defaultValue={q.status||''}><option value="">Semua status</option>{statuses.map(s=><option key={s}>{s}</option>)}</select><button>Terapkan</button></form><RequestTable rows={rows}/></section></Shell>
}
