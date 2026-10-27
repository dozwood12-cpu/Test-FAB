import {requireUser} from '../../../lib/auth.mjs';
import pool from '../../../lib/db.mjs';
import Shell,{Empty} from '../../ui';
import RequestForm from './form';
export default async function New({searchParams}){
 const user=await requireUser(),q=await searchParams;
 const rab=(await pool.query('SELECT r.id,r.code,r.title FROM rab_items r JOIN policy p ON p.generation=r.generation WHERE r.division=$1 AND r.active ORDER BY r.code',[user.division])).rows;
 return <Shell user={user} active="/requests" title="Ajukan kebutuhan tim." subtitle="Pilih item RAB, rincikan pembelian, lalu lengkapi buktinya." query={q}><section className="card">{!user.division?<Empty>Akun Anda belum memiliki divisi. Hubungi Admin.</Empty>:!rab.length?<Empty>Belum ada item RAB aktif untuk divisi Anda. Minta HOD, FA, atau Admin menambahkannya melalui RAB & inventaris.</Empty>:<RequestForm rab={rab}/>}</section></Shell>
}
