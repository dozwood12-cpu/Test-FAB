'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {requireUser,checkOrigin} from '../lib/auth.mjs';
import {saveRequest,uploadFile,decide,pay,receive,setCenter,log,master} from '../lib/simple/core.mjs';
import {prepareFile,discard} from '../lib/simple/files.mjs';
import {tx} from '../lib/simple/db.mjs';
import {hashPassword,verifyPassword} from '../lib/security.mjs';
const value=(f,k)=>String(f.get(k)||'').trim();
async function act(path,fn){await checkOrigin();const user=await requireUser();let result;try{result=await fn(user);}catch(e){if(e.code)console.error('SIMPLE_ACTION_FAILED',String(e.code).replace(/[^A-Z0-9_]/gi,'').slice(0,40));const message=e.code==='23505'?'Data atau bukti pembayaran sudah digunakan. Muat ulang untuk melihat hasilnya.':e.code?'Operasi belum berhasil. Periksa isian dan coba lagi.':e.message;redirect(path+'?error='+encodeURIComponent(message));}revalidatePath('/','layout');redirect(result||path+'?success=1');}
export async function submit(form){const id=value(form,'id');await act(id?'/requests/'+id+'/edit':'/requests/new',async user=>{
 let file;try{if(form.get('file')?.size)file=await prepareFile(form.get('file'));const r=await saveRequest(user,Object.fromEntries(['title','vendor','purpose','amount','purchase_date','due_date','bank_details','cost_center_id'].map(k=>[k,value(form,k)])),file,id||null);return '/requests/'+r.id+'?success=1';}catch(e){await discard(file);throw e;}
 });}
export async function upload(form){const id=value(form,'id');await act('/requests/'+id,async user=>{let file;try{file=await prepareFile(form.get('file'));await uploadFile(user,id,value(form,'kind'),file);}catch(e){await discard(file);throw e;}});}
export async function decision(form){const id=value(form,'id');await act('/requests/'+id,async user=>{if(value(form,'decision')==='verify'&&!form.get('confirm'))throw new Error('Konfirmasikan pemeriksaan nota dan anggaran.');await decide(user,id,value(form,'decision'),value(form,'note'),value(form,'account_code'));});}
export async function payment(form){const id=value(form,'id');await act('/requests/'+id,async user=>{let file;try{file=await prepareFile(form.get('file'));await pay(user,id,value(form,'amount'),value(form,'reference'),file,value(form,'token'));}catch(e){await discard(file);throw e;}});}
export async function cashIn(form){await act('/finance',user=>receive(user,value(form,'amount'),value(form,'note'),value(form,'token')).then(()=>undefined));}
export async function center(form){await act('/finance',user=>setCenter(user,{id:value(form,'id')||null,name:value(form,'name'),budget:value(form,'budget'),active:form.get('active')==='on'}).then(()=>undefined));}
export async function account(form){await act('/finance',async user=>{
 if(!master(user))throw new Error('Hanya Lead/Admin dapat mengelola akun.');
 const code=value(form,'code'),name=value(form,'name'),type=value(form,'type');if(!/^\d{4,8}$/.test(code)||!name||name.length>100||!['EXPENSE','ASSET'].includes(type)||code==='1100')throw new Error('Gunakan kode 4–8 digit dan akun biaya/aset yang valid.');
 await tx(async c=>{const old=(await c.query('SELECT * FROM gl_accounts WHERE code=$1 FOR UPDATE',[code])).rows[0];if(old&&!['EXPENSE','ASSET'].includes(old.type))throw new Error('Akun sistem tidak dapat diubah melalui form ini.');if(old&&old.type!==type)throw new Error('Jenis akun yang sudah ada tidak dapat diubah.');await c.query('INSERT INTO gl_accounts(code,name,type) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET name=excluded.name',[code,name,type]);await log(c,user,null,'Master akun diperbarui','',{code,name,type});});
 });}
export async function member(form){await act('/admin',async user=>{
 if(user.role!=='ADMIN')throw new Error('Hanya Admin mengelola anggota.');
 const id=value(form,'id'),operation=value(form,'operation');
 if(id&&String(user.id)===id)throw new Error('Gunakan Akun saya untuk akun sendiri.');
 await tx(async c=>{
 if(operation==='remove'||operation==='activate'){
 await c.query('UPDATE users SET active=$2 WHERE id=$1',[id,operation==='activate']);await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);
 }else if(operation==='password'){
 const password=String(form.get('password')||'');if(password.length<8||password.length>128)throw new Error('Password harus 8–128 karakter.');await c.query('UPDATE users SET password_hash=$2 WHERE id=$1',[id,hashPassword(password)]);await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);
 }else{
 const name=value(form,'name'),username=value(form,'username'),email=value(form,'email'),role=value(form,'role'),division=value(form,'division');
 if(!name||name.length>100||!/^[-a-zA-Z0-9._]{3,64}$/.test(username)||!['ANGGOTA','FA','GM','ADMIN'].includes(role)||email.length>254||(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw new Error('Nama, username, email atau peran tidak valid.');
 if(!(await c.query('SELECT id FROM cost_centers WHERE name=$1 AND active',[division])).rowCount)throw new Error('Pilih divisi aktif terlebih dahulu.');
 if(id){await c.query('UPDATE users SET name=$2,username=$3,email=$4,role=$5,division=$6,deputy=false WHERE id=$1',[id,name,username,email||null,role,division]);await c.query('DELETE FROM sessions WHERE user_id=$1',[id]);}
 else{const password=String(form.get('password')||'');if(password.length<8||password.length>128)throw new Error('Password harus 8–128 karakter.');await c.query('INSERT INTO users(name,username,email,role,division,password_hash) VALUES($1,$2,$3,$4,$5,$6)',[name,username,email||null,role,division,hashPassword(password)]);}
 }
 await log(c,user,null,'Anggota '+(operation||'disimpan'),'',{id:id||null,username:value(form,'username')});
 });
 });}
export async function password(form){await act('/account',async user=>{
 const next=String(form.get('password')||'');if(next.length<8||next.length>128)throw new Error('Password baru harus 8–128 karakter.');
 await tx(async c=>{const old=(await c.query('SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];if(!verifyPassword(String(form.get('old')||''),old.password_hash))throw new Error('Password saat ini salah.');await c.query('UPDATE users SET password_hash=$2 WHERE id=$1',[user.id,hashPassword(next)]);await c.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);await log(c,user,null,'Password diubah');});return '/login';
 });}
export async function demo(form){await act('/admin',async user=>{if(form.get('confirm')!=='on')throw new Error('Centang persetujuan data contoh.');const {createDemo}=await import('../lib/simple/demo.mjs');await createDemo(user,String(form.get('password')||''));});}
