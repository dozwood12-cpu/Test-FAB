import SubmitButton from '../../submit-button';
export const maxDuration=60;
import Link from 'next/link';
import {randomUUID} from 'node:crypto';
import {notFound} from 'next/navigation';
import {requireUser} from '../../../lib/auth.mjs';
import {ensureSimple,pool} from '../../../lib/simple/db.mjs';
import {getRequest} from '../../../lib/simple/core.mjs';
import {upload,decision,payment} from '../../simple-actions';
import Shell,{Status,money,dateText,Field} from '../../ui';
import {uploadLimit} from '../../../lib/storage.mjs';
function Id({id}){return <input name="id" type="hidden" value={id}/>}
export default async function Detail({params,searchParams}){
 const user=await requireUser();await ensureSimple();const {id}=await params;let r;try{r=await getRequest(user,id);}catch{notFound();}
 const own=String(r.proposer_id)===String(user.id),editable=own&&['Diajukan','Perlu Perbaikan'].includes(r.status);
 const canVerify=user.role==='FA'&&!own&&r.status==='Diajukan';
 const canApprove=user.role==='GM'&&!own&&String(r.verifier_id)!==String(user.id)&&r.status==='Diverifikasi';
 const canPay=user.role==='FA'&&!own&&![r.verifier_id,r.approver_id].map(String).includes(String(user.id))&&r.status==='Disetujui';
 const [files,events,payments,accounts]=await Promise.all([
 pool.query('SELECT * FROM simple_files WHERE request_id=$1 AND active ORDER BY created_at DESC',[id]),pool.query('SELECT e.*,u.name FROM simple_events e LEFT JOIN users u ON u.id=e.actor_id WHERE request_id=$1 ORDER BY e.created_at DESC,e.id DESC',[id]),pool.query('SELECT p.*,u.name FROM simple_payments p JOIN users u ON u.id=p.actor_id WHERE request_id=$1 ORDER BY p.created_at',[id]),pool.query("SELECT * FROM gl_accounts WHERE active AND type IN ('EXPENSE','ASSET') AND code<>'1100' ORDER BY code")]);
 return <Shell user={user} active="/requests" title={r.title} subtitle={r.number+' · '+r.proposer_name+' · '+r.division} query={await searchParams}>
 <Link href="/requests">← Semua pengajuan</Link><div className="toolbar"><div className="inline"><Status value={r.status}/><strong>{money(r.amount)}</strong></div>{editable&&<Link className="button secondary" href={'/requests/'+id+'/edit'}>Edit pengajuan</Link>}</div>
 {r.note&&<div className="notice"><b>Catatan petugas</b><p>{r.note}</p></div>}
 <div className="grid"><div><section className="card"><h2>Rincian pembelian</h2><dl><dt>Toko / vendor</dt><dd>{r.vendor}</dd><dt>Tujuan</dt><dd>{r.purpose}</dd><dt>Tanggal pembelian</dt><dd>{new Date(r.purchase_date).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})}</dd><dt>Jatuh tempo</dt><dd>{new Date(r.due_date).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})}</dd><dt>Rekening penerima</dt><dd>{r.bank_details}</dd>{r.approved_at&&<><dt>Target lunas</dt><dd>{dateText(new Date(new Date(r.approved_at).getTime()+7*86400000))}<small>Maksimal 7 hari kalender sejak persetujuan.</small></dd></>}<dt>Sudah dibayar</dt><dd>{money(r.paid)}</dd><dt>Sisa tagihan</dt><dd>{money(Number(r.amount)-Number(r.paid))}</dd></dl></section>
 <section className="card" id="documents"><h2>Nota & bukti transfer</h2>{files.rows.map(f=><div className="document" key={f.id}><a href={'/api/files/'+f.id} target="_blank" rel="noopener noreferrer">{f.name}</a><small>{f.kind==='NOTA'?'Nota / invoice':'Bukti transfer'} · {Math.ceil(f.size/1024)} KB</small></div>)}{editable&&<details style={{marginTop:20}}><summary>Ganti nota</summary><form action={upload} encType="multipart/form-data"><Id id={id}/><input name="kind" type="hidden" value="NOTA"/><Field label="Nota pengganti" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"/><small>Maksimal {uploadLimit()/1048576} MB. Versi lama tetap tersimpan dalam audit.</small><SubmitButton>Upload nota pengganti</SubmitButton></form></details>}</section>
 </div><div>
 {canVerify&&<section className="card"><h2>Verifikasi FO</h2><p>Periksa nota dan pastikan nominal, tujuan, serta anggaran divisi sesuai.</p><form action={decision}><Id id={id}/><label>Kategori pembukuan<select name="account_code" defaultValue={r.account_code}>{accounts.rows.map(a=><option key={a.code} value={a.code}>{a.name}</option>)}</select></label><label className="check"><input name="confirm" type="checkbox"/> Nota dan anggaran sudah saya periksa</label><label>Catatan<textarea name="note" rows={2} maxLength={1000} placeholder="Wajib diisi jika perlu perbaikan"/></label><div className="inline"><SubmitButton name="decision" value="verify">Verifikasi</SubmitButton><SubmitButton name="decision" value="correct" className="secondary">Minta perbaikan</SubmitButton></div></form></section>}
 {canApprove&&<section className="card"><h2>Persetujuan Lead</h2><p>Nota telah diperiksa FO. Persetujuan akan mencatat hutang dan memakai anggaran divisi.</p><form action={decision}><Id id={id}/><label>Catatan<textarea name="note" rows={2} maxLength={1000} placeholder="Wajib diisi jika ditolak"/></label><div className="inline"><SubmitButton name="decision" value="approve">Approve</SubmitButton><SubmitButton name="decision" value="reject" className="danger">Reject</SubmitButton></div></form></section>}
 {canPay&&<section className="card"><h2>Cairkan dana</h2><p>Transfer dana terlebih dahulu, lalu catat di sini. Jurnal dan saldo kas akan diperbarui otomatis.</p><form action={payment} encType="multipart/form-data"><Id id={id}/><input type="hidden" name="token" value={randomUUID()}/><Field label="Nominal pembayaran (Rp)" name="amount" type="number" min={1} max={Number(r.amount)-Number(r.paid)} defaultValue={Number(r.amount)-Number(r.paid)}/><Field label="Referensi transfer" name="reference" maxLength={200}/><Field label="Bukti transfer" name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"/><SubmitButton>Dana Dicairkan</SubmitButton></form><small>Pembayaran sebagian diperbolehkan. Status menjadi Dicairkan setelah lunas.</small></section>}
 {!canPay&&user.role==='FA'&&r.status==='Disetujui'&&<div className="notice">Pencairan dilakukan FO lain yang bukan pengusul, verifikator, atau penyetuju.</div>}
 {editable&&<div className="notice">{r.status==='Perlu Perbaikan'?'Klik Edit pengajuan untuk memperbaiki dan mengirim ulang.':'Pengajuan sudah dikirim. Menunggu verifikasi FO.'}</div>}
 {payments.rows.length>0&&<section className="card"><h2>Riwayat pembayaran</h2>{payments.rows.map(p=><p key={p.id}><b>{money(p.amount)}</b> · {p.reference}<small>{p.name} · {dateText(p.created_at)}</small></p>)}</section>}
 <details className="card"><summary>Riwayat proses</summary><ol className="timeline">{events.rows.map(e=><li key={e.id}><b>{e.action}</b>{e.note&&<p>{e.note}</p>}<small>{e.name||'Sistem'} · {dateText(e.created_at)}</small></li>)}</ol></details>
 {editable&&<details className="card"><summary>Batalkan pengajuan</summary><p>Pembatalan mempertahankan nomor dan riwayat, tetapi pengajuan tidak diproses lagi.</p><form action={decision}><Id id={id}/><Field label="Alasan pembatalan" name="note" minLength={5}/><SubmitButton className="danger" name="decision" value="cancel">Batalkan pengajuan ini</SubmitButton></form></details>}
 </div></div></Shell>;
}
