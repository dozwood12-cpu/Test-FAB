import pool from './db.mjs';
import {weekWIB,todayWIB,monthDeadline,normalize,selectRoute,assertDistinct,positiveInteger,canView,splittingWindow} from './rules.mjs';
export async function transaction(fn) {
 const c=await pool.connect();try{await c.query('BEGIN'); const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function audit(c,actor,action,target,details={}) { await c.query('INSERT INTO audit_events(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)',[actor?.id||null,action,target||null,JSON.stringify(details)]); }
export async function notify(c,users,request,subject,message,key=null) {
 for(const id of [...new Set(users.filter(Boolean).map(String))]) await c.query('INSERT INTO notifications(user_id,request_id,subject,message,event_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING',[id,request?.id||null,subject,message,key?`${key}:${id}`:null]);
}
export async function notifyRole(c,role,r,subject,message,key=null,deputyOnly=false) {
 const users=(await c.query('SELECT id FROM users WHERE role=$1 AND active=true AND ($2::boolean=false OR deputy=true)',[role,deputyOnly])).rows;
 await notify(c,users.map(u=>u.id),r,subject,message,key);
}
export async function event(c,r,actor,action,status,note='') {
 await c.query('INSERT INTO request_events(request_id,actor_id,action,from_status,to_status,note) VALUES($1,$2,$3,$4,$5,$6)',[r.id,actor?.id||null,action,r.status,status,note]);
 await audit(c,actor,action,r.id,{from:r.status,to:status,note});
 await notify(c,[r.proposer_id],r,`${r.number}: ${status}`,note||`Status pengajuan berubah menjadi ${status}.`);
}
export async function ensureBudget(c,p,week=weekWIB()) {
 // Serialize all budget creation and reservations across workers and requests.
 await c.query("SELECT pg_advisory_xact_lock(808008)");
 await c.query('INSERT INTO budget_weeks(week,total_limit) VALUES($1,$2) ON CONFLICT DO NOTHING',[week,p.total_weekly]);
 const prev=new Date(week+'T00:00:00Z');prev.setUTCDate(prev.getUTCDate()-7);
 for(const [division,key] of [['Mechanical','mechanical'],['Electrical','electrical'],['Non-Technical','nontechnical']]) {
  const previous=(await c.query('SELECT b.base_amount+b.adjustment-COALESCE((SELECT sum(amount) FROM budget_reservations r WHERE r.week=b.week AND r.division=b.division AND NOT r.released),0) AS unused FROM weekly_budgets b WHERE b.week=$1 AND b.division=$2',[prev.toISOString().slice(0,10),division])).rows[0];
  const carry=previous?Math.max(0,Math.min(Number(previous.unused),Math.floor(Number(p[key])*p.carry_percent/100))):0;
  await c.query('INSERT INTO weekly_budgets(week,division,base_amount,carry) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[week,division,p[key],carry]);
 }
 return week;
}
export async function getPolicy(c=pool) { return (await c.query('SELECT * FROM policy WHERE id=1')).rows[0]; }
export async function getRequest(user,id,c=pool,lock=false) {
 if(!/^\d+$/.test(String(id))) throw new Error('Pengajuan tidak ditemukan.');
 const r=(await c.query(`SELECT r.*,u.name AS proposer_name FROM requests r JOIN users u ON u.id=r.proposer_id WHERE r.id=$1 ${lock?'FOR UPDATE OF r':''}`,[id])).rows[0];
 if(!r||!canView(user,r)) throw new Error('Pengajuan tidak ditemukan atau Anda tidak memiliki akses.');
 return r;
}
export async function createRequest(user,data,{editId}={}) {
 return transaction(async c=>{
  let original;
  if(editId){original=await getRequest(user,editId,c,true);if(String(original.proposer_id)!==String(user.id)||!['Diajukan','Perlu Perbaikan'].includes(original.status))throw new Error('Hanya pengusul dapat mengedit sebelum verifikasi.');if(original.status==='Perlu Perbaikan'&&original.correction_due&&new Date(original.correction_due)<new Date())throw new Error('Batas waktu perbaikan sudah lewat. Hubungi PIC untuk peninjauan.');}
  if(!user.division) throw new Error('Akun harus memiliki divisi sebelum mengajukan.');
  const p=await getPolicy(c);const date=data.purchase_date;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw new Error('Tanggal tidak valid.');
  const due=monthDeadline(date);
  if(data.kind==='REIMBURSEMENT'&&(date>todayWIB()||due<todayWIB())) throw new Error('Pengajuan maksimal satu bulan sejak pembelian dan tidak boleh bertanggal masa depan.');
  if(data.kind==='ADVANCE'&&date<todayWIB()) throw new Error('Tanggal rencana advance tidak boleh di masa lalu.');
  if(!['MANUAL','ONLINE'].includes(data.channel)||!['ADVANCE','REIMBURSEMENT'].includes(data.kind)) throw new Error('Jenis pengajuan tidak valid.');
  for(const k of ['title','vendor','purpose','bank_details']) if(!data[k]?.trim()||data[k].length>1000) throw new Error('Judul, toko, tujuan dan rekening wajib diisi, maksimal 1.000 karakter.');
  const restricted=(await c.query("SELECT id FROM sanctions WHERE user_id=$1 AND level=3 AND active AND (until_date IS NULL OR until_date>=CURRENT_DATE)",[user.id])).rowCount;
  if(restricted) throw new Error('Pengajuan dibatasi oleh sanksi aktif. Hubungi GM untuk peninjauan.');
  if(!data.items?.length||data.items.length>25) throw new Error('Isi 1–25 item RAB.');
  let amount=0;const flags=[];
  for(const item of data.items) {
   positiveInteger(item.quantity,'Jumlah');positiveInteger(item.unit_price,'Harga');
   if(!item.component?.trim()||item.component.length>200) throw new Error('Nama komponen wajib diisi.');
   amount+=item.quantity*item.unit_price;
   const rab=(await c.query('SELECT * FROM rab_items WHERE id=$1 AND active AND division=$2 AND generation=$3',[item.rab_id,user.division,p.generation])).rows[0];
   if(!rab) throw new Error('Item RAB tidak aktif atau bukan milik divisi/generasi Anda.');
   const inventory=(await c.query('SELECT name,quantity FROM inventory WHERE lower(name) LIKE $1 AND quantity>0',[`%${item.component.toLowerCase()}%`])).rows;
   const history=(await c.query("SELECT DISTINCT r.number FROM request_items i JOIN requests r ON r.id=i.request_id WHERE lower(i.component) LIKE $1 AND r.status<>'Ditolak' LIMIT 5",[`%${item.component.toLowerCase()}%`])).rows;
   if(inventory.length) flags.push(`Inventaris tersedia untuk ${item.component}: ${inventory.map(x=>`${x.name} (${x.quantity})`).join(', ')}`);
   if(history.length) flags.push(`Riwayat ${item.component}: ${history.map(x=>x.number).join(', ')}`);
  }
  positiveInteger(amount);if(amount<10000) throw new Error('Minimum Rp10.000 per pengajuan. Gabungkan nota kecil.');
  // Group locks avoid concurrent submissions evading splitting detection.
  const vendor=normalize(data.vendor),purpose=normalize(data.purpose);
  await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${vendor}:${purpose}`]);
  const nearby=(await c.query("SELECT id,purchase_date,amount FROM requests WHERE vendor_key=$1 AND purpose_key=$2 AND purchase_date BETWEEN $3::date-6 AND $3::date+6 AND status<>'Ditolak' AND ($4::bigint IS NULL OR id<>$4)",[vendor,purpose,date,editId||null])).rows;
  const group=splittingWindow(date,amount,nearby);const aggregate=group.amount;
  if(aggregate>amount) flags.push(`Potensi splitting: total toko dan tujuan sama dalam jendela tujuh hari ${aggregate} rupiah. FA wajib meninjau.`);
  const route=selectRoute({urgent:data.urgent,amount,aggregate,threshold:p.direct_threshold});
  const values=[user.id,user.division,data.title,data.vendor,vendor,data.purpose,purpose,amount,date,data.kind,data.channel,route,data.bank_details,data.tracking_number||'',p.generation,JSON.stringify(p),JSON.stringify(flags),due,p.urgent_hours,data.note||''];
  const r=(await c.query(editId?"UPDATE requests SET division=$2,title=$3,vendor=$4,vendor_key=$5,purpose=$6,purpose_key=$7,amount=$8,purchase_date=$9,kind=$10,channel=$11,route=$12,bank_details=$13,tracking_number=$14,generation=$15,policy_snapshot=$16,flags=$17,purchase_due=$18,urgent_due=CASE WHEN $12='URGENT' THEN COALESCE(urgent_due,now()+($19::text||' hours')::interval) END,note=$20,status='Diajukan',correction_due=NULL WHERE id=$21 AND proposer_id=$1 RETURNING *":"INSERT INTO requests(proposer_id,division,title,vendor,vendor_key,purpose,purpose_key,amount,purchase_date,kind,channel,route,bank_details,tracking_number,generation,policy_snapshot,flags,purchase_due,urgent_due,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,CASE WHEN $12='URGENT' THEN now()+($19::text||' hours')::interval END,$20) RETURNING *",editId?[...values,editId]:values)).rows[0];
  if(editId){await c.query("UPDATE lost_receipts SET status='Menunggu',approver_id=NULL WHERE request_id=$1 AND status='Disetujui'",[editId]);const beforeItems=(await c.query('SELECT * FROM request_items WHERE request_id=$1',[editId])).rows;await audit(c,user,'REQUEST_CONTENT_CHANGED',editId,{before:original,itemsBefore:beforeItems,after:r,itemsAfter:data.items});await c.query('DELETE FROM request_items WHERE request_id=$1',[editId]);}
  for(const item of data.items) await c.query('INSERT INTO request_items(request_id,rab_id,component,quantity,unit_price) VALUES($1,$2,$3,$4,$5)',[r.id,item.rab_id,item.component,item.quantity,item.unit_price]);
  if(aggregate>Number(p.direct_threshold)&&group.ids.length) await c.query("UPDATE requests SET route='LANGSUNG',flags=flags||$2::jsonb WHERE id=ANY($1::bigint[]) AND status IN ('Diajukan','Diverifikasi','Perlu Perbaikan') AND route='REGULER'",[group.ids,JSON.stringify(['Kelompok pembelian melampaui ambang Pembelian Langsung.'])]);
  await event(c,original||r,user,editId?'REQUEST_EDITED':'SUBMIT','Diajukan',editId?'Pengajuan diubah oleh pengusul. Dokumen perlu diperiksa kembali.':'Pengajuan dibuat. Lengkapi seluruh bukti agar dapat diverifikasi.');
  await notifyRole(c,'FA',r,`Pengajuan baru ${r.number}`,`${r.title} — ${route}`);
  return r;
 });
}
export async function verifyRequest(user,id,decision,note,checklist) {
 if(user.role!=='FA') throw new Error('Hanya FA yang dapat memverifikasi.');
 return transaction(async c=>{
  const r=await getRequest(user,id,c,true);assertDistinct(r,user,'verify');
  if(r.status!=='Diajukan') throw new Error('Pengajuan tidak menunggu verifikasi.');
  if(!['verify','correct','reject'].includes(decision)) throw new Error('Keputusan tidak valid.');
  if(decision!=='verify'&&note.trim().length<10) throw new Error('Tuliskan alasan spesifik minimal 10 karakter.');
  if(decision==='verify') {
   if(!['rab','amount','readability','duplicates','inventory','completeness'].every(k=>checklist[k])) throw new Error('Seluruh checklist verifikasi wajib dipenuhi.');
   if(r.kind!=='ADVANCE') await validateDocuments(c,r);
  }
  const status={verify:'Diverifikasi',correct:'Perlu Perbaikan',reject:'Ditolak'}[decision];
  await c.query("UPDATE requests SET status=$2,verifier_id=CASE WHEN $2='Diverifikasi' THEN $3::bigint ELSE NULL END,verified_at=CASE WHEN $2='Diverifikasi' THEN now() ELSE NULL END,correction_due=CASE WHEN $2='Perlu Perbaikan' THEN now()+interval '3 days' ELSE NULL END,urgent_responded_at=COALESCE(urgent_responded_at,now()) WHERE id=$1",[id,status,user.id]);
  await c.query('INSERT INTO reviews(request_id,actor_id,decision,checklist,reasons) VALUES($1,$2,$3,$4,$5)',[id,user.id,decision,JSON.stringify(checklist),note]);
  await event(c,r,user,'VERIFY_'+decision.toUpperCase(),status,note);
  if(decision==='verify') await notifyRole(c,'GM',r,`Persetujuan ${r.number}`,'Dokumen sudah diverifikasi FA.');
 });
}
export async function validateDocuments(c,r) {
 const docs=(await c.query('SELECT * FROM documents WHERE request_id=$1 AND retired_at IS NULL',[r.id])).rows;
 const lost=(await c.query("SELECT id FROM lost_receipts WHERE request_id=$1 AND status='Disetujui'",[r.id])).rowCount;
 const types=new Set(docs.map(d=>d.category));
 if(!lost) {
  const receipts=docs.filter(d=>['NOTA','INVOICE'].includes(d.category));
  if(!receipts.length) throw new Error('Nota atau invoice wajib diunggah.');
  const total=receipts.reduce((sum,d)=>sum+Number(d.receipt_amount||0),0);
  const refunded=r.kind==='ADVANCE'?Number((await c.query("SELECT COALESCE(sum(amount),0) AS n FROM returns WHERE request_id=$1 AND status='Dikonfirmasi'",[r.id])).rows[0].n):0;
  if(total+refunded!==Number(r.amount)) throw new Error('Total nota/invoice ditambah pengembalian sisa advance terkonfirmasi harus sama dengan nominal pengajuan.');
  if(r.channel==='MANUAL'&&!receipts.every(d=>d.stamped)) throw new Error('Checklist stempel nota manual belum lengkap.');
 }
 if(r.channel==='ONLINE'&&(!types.has('FOTO_BARANG')||!types.has('TRACKING')||!r.tracking_number||(!lost&&!types.has('INVOICE')))) throw new Error('Pembelian online wajib memiliki invoice, foto barang, resi dan screenshot tracking.');
 if(docs.some(d=>['NOTA','INVOICE'].includes(d.category)&&!d.legible_confirmed)) throw new Error('Konfirmasi keterbacaan nota belum lengkap.');
}
export async function approveRequest(user,id,decision,note) {
 if(user.role!=='GM') throw new Error('Hanya GM atau wakil GM yang dapat menyetujui.');
 return transaction(async c=>{
  const r=await getRequest(user,id,c,true);assertDistinct(r,user,'approve');
  if(r.status!=='Diverifikasi') throw new Error('FA belum memverifikasi pengajuan.');
  if(!['approve','reject'].includes(decision)) throw new Error('Keputusan tidak valid.');
  if(decision==='reject'&&note.trim().length<10) throw new Error('Alasan penolakan wajib spesifik.');
  const p=await getPolicy(c);const week=await ensureBudget(c,p);
  if(decision==='approve') {
   if(r.route==='REGULER') {
    const b=(await c.query('SELECT * FROM weekly_budgets WHERE week=$1 AND division=$2 FOR UPDATE',[week,r.division])).rows[0];
    const used=Number((await c.query('SELECT COALESCE(sum(amount),0) AS n FROM budget_reservations WHERE week=$1 AND division=$2 AND NOT released',[week,r.division])).rows[0].n);
    const total=Number((await c.query('SELECT COALESCE(sum(amount),0) AS n FROM budget_reservations WHERE week=$1 AND NOT released',[week])).rows[0].n);
    if(used+Number(r.amount)>Number(b.base_amount)+Number(b.carry)+Number(b.adjustment)) throw new Error('Limit divisi terlampaui. Lakukan realokasi atau tunggu minggu berikutnya.');
    if(total+Number(r.amount)>Number((await c.query('SELECT total_limit FROM budget_weeks WHERE week=$1',[week])).rows[0].total_limit)) throw new Error('Limit total mingguan terlampaui. Carry-over tidak menaikkan plafon total.');
    await c.query('INSERT INTO budget_reservations(request_id,week,division,amount) VALUES($1,$2,$3,$4)',[r.id,week,r.division,r.amount]);
   } else if(note.trim().length<10) throw new Error('Pembelian Langsung/urgent memerlukan catatan sumber dana dan alasan persetujuan minimal 10 karakter.');
   // Cash already promised to other approved requests must remain available.
   const balance=Number((await c.query("SELECT COALESCE(sum(CASE WHEN kind='KELUAR' THEN -amount ELSE amount END),0) AS n FROM cash_entries")).rows[0].n);
   const promised=Number((await c.query("SELECT COALESCE(sum(amount),0) AS n FROM requests WHERE status='Disetujui'")).rows[0].n);
   if(balance-promised<Number(r.amount)) throw new Error('Kas tersedia tidak cukup setelah memperhitungkan pengajuan yang sudah disetujui.');
  }
  const status=decision==='approve'?'Disetujui':'Ditolak';
  await c.query("UPDATE requests SET status=$2,approver_id=$3,approved_at=now(),funding_note=$4,payout_due=CASE WHEN $2='Disetujui' THEN now()+((policy_snapshot->>'payout_days')||' days')::interval END WHERE id=$1",[id,status,user.id,note]);
  await c.query('INSERT INTO reviews(request_id,actor_id,decision,reasons) VALUES($1,$2,$3,$4)',[id,user.id,decision,note]);
  await event(c,r,user,'GM_'+decision.toUpperCase(),status,note);
  if(decision==='approve') await notifyRole(c,'FA',r,`Antrean pencairan ${r.number}`,'Disetujui GM. Petugas pencair harus berbeda dari verifikator.');
 });
}
export async function payRequest(user,id,reference,documentId) {
 if(user.role!=='FA') throw new Error('Hanya petugas FA yang dapat mencairkan.');
 return transaction(async c=>{
  const r=await getRequest(user,id,c,true);assertDistinct(r,user,'pay');
  if(r.status!=='Disetujui') throw new Error('Pengajuan belum disetujui atau sudah dicairkan.');
  if(!reference.trim()) throw new Error('Referensi transfer wajib diisi.');
  const doc=(await c.query("SELECT id FROM documents WHERE id=$1 AND request_id=$2 AND category='BUKTI_TRANSFER' AND uploaded_by=$3",[documentId,id,user.id])).rows[0];
  if(!doc) throw new Error('Unggah bukti transfer terlebih dahulu menggunakan akun pencair.');
  await c.query('SELECT pg_advisory_xact_lock(808008)');
  const cash=Number((await c.query("SELECT COALESCE(sum(CASE WHEN kind='KELUAR' THEN -amount ELSE amount END),0) AS n FROM cash_entries")).rows[0].n);
  if(cash<Number(r.amount)) throw new Error('Saldo kas tidak mencukupi.');
  await c.query('INSERT INTO disbursements(request_id,actor_id,amount,reference,document_id) VALUES($1,$2,$3,$4,$5)',[id,user.id,r.amount,reference,documentId]);
  await c.query("INSERT INTO cash_entries(request_id,kind,amount,note,actor_id) VALUES($1,'KELUAR',$2,$3,$4)",[id,r.amount,reference,user.id]);
  await c.query("UPDATE requests SET status='Dicairkan',payer_id=$2,paid_at=now(),advance_due=CASE WHEN kind='ADVANCE' THEN now()+((policy_snapshot->>'advance_days')||' days')::interval END WHERE id=$1",[id,user.id]);
  await event(c,r,user,'PAY','Dicairkan',`Transfer ${reference}. Bukti tersedia di detail pengajuan.`);
 });
}
