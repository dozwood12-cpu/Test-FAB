import {transaction,getRequest,getPolicy,ensureBudget,event,audit,notify,notifyRole,validateDocuments} from './workflow.mjs';
import {positiveInteger,weekWIB} from './rules.mjs';
function requireRole(user,roles){if(!roles.includes(user.role))throw new Error('Anda tidak memiliki kewenangan untuk aksi ini.');}
function requiredNote(note){if(!note||note.trim().length<10)throw new Error('Alasan/catatan wajib diisi minimal 10 karakter.');}
export async function operateRequest(user,id,action,data={}) {
 return transaction(async c=>{
  const r=await getRequest(user,id,c,true);const own=String(r.proposer_id)===String(user.id);const note=data.note||'';
  if(action==='withdraw_document') {
   if(!own||!['Diajukan','Perlu Perbaikan'].includes(r.status))throw new Error('Dokumen hanya dapat diganti pengusul sebelum verifikasi.');
   const result=await c.query("UPDATE documents SET retired_at=now() WHERE id=$1 AND request_id=$2 AND retired_at IS NULL AND category NOT IN ('BUKTI_TRANSFER','BUKTI_REFUND') RETURNING id",[data.document_id,id]);if(!result.rowCount)throw new Error('Dokumen tidak dapat diganti.');
   await audit(c,user,'DOCUMENT_RETIRED',id,{document:data.document_id});
  } else if(action==='tracking') {
   if(!own||!['Diajukan','Perlu Perbaikan'].includes(r.status))throw new Error('Resi hanya dapat diperbarui sebelum verifikasi.');
   if(!data.tracking_number||data.tracking_number.length>100)throw new Error('Nomor resi wajib diisi maksimal 100 karakter.');
   await c.query('UPDATE requests SET tracking_number=$2 WHERE id=$1',[id,data.tracking_number]);await audit(c,user,'TRACKING_UPDATED',id);
  } else if(action==='resubmit') {
   if(!own||r.status!=='Perlu Perbaikan')throw new Error('Hanya pemilik pengajuan Perlu Perbaikan yang dapat mengirim ulang.');
   if(new Date(r.correction_due)<new Date())throw new Error('Batas perbaikan tiga hari telah lewat. Hubungi GM melalui banding.');
   requiredNote(note);await validateDocuments(c,r);
   await c.query("UPDATE requests SET status='Diajukan',verifier_id=NULL,approver_id=NULL,correction_due=NULL WHERE id=$1",[id]);
   await event(c,r,user,'RESUBMIT','Diajukan',note);await notifyRole(c,'FA',r,`Perbaikan ${r.number}`,note);
  } else if(action==='appeal') {
   if(!own||!['Ditolak','Perlu Perbaikan'].includes(r.status))throw new Error('Banding tersedia untuk pengajuan ditolak atau perlu perbaikan.');requiredNote(note);
   const attempts=(await c.query('SELECT count(*) AS n FROM appeals WHERE request_id=$1',[id])).rows[0].n;if(Number(attempts)>=3)throw new Error('Maksimal tiga banding per pengajuan.');
   await c.query('INSERT INTO appeals(request_id,reason) VALUES($1,$2)',[id,note]);
   await notifyRole(c,'GM',r,`Banding ${r.number}`,note);await audit(c,user,'APPEAL_SUBMITTED',id,{note});
  } else if(action==='appeal_accept'||action==='appeal_reject') {
   requireRole(user,['GM']);if(own)throw new Error('Tidak boleh memutus banding sendiri.');requiredNote(note);
   const appeal=(await c.query("SELECT * FROM appeals WHERE request_id=$1 AND status='Menunggu' FOR UPDATE",[id])).rows[0];if(!appeal)throw new Error('Tidak ada banding menunggu.');
   if(String(r.approver_id)===String(user.id))throw new Error('Banding harus ditangani GM/wakil yang berbeda dari penyetuju/penolak sebelumnya.');
   await c.query('UPDATE appeals SET status=$2,reviewer_id=$3,decision_note=$4 WHERE id=$1',[appeal.id,action==='appeal_accept'?'Diterima':'Ditolak',user.id,note]);
   if(action==='appeal_accept')await c.query("UPDATE requests SET status='Perlu Perbaikan',correction_due=now()+interval '3 days',verifier_id=NULL,approver_id=NULL WHERE id=$1",[id]);
   await event(c,r,user,action.toUpperCase(),action==='appeal_accept'?'Perlu Perbaikan':r.status,note);
  } else if(action==='lost') {
   if(!own||!['Diajukan','Perlu Perbaikan','Dicairkan'].includes(r.status))throw new Error('Kasus nota hilang hanya dapat dibuat pengusul pada tahap dokumen.');requiredNote(note);
   const docs=(await c.query("SELECT DISTINCT category FROM documents WHERE request_id=$1 AND category IN ('PERNYATAAN','MUTASI')",[id])).rows;
   if(docs.length<2)throw new Error('Unggah surat pernyataan dan bukti mutasi rekening terlebih dahulu.');
   // Serialize per-member cap across simultaneous requests.
   await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
   const count=Number((await c.query('SELECT count(*) AS n FROM lost_receipts l JOIN requests r ON r.id=l.request_id WHERE r.proposer_id=$1 AND r.generation=$2',[user.id,r.generation])).rows[0].n);
   if(count>=Number(r.policy_snapshot.lost_limit))throw new Error('Batas kasus nota hilang per generasi sudah tercapai.');
   await c.query('INSERT INTO lost_receipts(request_id,reason) VALUES($1,$2)',[id,note]);
   await audit(c,user,'LOST_RECEIPT_SUBMITTED',id,{note});await notifyRole(c,'GM',r,`Nota hilang ${r.number}`,note);
  } else if(action==='lost_approve'||action==='lost_reject') {
   requireRole(user,['GM']);if(own)throw new Error('Tidak boleh menyetujui kasus sendiri.');requiredNote(note);
   const result=await c.query("UPDATE lost_receipts SET status=$2,approver_id=$3 WHERE request_id=$1 AND status='Menunggu' RETURNING id",[id,action==='lost_approve'?'Disetujui':'Ditolak',user.id]);
   if(!result.rowCount)throw new Error('Tidak ada kasus nota hilang menunggu.');await event(c,r,user,action.toUpperCase(),r.status,note);
  } else if(action==='handoff') {
   requireRole(user,['FA']);if(own)throw new Error('Penerima nota tidak boleh pengusul.');if(!data.location?.trim())throw new Error('Lokasi arsip wajib diisi.');
   const sender=data.sender_id||r.proposer_id;if(!(await c.query('SELECT id FROM users WHERE id=$1 AND active',[sender])).rowCount)throw new Error('Penyerah nota tidak ditemukan.');
   await c.query('INSERT INTO receipt_handoffs(request_id,sender_id,receiver_id,location,status) VALUES($1,$2,$3,$4,$5)',[id,sender,user.id,data.location,data.archived?'Diarsipkan':'Diterima']);
   await audit(c,user,'PHYSICAL_RECEIPT_RECEIVED',id,{sender,location:data.location,status:data.archived?'Diarsipkan':'Diterima'});
  } else if(action==='return') {
   if(!own||r.status!=='Dicairkan')throw new Error('Retur hanya dapat diajukan pemilik setelah pencairan.');requiredNote(note);const amount=positiveInteger(data.amount);
   const existing=Number((await c.query('SELECT COALESCE(sum(amount),0) AS n FROM returns WHERE request_id=$1',[id])).rows[0].n);
   if(existing+amount>Number(r.amount))throw new Error('Total retur tidak boleh melampaui pencairan.');
   await c.query('INSERT INTO returns(request_id,amount,reason) VALUES($1,$2,$3)',[id,amount,note]);
   await notifyRole(c,'FA',r,`Retur ${r.number}`,note);await audit(c,user,'RETURN_SUBMITTED',id,{amount,note});
  } else if(action==='refund_confirm') {
   requireRole(user,['FA']);if(own)throw new Error('Pengusul tidak boleh mengonfirmasi pengembalian sendiri.');requiredNote(note);
   const ret=(await c.query("SELECT * FROM returns WHERE id=$1 AND request_id=$2 AND status='Menunggu' FOR UPDATE",[data.return_id,id])).rows[0];if(!ret)throw new Error('Retur tidak ditemukan atau sudah dikonfirmasi.');
   if(!(await c.query("SELECT id FROM documents WHERE request_id=$1 AND category='BUKTI_REFUND'",[id])).rowCount)throw new Error('Bukti pengembalian dana wajib diunggah.');
   await c.query('SELECT pg_advisory_xact_lock(808008)');
   await c.query("UPDATE returns SET status='Dikonfirmasi',confirmer_id=$2 WHERE id=$1",[ret.id,user.id]);
   await c.query("INSERT INTO cash_entries(request_id,kind,amount,note,actor_id) VALUES($1,'REFUND',$2,$3,$4)",[id,ret.amount,note,user.id]);
   await event(c,r,user,'REFUND_CONFIRMED',r.status,`${ret.amount} rupiah kembali ke kas. ${note}`);
  } else if(action==='settle_verify') {
   requireRole(user,['FA']);if(own||String(user.id)===String(r.payer_id))throw new Error('Pemeriksa pertanggungjawaban tidak boleh pengusul atau pencair.');
   if(r.kind!=='ADVANCE'||r.status!=='Dicairkan'||r.settled_at)throw new Error('Tidak ada pertanggungjawaban advance terbuka.');
   await validateDocuments(c,r);requiredNote(note);
   await c.query('UPDATE requests SET settlement_verifier_id=$2 WHERE id=$1',[id,user.id]);await event(c,r,user,'ADVANCE_VERIFIED',r.status,note);await notifyRole(c,'GM',r,`Pertanggungjawaban ${r.number}`,note);
  } else if(action==='settle_approve') {
   requireRole(user,['GM']);if(own||String(user.id)===String(r.settlement_verifier_id)||!r.settlement_verifier_id)throw new Error('Pertanggungjawaban harus diverifikasi FA dan disetujui orang berbeda.');
   if(r.kind!=='ADVANCE'||r.status!=='Dicairkan'||r.settled_at)throw new Error('Advance tidak menunggu penyelesaian.');requiredNote(note);
   await c.query('UPDATE requests SET settled_at=now(),settlement_approver_id=$2 WHERE id=$1',[id,user.id]);await event(c,r,user,'ADVANCE_SETTLED',r.status,note);
  } else throw new Error('Aksi tidak dikenal.');
 });
}
export async function reallocate(user,source,destination,amount,note) {
 requireRole(user,['GM']);requiredNote(note);positiveInteger(amount);if(source===destination)throw new Error('Divisi asal dan tujuan harus berbeda.');
 return transaction(async c=>{
  const p=await getPolicy(c);const week=await ensureBudget(c,p);
  const from=(await c.query('SELECT * FROM weekly_budgets WHERE week=$1 AND division=$2 FOR UPDATE',[week,source])).rows[0];
  const to=(await c.query('SELECT * FROM weekly_budgets WHERE week=$1 AND division=$2 FOR UPDATE',[week,destination])).rows[0];
  if(!from||!to)throw new Error('Divisi tidak valid.');
  const used=Number((await c.query('SELECT COALESCE(sum(amount),0) AS n FROM budget_reservations WHERE week=$1 AND division=$2 AND NOT released',[week,source])).rows[0].n);
  if(Number(from.base_amount)+Number(from.carry)+Number(from.adjustment)-used<amount)throw new Error('Sisa limit divisi asal tidak cukup.');
  await c.query('UPDATE weekly_budgets SET adjustment=adjustment-$3 WHERE week=$1 AND division=$2',[week,source,amount]);
  await c.query('UPDATE weekly_budgets SET adjustment=adjustment+$3 WHERE week=$1 AND division=$2',[week,destination,amount]);
  await c.query('INSERT INTO reallocations(week,source,destination,amount,note,actor_id) VALUES($1,$2,$3,$4,$5,$6)',[week,source,destination,amount,note,user.id]);
  await audit(c,user,'BUDGET_REALLOCATED',null,{week,source,destination,amount,note});
 });
}
