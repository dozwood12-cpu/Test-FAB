import SubmitButton from '../submit-button';
import {requireUser} from '../../lib/auth.mjs';
import Shell,{Field} from '../ui';
import {password} from '../simple-actions';
export default async function Account({searchParams}){const user=await requireUser();return <Shell user={user} active="/account" title="Akun saya" subtitle={user.name+' · '+user.username} query={await searchParams}><section className="card narrow"><h2>Ganti password</h2><form action={password}><Field name="old" label="Password saat ini" type="password"/><Field name="password" label="Password baru" type="password" minLength={8} maxLength={128}/><SubmitButton>Simpan password</SubmitButton></form><p className="muted">Semua sesi akan diakhiri setelah password diganti.</p></section></Shell>}
