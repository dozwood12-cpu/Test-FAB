import pool from '../lib/db.mjs';
import {hashPassword} from '../lib/security.mjs';
import {createRequest,verifyRequest,getPolicy} from '../lib/workflow.mjs';
import {uploadDocument} from '../lib/files.mjs';
import {todayWIB} from '../lib/rules.mjs';
import PDFDocument from 'pdfkit';
if(!process.env.DEMO_PASSWORD||process.env.DEMO_PASSWORD.length<8)throw new Error('Isi DEMO_PASSWORD minimal delapan karakter melalui environment proses.');
const p=await getPolicy();const users={};
try{
 for(const [key,role,division,deputy] of [['anggota','ANGGOTA','Mechanical',false],['hod','HOD','Mechanical',false],['fa','FA','Mechanical',false],['pencair','FA','Electrical',false],['gm','GM','Non-Technical',false],['wakil','GM','Mechanical',true]]){
  const username='demo.'+key;
  const existing=(await pool.query('SELECT * FROM users WHERE username=$1',[username])).rows[0];
  if(existing&&!existing.name.startsWith('[CONTOH]'))throw new Error('Username demo berbenturan dengan akun pengguna.');
  if(existing)users[key]=existing;
  else users[key]=(await pool.query('INSERT INTO users(username,name,email,password_hash,role,division,deputy) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[username,'[CONTOH] '+key,username+'@example.test',hashPassword(process.env.DEMO_PASSWORD),role,division,deputy])).rows[0];
 }
 for(const [code,title,division] of [['DEMO-M','[CONTOH] Komponen mekanik','Mechanical'],['DEMO-E','[CONTOH] Komponen elektrikal','Electrical'],['DEMO-N','[CONTOH] Administrasi tim','Non-Technical']])await pool.query('INSERT INTO rab_items(code,title,division,budget,generation) VALUES($1,$2,$3,1000000,$4) ON CONFLICT(code) DO NOTHING',[code,title,division,p.generation]);
 if(!(await pool.query("SELECT id FROM inventory WHERE name='[CONTOH] Bearing'")).rowCount)await pool.query("INSERT INTO inventory(name,division,quantity,location) VALUES('[CONTOH] Bearing','Mechanical',2,'[CONTOH] Rak A')");
 const rab=(await pool.query("SELECT id FROM rab_items WHERE code='DEMO-M'")).rows[0];
 for(const [title,kind,urgent,amount] of [['[CONTOH] Bearing pengganti','REIMBURSEMENT',false,25000],['[CONTOH] Advance pembelian terencana','ADVANCE',false,100000],['[CONTOH] Pembelian mendesak','ADVANCE',true,900000]]){
  if((await pool.query('SELECT id FROM requests WHERE proposer_id=$1 AND title=$2',[users.anggota.id,title])).rowCount)continue;
  const r=await createRequest(users.anggota,{title,vendor:'[CONTOH] Toko '+title,purpose:'[CONTOH] Simulasi kebutuhan tim',purchase_date:todayWIB(),kind,urgent,channel:'MANUAL',bank_details:'[CONTOH] Rekening fiktif — jangan ditransfer',note:'[CONTOH] Data demonstrasi, bukan transaksi nyata.',items:[{rab_id:rab.id,component:'[CONTOH] Bearing',quantity:1,unit_price:amount}]});
  if(kind==='REIMBURSEMENT'){
   const doc=new PDFDocument();const chunks=[];const done=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',resolve);doc.on('error',reject);});
   doc.text('[CONTOH] NOTA DEMONSTRASI — BUKAN TRANSAKSI NYATA').moveDown().text(r.vendor).text(todayWIB()).text('Bearing: Rp25.000').text('LUNAS / STEMPEL CONTOH');doc.end();await done;
   const form=new FormData();form.set('file',new File([Buffer.concat(chunks)],'nota-contoh.pdf',{type:'application/pdf'}));form.set('category','NOTA');form.set('receipt_date',todayWIB());form.set('receipt_amount','25000');form.set('stamped','on');form.set('legible','on');
   await uploadDocument(users.anggota,r.id,form);
   await verifyRequest(users.fa,r.id,'verify','[CONTOH] Bukti demonstrasi lengkap',{rab:true,amount:true,readability:true,duplicates:true,inventory:true,completeness:true});
  }
 }
 console.log('Data contoh siap. Tidak menambahkan kas atau menjalankan pencairan. Akun demo menggunakan DEMO_PASSWORD yang Anda tetapkan.');
}finally{await pool.end();}
