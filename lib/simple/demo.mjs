import {randomUUID} from 'node:crypto';
import PDFDocument from 'pdfkit';
import {hashPassword} from '../security.mjs';
import {todayWIB} from '../rules.mjs';
import {tx,pool} from './db.mjs';
import {saveRequest,log} from './core.mjs';
import {prepareFile,discard} from './files.mjs';
export async function createDemo(actor,password){
 if(actor.role!=='ADMIN')throw new Error('Hanya Admin membuat data contoh.');if(password.length<8||password.length>128)throw new Error('Password demo harus 8–128 karakter.');
 const users=await tx(async c=>{
 await c.query('SELECT pg_advisory_xact_lock(908003)');
 let center=(await c.query('SELECT * FROM cost_centers WHERE active ORDER BY id LIMIT 1')).rows[0];if(!center)center=(await c.query("INSERT INTO cost_centers(name) VALUES('CONTOH Divisi') ON CONFLICT(name) DO UPDATE SET active=true RETURNING *")).rows[0];
 const accounts={};for(const [key,role] of [['staff','ANGGOTA'],['fo','FA'],['lead','GM'],['pencair','FA']]){
 const username='contoh.'+key;let u=(await c.query('SELECT * FROM users WHERE lower(username)=$1 FOR UPDATE',[username])).rows[0];if(u&&!u.name.startsWith('[CONTOH]'))throw new Error('Username contoh sudah digunakan oleh akun asli.');
 if(!u)u=(await c.query('INSERT INTO users(username,name,email,password_hash,role,division) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[username,'[CONTOH] '+key,username+'@example.test',hashPassword(password),role,center.name])).rows[0];accounts[key]=u;
 }
 return accounts;
 });
 for(const [n,title,amount] of [[1,'[CONTOH] Pembelian bearing',20000],[2,'[CONTOH] Alat tulis',15000]]){
 const key='simple-demo-'+n;
 let file;
 try{
 if((await pool.query('SELECT id FROM simple_requests WHERE demo_key=$1',[key])).rowCount)continue;
 const pdf=new PDFDocument();const chunks=[];const done=new Promise((resolve,reject)=>{pdf.on('data',b=>chunks.push(b));pdf.on('end',resolve);pdf.on('error',reject);});pdf.fontSize(18).text('CONTOH - BUKAN TRANSAKSI NYATA').fontSize(12).text(title).text('Toko Contoh').text(todayWIB()).text('Total Rp '+amount).text(key+' '+randomUUID());pdf.end();await done;
 file=await prepareFile(new File([Buffer.concat(chunks)],'nota-contoh-'+n+'.pdf',{type:'application/pdf'}));
 const center=(await pool.query('SELECT id FROM cost_centers WHERE name=$1 AND active',[users.staff.division])).rows[0];if(!center)throw new Error('Divisi akun contoh tidak aktif. Aktifkan kembali melalui Keuangan.');
 await saveRequest(users.staff,{demo_key:key,cost_center_id:center.id,title,amount,purchase_date:todayWIB(),vendor:'Toko Contoh',purpose:'[CONTOH] Simulasi alur pengajuan tim',bank_details:'[CONTOH] Rekening fiktif - jangan ditransfer'},file);
 }catch(e){await discard(file);if(e.code!=='23505'||!(await pool.query('SELECT id FROM simple_requests WHERE demo_key=$1',[key])).rowCount)throw e;}
 }
 await tx(c=>log(c,actor,null,'Data contoh dibuat'));
}
