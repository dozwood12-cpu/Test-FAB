'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireUser,checkOrigin} from '../lib/auth.mjs';
import {createRequest,verifyRequest,approveRequest,payRequest,transaction,audit,getPolicy} from '../lib/workflow.mjs';
import {uploadDocument} from '../lib/files.mjs';
import {operateRequest,reallocate} from '../lib/operations.mjs';
import {positiveInteger,todayWIB} from '../lib/rules.mjs';
import {hashPassword,verifyPassword} from '../lib/security.mjs';
import pool from '../lib/db.mjs';
function text(form,key){return String(form.get(key)||'').trim();}
function errorMessage(e){return e.code==='23505'?'Data tersebut sudah terdaftar.':e.code==='23514'?'Nilai tidak memenuhi kebijakan.':e.code?'Operasi gagal. Periksa isian dan coba kembali.':e.message;}
async function perform(path,fn) {
 await checkOrigin();const user=await requireUser();let result;
 try{result=await fn(user);}catch(e){redirect(path+'?error='+encodeURIComponent(errorMessage(e)));}
 revalidatePath('/', 'layout');redirect(typeof result==='string'?result:path+'?success=1');
}
export async function submitRequest(form) {await perform('/requests/new',async user=>{
 const data=Object.fromEntries(['title','vendor','purpose','purchase_date','kind','channel','tracking_number','bank_details','note'].map(k=>[k,text(form,k)]));
 data.urgent=!!form.get('urgent');data.items=[];
 const rab=form.getAll('rab_id'),components=form.getAll('component'),quantities=form.getAll('quantity'),prices=form.getAll('unit_price');
 for(let i=0;i<rab.length;i++)if(components[i])data.items.push({rab_id:rab[i],component:String(components[i]),quantity:Number(quantities[i]),unit_price:Number(prices[i])});
 const r=await createRequest(user,data);return `/requests/${r.id}`;
});}
export async function upload(form) {const id=text(form,'id');await perform(`/requests/${id}`,u=>uploadDocument(u,id,form));}
export async function review(form) {const id=text(form,'id');await perform(`/requests/${id}`,u=>verifyRequest(u,id,text(form,'decision'),text(form,'note'),Object.fromEntries(['rab','amount','readability','duplicates','inventory','completeness'].map(k=>[k,!!form.get(k)]))));}
export async function approve(form) {const id=text(form,'id');await perform(`/requests/${id}`,u=>approveRequest(u,id,text(form,'decision'),text(form,'note')));}
export async function pay(form) {const id=text(form,'id');await perform(`/requests/${id}`,u=>payRequest(u,id,text(form,'reference'),text(form,'document_id')));}
export async function operate(form) {const id=text(form,'id');await perform(`/requests/${id}`,u=>operateRequest(u,id,text(form,'action'),{note:text(form,'note'),amount:text(form,'amount'),location:text(form,'location'),archived:!!form.get('archived'),return_id:text(form,'return_id'),document_id:text(form,'document_id'),tracking_number:text(form,'tracking_number'),sender_id:text(form,'sender_id')}));}
export async function allocate(form) {await perform('/finance',u=>reallocate(u,text(form,'source'),text(form,'destination'),positiveInteger(form.get('amount')),text(form,'note')));}
export async function addCash(form) {await perform('/finance',async u=>{
 if(u.role!=='FA')throw new Error('Pencatatan kas masuk hanya untuk FA.');const amount=positiveInteger(form.get('amount')),note=text(form,'note');if(note.length<10)throw new Error('Sumber dana harus dijelaskan minimal 10 karakter.');
 await transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(808008)');const r=(await c.query("INSERT INTO cash_entries(kind,amount,note,actor_id) VALUES('MASUK',$1,$2,$3) RETURNING id",[amount,note,u.id])).rows[0];await audit(c,u,'CASH_IN',r.id,{amount,note});});
});}
export async function reconcile(form) {await perform('/finance',async u=>{
 if(u.role!=='FA')throw new Error('Rekonsiliasi hanya untuk FA.');const month=text(form,'month')+'-01',balance=Number(form.get('statement_balance')),note=text(form,'note');if(!/^\d{4}-\d{2}-01$/.test(month)||!Number.isSafeInteger(balance)||note.length<10)throw new Error('Isi bulan, saldo rekening dan catatan minimal 10 karakter.');
 await transaction(async c=>{await c.query('SELECT pg_advisory_xact_lock(808008)');const actual=Number((await c.query("SELECT COALESCE(sum(CASE WHEN kind='KELUAR' THEN -amount ELSE amount END),0) AS n FROM cash_entries WHERE created_at<($1::date+interval '1 month') AT TIME ZONE 'Asia/Jakarta'",[month])).rows[0].n);await c.query('INSERT INTO reconciliations(month,statement_balance,ledger_balance,difference,note,actor_id) VALUES($1,$2,$3,$4,$5,$6)',[month,balance,actual,balance-actual,note,u.id]);await audit(c,u,'RECONCILIATION_CREATED',null,{month,statement:balance,ledger:actual,difference:balance-actual});});
});}
export async function savePolicy(form) {await perform('/settings',async u=>{
 if(u.role!=='ADMIN')throw new Error('Hanya Admin dapat mengubah konfigurasi.');
 const keys=['mechanical','electrical','nontechnical','total_weekly','direct_threshold','carry_percent','advance_days','urgent_hours','lost_limit','payout_days','payout_weekday'];
 const values=keys.map(k=>Number(form.get(k)));if(values.some(n=>!Number.isSafeInteger(n)||n<0))throw new Error('Konfigurasi harus berupa bilangan bulat non-negatif.');
 if(values[0]+values[1]+values[2]!==values[3])throw new Error('Jumlah limit divisi harus sama dengan limit total mingguan.');
 const generation=text(form,'generation');if(!generation||generation.length>50)throw new Error('Generasi wajib diisi.');
 const contacts=[1,2].map(i=>({name:text(form,'pic_name_'+i),contact:text(form,'pic_contact_'+i)}));if(contacts.some(p=>!p.name||!p.contact||p.contact==='Belum diisi'))throw new Error('Isi minimal dua PIC beserta kontak aktifnya.');
 await transaction(async c=>{const old=await getPolicy(c);await c.query('INSERT INTO policy_history(version,snapshot,actor_id) VALUES($1,$2,$3)',[old.version,JSON.stringify(old),u.id]);await c.query(`UPDATE policy SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')},generation=$12,contacts=$13,version=version+1,updated_at=now() WHERE id=1`,[...values,generation,JSON.stringify(contacts)]);await audit(c,u,'POLICY_UPDATED',null,{version:old.version+1});});
});}
export async function addCatalog(form) {await perform('/catalog',async u=>{
 if(!['ADMIN','FA','HOD'].includes(u.role))throw new Error('Tidak memiliki kewenangan mengelola katalog.');
 const division=text(form,'division');if(!['Mechanical','Electrical','Non-Technical'].includes(division)||(u.role==='HOD'&&u.division!==division))throw new Error('Divisi tidak valid atau bukan kewenangan Anda.');
 await transaction(async c=>{
  if(text(form,'type')==='rab') {const title=text(form,'title'),code=text(form,'code');if(!title||!code)throw new Error('Kode dan nama RAB wajib diisi.');const p=await getPolicy(c);await c.query('INSERT INTO rab_items(code,title,division,budget,generation) VALUES($1,$2,$3,$4,$5)',[code,title,division,positiveInteger(form.get('budget')),p.generation]);}
  else {const name=text(form,'title'),location=text(form,'location');if(!name||!location)throw new Error('Nama dan lokasi inventaris wajib diisi.');await c.query('INSERT INTO inventory(name,division,quantity,location,condition) VALUES($1,$2,$3,$4,$5)',[name,division,positiveInteger(form.get('quantity')),location,text(form,'condition')||'Baik']);}
  await audit(c,u,'CATALOG_CREATED',null,{type:text(form,'type'),division});
 });
});}
export async function memberAction(form) {await perform('/admin',async u=>{
 if(u.role!=='ADMIN')throw new Error('Hanya Admin dapat mengelola akun.');const id=text(form,'user_id');if(String(u.id)===id)throw new Error('Gunakan halaman akun untuk mengganti kata sandi sendiri.');
 await transaction(async c=>{
  const target=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!target)throw new Error('Anggota tidak ditemukan.');
  const action=text(form,'action');
  if(action==='toggle')await c.query('UPDATE users SET active=NOT active WHERE id=$1',[id]);
  else if(action==='deputy'){if(target.role!=='GM')throw new Error('Wakil harus memiliki peran GM.');await c.query('UPDATE users SET deputy=NOT deputy WHERE id=$1',[id]);}
  else if(action==='password'){const pass=String(form.get('password')||'');if(pass.length<8||pass.length>128)throw new Error('Kata sandi harus 8–128 karakter.');await c.query('UPDATE users SET password_hash=$2 WHERE id=$1',[id,hashPassword(pass)]);}
  else throw new Error('Aksi akun tidak valid.');
  if(action!=='deputy')await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);await audit(c,u,'USER_'+action.toUpperCase(),id);
 });
});}
export async function sanction(form) {await perform('/admin',async u=>{
 if(u.role!=='GM')throw new Error('Sanksi hanya dapat ditetapkan GM.');const id=text(form,'user_id'),note=text(form,'note');if(String(u.id)===id||note.length<10)throw new Error('Tidak boleh memberi sanksi sendiri; alasan minimal 10 karakter.');
 await transaction(async c=>{
  await c.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[id]);
  if(text(form,'action')==='release'){await c.query('UPDATE sanctions SET active=false WHERE user_id=$1',[id]);await audit(c,u,'SANCTION_RELEASED',id,{note});return;}
  const prev=Number((await c.query('SELECT COALESCE(max(level),0) AS level FROM sanctions WHERE user_id=$1',[id])).rows[0].level);const level=Math.min(prev+1,3);
  const until=text(form,'until_date');if(level===3&&(!until||until<todayWIB()))throw new Error('Pembatasan tahap tiga wajib memiliki tanggal berakhir.');
  await c.query('INSERT INTO sanctions(user_id,actor_id,level,reason,until_date) VALUES($1,$2,$3,$4,$5)',[id,u.id,level,note,until||null]);await audit(c,u,'SANCTION_CREATED',id,{level,note});await c.query('INSERT INTO notifications(user_id,subject,message) VALUES($1,$2,$3)',[id,`Sanksi tahap ${level}`,`${note}. Anda dapat meminta peninjauan kepada GM/wakil melalui PIC.`]);
 });
});}
export async function addHandover(form) {await perform('/handover',async u=>{if(!['ADMIN','GM','FA'].includes(u.role))throw new Error('Tidak memiliki kewenangan.');await transaction(async c=>{if(text(form,'action')==='resolve')await c.query('UPDATE handover_notes SET resolved=true WHERE id=$1',[text(form,'note_id')]);else {const title=text(form,'title'),note=text(form,'note');if(!title||note.length<10)throw new Error('Judul dan catatan minimal 10 karakter wajib diisi.');await c.query('INSERT INTO handover_notes(title,note,actor_id) VALUES($1,$2,$3)',[title,note,u.id]);}await audit(c,u,'HANDOVER_NOTE_UPDATED',null);});});}
export async function completeOnboarding(form){if(!form.get('confirm'))throw new Error('Konfirmasi panduan wajib diisi.');await perform('/help',async u=>{await transaction(async c=>{await c.query('UPDATE users SET onboarded_at=now() WHERE id=$1',[u.id]);await audit(c,u,'ONBOARDING_COMPLETED',u.id);});});}
export async function readNotifications(){await perform('/notifications',async u=>{await pool.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',[u.id]);});}
export async function changePassword(form){await perform('/account',async u=>{const old=String(form.get('old')||''),password=String(form.get('password')||'');if(password.length<8||password.length>128)throw new Error('Kata sandi baru harus 8–128 karakter.');await transaction(async c=>{const record=(await c.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',[u.id])).rows[0];if(!verifyPassword(old,record.password_hash))throw new Error('Kata sandi lama salah.');await c.query('UPDATE users SET password_hash=$2 WHERE id=$1',[u.id,hashPassword(password)]);await c.query('DELETE FROM sessions WHERE user_id=$1',[u.id]);await audit(c,u,'PASSWORD_CHANGED',u.id);});return '/login';});}
export async function runReminders(){await perform('/settings',async u=>{if(u.role!=='ADMIN')throw new Error('Hanya Admin dapat menjalankan pengingat.');const {tick}=await import('../scripts/worker.mjs');await tick();});}
