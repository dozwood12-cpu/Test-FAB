import {tx,pool,ensureSimple} from './db.mjs';
import {positiveInteger,todayWIB,assertDistinct} from '../rules.mjs';
export const roles={ANGGOTA:'Staff',HOD:'Staff / Koordinator',FA:'Financial Operation',GM:'Financial Lead',ADMIN:'Admin'};
export const statuses=['Diajukan','Perlu Perbaikan','Diverifikasi','Disetujui','Dicairkan','Ditolak','Dibatalkan'];
export const finance=user=>['FA','GM','ADMIN'].includes(user.role);
export const master=user=>['GM','ADMIN'].includes(user.role);
export async function log(c,user,requestId,action,note='',details={}){
 const e=(await c.query('INSERT INTO simple_events(request_id,actor_id,action,note,details) VALUES($1,$2,$3,$4,$5) RETURNING id',[requestId||null,user?.id||null,action,note,JSON.stringify(details)])).rows[0];
 if(!requestId||!['Pengajuan dibuat','Pengajuan diubah','verify','correct','approve','reject','Dana dicairkan'].includes(action))return;
 const r=(await c.query('SELECT * FROM simple_requests WHERE id=$1',[requestId])).rows[0];
 const role=['Pengajuan dibuat','Pengajuan diubah','approve'].includes(action)?'FA':action==='verify'?'GM':null;
 const recipients=(await c.query('SELECT id FROM users WHERE active AND (id=$1 OR role=$2) AND ($3::bigint IS NULL OR id<>$3)',[r.proposer_id,role,user?.id||null])).rows;
 const base=process.env.APP_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL?'https://'+process.env.VERCEL_PROJECT_PRODUCTION_URL:'');
 for(const recipient of recipients)await c.query('INSERT INTO notifications(user_id,subject,message,event_key) VALUES($1,$2,$3,$4)',[recipient.id,r.number+': '+r.status,(note||action)+'\n'+base.replace(/\/$/,'')+'/requests/'+requestId,'simple:'+e.id+':'+recipient.id]);
}
export async function getRequest(user,id,c=pool,lock=false){
 if(!/^\d+$/.test(String(id)))throw new Error('Pengajuan tidak ditemukan.');
 const r=(await c.query(`SELECT r.*,u.name AS proposer_name,cc.name AS division,COALESCE((SELECT sum(amount) FROM simple_payments WHERE request_id=r.id),0) AS paid FROM simple_requests r JOIN users u ON u.id=r.proposer_id JOIN cost_centers cc ON cc.id=r.cost_center_id WHERE r.id=$1 ${lock?'FOR UPDATE OF r':''}`,[id])).rows[0];
 if(!r||(!finance(user)&&String(r.proposer_id)!==String(user.id)))throw new Error('Pengajuan tidak ditemukan atau tidak dapat diakses.');return r;
}
export async function post(c,user,key,description,lines,requestId=null,reversal=null){
 const e=(await c.query('INSERT INTO journal_entries(source_key,description,actor_id,request_id,reversal_of) VALUES($1,$2,$3,$4,$5) RETURNING id',[key,description,user?.id||null,requestId,reversal])).rows[0];
 for(const line of lines)await c.query('INSERT INTO journal_lines(entry_id,account_code,cost_center_id,debit,credit) VALUES($1,$2,$3,$4,$5)',[e.id,line.account,line.center||null,line.debit||0,line.credit||0]);
 return e.id;
}
async function committed(c,center,exclude=null){return Number((await c.query("SELECT COALESCE(sum(amount),0) AS n FROM simple_requests WHERE cost_center_id=$1 AND status IN ('Disetujui','Dicairkan') AND ($2::bigint IS NULL OR id<>$2)",[center,exclude])).rows[0].n);}
async function budgetCheck(c,r){const cc=(await c.query('SELECT * FROM cost_centers WHERE id=$1 FOR UPDATE',[r.cost_center_id])).rows[0];if(!cc?.active||Number(cc.budget)<await committed(c,cc.id,r.id)+Number(r.amount))throw new Error('Anggaran divisi belum diatur atau sisa anggaran tidak cukup. Hubungi Financial Lead.');}
export async function saveRequest(user,data,file=null,id=null){
 return tx(async c=>{
 let before;if(id){before=await getRequest(user,id,c,true);if(String(before.proposer_id)!==String(user.id)||!['Diajukan','Perlu Perbaikan'].includes(before.status))throw new Error('Pengajuan hanya dapat diedit pengusul sebelum verifikasi.');}
 const amount=positiveInteger(data.amount);if(amount<10000)throw new Error('Minimal pengajuan Rp10.000.');
 for(const k of ['title','vendor','purpose','bank_details'])if(!data[k]?.trim()||data[k].length>1000)throw new Error('Lengkapi judul, toko, tujuan, dan rekening (maksimal 1.000 karakter).');
 const date=String(data.purchase_date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(new Date(date).getTime())||new Date(date).toISOString().slice(0,10)!==date||date>todayWIB())throw new Error('Tanggal pembelian tidak valid atau berada di masa depan.');
 const due=data.due_date||date;if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(new Date(due).getTime())||new Date(due).toISOString().slice(0,10)!==due||due<date)throw new Error('Jatuh tempo tidak boleh sebelum tanggal pembelian.');
 const cc=(await c.query('SELECT * FROM cost_centers WHERE id=$1 AND active',[data.cost_center_id])).rows[0];
 if(!cc||(!finance(user)&&cc.name!==user.division))throw new Error('Pilih divisi Anda yang aktif.');
 // Klasifikasi akun ditetapkan FO saat verifikasi, bukan oleh pengusul.
 if(!id&&!file)throw new Error('Nota atau invoice wajib diunggah.');
 const values=[user.id,cc.id,data.title.trim(),data.vendor.trim(),data.purpose.trim(),amount,date,due,data.bank_details.trim()];
 let r;if(id)r=(await c.query("UPDATE simple_requests SET cost_center_id=$2,title=$3,vendor=$4,purpose=$5,amount=$6,purchase_date=$7,due_date=$8,bank_details=$9,status='Diajukan',verifier_id=NULL,updated_at=now() WHERE id=$10 AND proposer_id=$1 RETURNING *",[...values,id])).rows[0];
 else r=(await c.query("INSERT INTO simple_requests(proposer_id,cost_center_id,title,vendor,purpose,amount,purchase_date,due_date,bank_details,demo_key,account_code,number) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'5100','FAB-'||to_char(now() AT TIME ZONE 'Asia/Jakarta','YYYY')||'-'||lpad(nextval('simple_request_numbers')::text,6,'0')) RETURNING *",[...values,data.demo_key||null])).rows[0];
 if(file)await attachFile(c,user,r,'NOTA',file);
 await log(c,user,r.id,id?'Pengajuan diubah':'Pengajuan dibuat','',{before:before||null,after:r});
 return r;
 });
}
export async function attachFile(c,user,r,kind,file){
 if(kind==='NOTA'){
 await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['simple-file:'+file.sha256]);
 if((await c.query("SELECT id FROM simple_files WHERE sha256=$1 AND kind='NOTA' AND request_id<>$2",[file.sha256,r.id])).rowCount)throw new Error('Nota yang sama sudah digunakan dalam pengajuan lain.');
 if((await c.query("SELECT d.id FROM documents d JOIN requests old ON old.id=d.request_id WHERE d.sha256=$1 AND d.category IN ('NOTA','INVOICE') AND old.status='Dicairkan' LIMIT 1",[file.sha256])).rowCount)throw new Error('Nota sudah dibayar pada versi lama. Jangan ajukan ulang.');
 await c.query("UPDATE simple_files SET active=false WHERE request_id=$1 AND kind='NOTA' AND active",[r.id]);
 }
 return (await c.query('INSERT INTO simple_files(request_id,uploaded_by,kind,name,storage_key,mime,size,sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[r.id,user.id,kind,file.name,file.storage_key,file.mime,file.size,file.sha256])).rows[0];
}
export async function uploadFile(user,id,kind,file){return tx(async c=>{
 const r=await getRequest(user,id,c,true);
 if(kind==='NOTA'){if(String(r.proposer_id)!==String(user.id)||!['Diajukan','Perlu Perbaikan'].includes(r.status))throw new Error('Nota hanya dapat diganti pengusul sebelum verifikasi.');}
 else if(kind==='TRANSFER'){if(user.role!=='FA'||r.status!=='Disetujui')throw new Error('Bukti pembayaran hanya untuk FO pencair.');assertDistinct(r,user,'pay');}
 else throw new Error('Jenis berkas tidak valid.');
 const f=await attachFile(c,user,r,kind,file);await log(c,user,r.id,'Berkas diunggah',kind,{file:f.id});return f;
 });}
export async function decide(user,id,decision,note='',account='5100'){return tx(async c=>{
 const r=await getRequest(user,id,c,true);
 if(['verify','correct'].includes(decision)){
 if(user.role!=='FA'||r.status!=='Diajukan')throw new Error('Hanya FO dapat memverifikasi pengajuan Diajukan.');assertDistinct(r,user,'verify');
 if(decision==='verify'){
 if(!(await c.query("SELECT id FROM simple_files WHERE request_id=$1 AND kind='NOTA' AND active",[id])).rowCount)throw new Error('Nota belum tersedia.');
 if(!(await c.query("SELECT code FROM gl_accounts WHERE code=$1 AND active AND type IN ('EXPENSE','ASSET') AND code<>'1100'",[account])).rowCount)throw new Error('Akun biaya/aset tidak valid.');
 await budgetCheck(c,r);
 await c.query("UPDATE simple_requests SET status='Diverifikasi',verifier_id=$2,account_code=$3,note=$4,updated_at=now() WHERE id=$1",[id,user.id,account,note]);
 }else{if(note.trim().length<5)throw new Error('Tuliskan dokumen atau isian yang perlu diperbaiki.');await c.query("UPDATE simple_requests SET status='Perlu Perbaikan',note=$2,updated_at=now() WHERE id=$1",[id,note]);}
 }else if(['approve','reject'].includes(decision)){
 if(user.role!=='GM'||r.status!=='Diverifikasi')throw new Error('Hanya Financial Lead dapat memutuskan pengajuan Diverifikasi.');assertDistinct(r,user,'approve');
 if(decision==='reject'&&note.trim().length<5)throw new Error('Tuliskan alasan penolakan.');
 if(decision==='approve'){
 await budgetCheck(c,r);await post(c,user,'approve:'+id,'Pengakuan hutang '+r.number,[{account:r.account_code,center:r.cost_center_id,debit:r.amount},{account:'2100',center:r.cost_center_id,credit:r.amount}],r.id);
 }
 await c.query("UPDATE simple_requests SET status=$2,approver_id=$3,note=$4,approved_at=CASE WHEN $2='Disetujui' THEN now() ELSE NULL END,updated_at=now() WHERE id=$1",[id,decision==='approve'?'Disetujui':'Ditolak',user.id,note]);
 }else if(decision==='cancel'){
 if(String(r.proposer_id)!==String(user.id)||!['Diajukan','Perlu Perbaikan'].includes(r.status))throw new Error('Pengajuan yang sudah diverifikasi tidak dapat dibatalkan.');
 if(note.trim().length<5)throw new Error('Tuliskan alasan pembatalan.');
 await c.query("UPDATE simple_requests SET status='Dibatalkan',note=$2,updated_at=now() WHERE id=$1",[id,note]);
 }else throw new Error('Tindakan tidak dikenal.');
 await log(c,user,id,decision,note);return r;
 });}
export async function cashBalance(c=pool){return Number((await c.query("SELECT COALESCE(sum(debit-credit),0) AS n FROM journal_lines WHERE account_code='1100'")).rows[0].n);}
export async function pay(user,id,amount,reference,fileId,token){return tx(async c=>{
 const r=await getRequest(user,id,c,true);if(user.role!=='FA'||r.status!=='Disetujui')throw new Error('Pencairan hanya oleh FO untuk pengajuan Disetujui.');assertDistinct(r,user,'pay');
 amount=positiveInteger(amount);if(amount>Number(r.amount)-Number(r.paid))throw new Error('Nominal melebihi sisa tagihan atau sudah dibayar.');if(!reference.trim()||reference.length>200)throw new Error('Isi referensi pembayaran maksimal 200 karakter.');
 if(!/^[a-f0-9-]{36}$/.test(token||''))throw new Error('Muat ulang halaman sebelum mencairkan dana.');
 const file=typeof fileId==='object'?await attachFile(c,user,r,'TRANSFER',fileId):(await c.query("SELECT * FROM simple_files WHERE id=$1 AND request_id=$2 AND kind='TRANSFER' AND uploaded_by=$3 AND active",[fileId,id,user.id])).rows[0];if(!file)throw new Error('Unggah bukti transfer dengan akun pencair terlebih dahulu.');
 await c.query('SELECT pg_advisory_xact_lock(908002)');if(await cashBalance(c)<amount)throw new Error('Saldo kas tidak cukup. FO dapat mencatat penerimaan dana di Keuangan.');
 const p=(await c.query('INSERT INTO simple_payments(request_id,actor_id,amount,reference,file_id,request_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[id,user.id,amount,reference.trim(),file.id,token])).rows[0];
 await post(c,user,'pay:'+p.id,'Pembayaran '+r.number,[{account:'2100',center:r.cost_center_id,debit:amount},{account:'1100',credit:amount}],id);
 if(amount+Number(r.paid)===Number(r.amount))await c.query("UPDATE simple_requests SET status='Dicairkan',paid_at=now(),updated_at=now() WHERE id=$1",[id]);
 await log(c,user,id,'Dana dicairkan',reference,{amount,payment:p.id});return p;
 });}
export async function receive(user,amount,note,token){return tx(async c=>{
 if(user.role!=='FA')throw new Error('Penerimaan dana hanya dicatat FO.');amount=positiveInteger(amount);if(note.trim().length<5)throw new Error('Jelaskan sumber penerimaan dana.');if(!/^[a-f0-9-]{36}$/.test(token))throw new Error('Muat ulang halaman dan coba lagi.');
 await post(c,user,'receive:'+token,note,[{account:'1100',debit:amount},{account:'4100',credit:amount}]);await log(c,user,null,'Penerimaan dana',note,{amount});
 });}
export async function setCenter(user,data){return tx(async c=>{
 if(!master(user))throw new Error('Hanya Lead/Admin mengatur anggaran divisi.');const name=String(data.name||'').trim(),budget=Number(data.budget);if(!name||name.length>100||!Number.isSafeInteger(budget)||budget<0||budget>100000000000)throw new Error('Nama dan anggaran divisi tidak valid.');
 if(data.id){await c.query('SELECT id FROM cost_centers WHERE id=$1 FOR UPDATE',[data.id]);if(budget<await committed(c,data.id))throw new Error('Anggaran tidak boleh kurang dari total komitmen dan realisasi.');await c.query('UPDATE cost_centers SET budget=$2,active=$3 WHERE id=$1',[data.id,budget,data.active]);}
 else await c.query('INSERT INTO cost_centers(name,budget) VALUES($1,$2)',[name,budget]);
 await log(c,user,null,'Anggaran divisi diubah','',{...data,name,budget});
 });}
