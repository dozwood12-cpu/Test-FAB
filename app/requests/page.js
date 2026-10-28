import Link from 'next/link';
import {requireUser} from '../../lib/auth.mjs';
import {ensureSimple,pool} from '../../lib/simple/db.mjs';
import {finance,statuses,roles} from '../../lib/simple/core.mjs';
import Shell,{Status,Empty,money} from '../ui';
export default async function Requests({searchParams}){
 const user=await requireUser();await ensureSimple();const q=await searchParams;
 const params=[],where=[];if(!finance(user)){params.push(user.id);where.push(`r.proposer_id=$${params.length}`);}
 if(statuses.includes(q.status)){params.push(q.status);where.push(`r.status=$${params.length}`);}
 if(q.q){params.push('%'+String(q.q).slice(0,100)+'%');where.push(`(r.title ILIKE $${params.length} OR r.number ILIKE $${params.length})`);}
 const page=Math.max(1,Math.min(100000,Number.parseInt(q.page)||1));
 const condition=where.length?'WHERE '+where.join(' AND '):'';
 const count=Number((await pool.query('SELECT count(*) AS n FROM simple_requests r '+condition,params)).rows[0].n);
 const rows=(await pool.query(`SELECT r.*,u.name AS proposer_name,cc.name AS division,COALESCE((SELECT sum(amount) FROM simple_payments WHERE request_id=r.id),0) AS paid FROM simple_requests r JOIN users u ON u.id=r.proposer_id JOIN cost_centers cc ON cc.id=r.cost_center_id ${condition} ORDER BY r.created_at DESC,r.id DESC LIMIT 20 OFFSET $${params.length+1}`,[...params,(page-1)*20])).rows;
 const old=Number((await pool.query('SELECT count(*) AS n FROM requests '+(finance(user)?'':'WHERE proposer_id=$1'),finance(user)?[]:[user.id])).rows[0].n);
 const tasks=user.role==='FA'?[['Diajukan','Perlu diverifikasi'],['Disetujui','Siap dibayar']]:user.role==='GM'?[['Diverifikasi','Perlu persetujuan']]:[];
 return <Shell user={user} active="/requests" title="Pengajuan" subtitle={roles[user.role]+' · '+(user.role==='FA'?'Periksa nota atau cairkan pengajuan yang disetujui.':user.role==='GM'?'Tinjau pengajuan yang sudah diverifikasi FO.':'Ajukan pembelian, lalu pantau prosesnya di sini.')} query={q}>
 <div className="toolbar"><div className="tabs"><Link className={!q.status?'active':''} href="/requests">Semua</Link>{tasks.map(([status,label])=><Link className={q.status===status?'active':''} key={status} href={'/requests?status='+encodeURIComponent(status)}>{label}</Link>)}</div><Link className="button" href="/requests/new">＋ Buat pengajuan</Link></div>
 <section className="card"><form className="filter" action="/requests"><label>Cari<input name="q" defaultValue={q.q||''} placeholder="Nomor atau judul"/></label><label>Status<select name="status" defaultValue={q.status||''}><option value="">Semua status</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><button>Tampilkan</button></form></section>
 <p className="muted">{count} pengajuan · halaman {page}</p>{rows.length?rows.map(r=><article className="card request-card" key={r.id}><div><small>{r.number} · {r.division}</small><h2><Link href={'/requests/'+r.id}>{r.title}</Link></h2><small>{r.proposer_name}</small><Link href={'/requests/'+r.id}>Buka pengajuan →</Link></div><div className="right"><div className="amount">{money(r.amount)}</div><Status value={r.status}/>{Number(r.paid)>0&&<small>Dibayar {money(r.paid)}</small>}</div></article>):<section className="card"><Empty>Belum ada pengajuan. Klik Buat pengajuan untuk memulai.</Empty></section>}
 <div className="toolbar">{page>1&&<Link href={'/requests?'+new URLSearchParams({...q,page:String(page-1)})}>← Sebelumnya</Link>}{page*20<count&&<Link href={'/requests?'+new URLSearchParams({...q,page:String(page+1)})}>Berikutnya →</Link>}</div>
 {old>0&&<p className="muted">{old} pengajuan dari versi sebelumnya tetap tersimpan. <Link href="/history">Lihat arsip lama</Link></p>}
 </Shell>;
}
