export const maxDuration=60;
import {requireUser} from '../../../lib/auth.mjs';
import {ensureSimple,pool} from '../../../lib/simple/db.mjs';
import {finance} from '../../../lib/simple/core.mjs';
import Shell from '../../ui';
import RequestForm from './form';
export default async function New({searchParams}){const user=await requireUser();await ensureSimple();const centers=(await pool.query('SELECT * FROM cost_centers WHERE active AND ($1::boolean OR name=$2) ORDER BY name',[finance(user),user.division])).rows;return <Shell user={user} active="/requests" title="Buat pengajuan" subtitle="Isi pembelian dan upload nota. Setelah dikirim, FO memverifikasi." query={await searchParams}><section className="card narrow">{centers.length?<RequestForm centers={centers}/>:<p>Divisi Anda belum aktif. Hubungi Admin untuk menetapkan divisi akun melalui menu Anggota.</p>}</section></Shell>}
