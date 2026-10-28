'use client';
import {useFormStatus} from 'react-dom';
import {submit} from '../../simple-actions';
function Submit({editing}){const {pending}=useFormStatus();return <button disabled={pending}>{pending?'Menyimpan…':editing?'Simpan perubahan':'Kirim pengajuan'}</button>}
export default function RequestForm({centers,initial={}}){return <form action={submit} encType="multipart/form-data">
 {initial.id&&<input name="id" type="hidden" value={initial.id}/>}
 <label>Judul pembelian<input name="title" required maxLength={200} defaultValue={initial.title||''} placeholder="Contoh: Pembelian bearing roda"/></label>
 <div className="grid"><label>Divisi<select name="cost_center_id" defaultValue={initial.cost_center_id||centers[0]?.id} required>{centers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Nominal (Rp)<input name="amount" type="number" min={10000} max={100000000000} step={1} required defaultValue={initial.amount||''} placeholder="200000"/></label></div>
 <div className="grid"><label>Toko / vendor<input name="vendor" maxLength={200} defaultValue={initial.vendor||''} required/></label><label>Tanggal pembelian<input name="purchase_date" type="date" defaultValue={initial.purchase_date||''} required/></label></div>
 <label>Tujuan pembelian<textarea name="purpose" required maxLength={1000} rows={2} defaultValue={initial.purpose||''} placeholder="Untuk apa barang ini dibeli?"/></label>
 <label>Rekening penerima<input name="bank_details" required maxLength={300} defaultValue={initial.bank_details||''} placeholder="Bank · nomor rekening · nama penerima"/></label>
 <label>{initial.id?'Ganti nota / invoice (opsional)':'Nota / invoice'}<input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required={!initial.id}/></label><small>Foto utuh dan terbaca, minimal 400 × 400 piksel. JPG, PNG, WebP atau PDF. Nota belum dibaca otomatis.</small>
 <details style={{marginTop:20}}><summary>Jatuh tempo vendor (opsional)</summary><label>Tanggal jatuh tempo<input name="due_date" type="date" defaultValue={initial.due_date||''}/></label><small>Jika kosong, memakai tanggal pembelian. Tidak membatasi tanggal pencairan otomatis.</small></details>
 <Submit editing={!!initial.id}/>
 </form>}
