export const maxDuration=60;
import {redirect} from 'next/navigation';
import {requireUser} from '../../../../lib/auth.mjs';
import {getRequest,finance} from '../../../../lib/simple/core.mjs';
import {ensureSimple,pool} from '../../../../lib/simple/db.mjs';
import Shell from '../../../ui';
import RequestForm from '../../new/form';
export default async function Edit({params,searchParams}){
 const user=await requireUser();await ensureSimple();const {id}=await params;const r=await getRequest(user,id);
 if(String(r.proposer_id)!==String(user.id)||!['Diajukan','Perlu Perbaikan'].includes(r.status))redirect('/requests/'+id);
 const centers=(await pool.query('SELECT * FROM cost_centers WHERE active AND ($1::boolean OR name=$2) ORDER BY name',[finance(user),user.division])).rows;
 const initial={...r,purchase_date:new Date(r.purchase_date).toISOString().slice(0,10),due_date:new Date(r.due_date).toISOString().slice(0,10)};
 return <Shell user={user} active="/requests" title="Edit pengajuan" subtitle={r.number+' · Perubahan akan diperiksa kembali oleh FO.'} query={await searchParams}><section className="card narrow"><RequestForm centers={centers} initial={JSON.parse(JSON.stringify(initial))}/></section></Shell>;
}
