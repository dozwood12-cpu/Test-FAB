import {redirect} from 'next/navigation';
import {requireUser} from '../../../../lib/auth.mjs';
import {getRequest} from '../../../../lib/workflow.mjs';
import pool from '../../../../lib/db.mjs';
import Shell from '../../../ui';
import RequestForm from '../../new/form';
export default async function Edit({params,searchParams}){
 const user=await requireUser(),{id}=await params;
 const r=await getRequest(user,id);
 if(String(r.proposer_id)!==String(user.id)||!['Diajukan','Perlu Perbaikan'].includes(r.status))redirect('/requests/'+id);
 const items=(await pool.query('SELECT * FROM request_items WHERE request_id=$1 ORDER BY id',[id])).rows;
 const rab=(await pool.query('SELECT r.id,r.code,r.title FROM rab_items r JOIN policy p ON p.generation=r.generation WHERE r.division=$1 AND r.active ORDER BY r.code',[user.division])).rows;
 const initial=JSON.parse(JSON.stringify({...r,items,purchase_date:new Date(r.purchase_date).toISOString().slice(0,10)}));
 return <Shell user={user} active="/requests" title="Edit pengajuan" subtitle={r.number} query={await searchParams}><section className="card"><p>Nomor dan dokumen tetap tersimpan. Setelah disimpan, pengajuan kembali menunggu verifikasi FA. Pastikan nota sesuai dengan perubahan.</p><RequestForm rab={rab} initial={initial}/></section></Shell>;
}
