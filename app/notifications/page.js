import Link from 'next/link';
import {requireUser} from '../../lib/auth.mjs';
import pool from '../../lib/db.mjs';
import Shell,{Empty,dateText} from '../ui';
import {readNotifications} from '../work-actions';
export default async function Notifications({searchParams}){
 const user=await requireUser(),q=await searchParams;
 const rows=(await pool.query('SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',[user.id])).rows;
 return <Shell user={user} active="/notifications" title="Kabar terbaru untuk Anda." subtitle="Status, pengingat tenggat dan eskalasi tersimpan di sini." query={q}><section className="card"><form action={readNotifications}><button className="secondary">Tandai semua sudah dibaca</button></form>{rows.length?rows.map(n=><article key={n.id} className={'notification '+(!n.read_at?'unread':'')}><h2>{n.request_id?<Link href={'/requests/'+n.request_id}>{n.subject}</Link>:n.subject}</h2><p>{n.message}</p><small>{dateText(n.created_at)} · Email: {({pending:'Dalam antrean',sent:'Terkirim',unavailable:'Belum tersedia',failed:'Gagal — akan dicoba ulang'})[n.email_status]}</small></article>):<Empty>Belum ada notifikasi.</Empty>}</section></Shell>
}
