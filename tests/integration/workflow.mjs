import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import pool from '../../lib/db.mjs';
import {createRequest,verifyRequest,approveRequest,payRequest,getRequest,transaction,ensureBudget,getPolicy} from '../../lib/workflow.mjs';
import {uploadDocument} from '../../lib/files.mjs';
import {operateRequest,reallocate} from '../../lib/operations.mjs';
import {tick} from '../../scripts/worker.mjs';
import {todayWIB,weekWIB} from '../../lib/rules.mjs';
const people={};let rab;let counter=1;
const checklist={rab:true,amount:true,readability:true,duplicates:true,inventory:true,completeness:true};
before(async()=>{
 for(const [key,role,division] of [['member','ANGGOTA','Mechanical'],['member2','ANGGOTA','Electrical'],['fa','FA','Mechanical'],['payer','FA','Electrical'],['gm','GM','Non-Technical'],['deputy','GM','Mechanical'],['hod','HOD','Mechanical']]){
  people[key]=(await pool.query('INSERT INTO users(username,name,email,password_hash,role,division,deputy) VALUES($1,$1,$2,$3,$4,$5,$6) RETURNING *',[key,key+'@example.test','not-for-login',role,division,key==='deputy'])).rows[0];
 }
 for(const d of ['Mechanical','Electrical','Non-Technical'])await pool.query('INSERT INTO rab_items(code,title,division,budget) VALUES($1,$2,$3,$4)',[d,'RAB Uji',d,10000000]);
 rab=(await pool.query("SELECT id FROM rab_items WHERE division='Mechanical'")).rows[0].id;
 await pool.query("INSERT INTO inventory(name,division,quantity,location) VALUES('Bearing','Mechanical',2,'Container')");
 await pool.query("INSERT INTO cash_entries(kind,amount,note,actor_id) VALUES('MASUK',10000000,'Dana pengujian',$1)",[people.fa.id]);
});
after(async()=>{await pool.end();});
const data=(extra={})=>({title:'Bearing uji',vendor:'Toko '+counter++,purpose:'Tujuan pengujian',purchase_date:todayWIB(),kind:'REIMBURSEMENT',channel:'MANUAL',bank_details:'Bank Uji 123',items:[{rab_id:rab,component:'Bearing',quantity:1,unit_price:10000}],...extra});
async function fileForm(category,amount=10000,date=todayWIB()){
 const png=await sharp({create:{width:600,height:800,channels:3,background:{r:(counter++*31)%255,g:200,b:100}}}).composite([{input:Buffer.from('<svg width="600" height="800"><rect x="40" y="40" width="520" height="700" fill="white"/><rect x="80" y="100" width="300" height="20" fill="black"/><rect x="80" y="160" width="400" height="10" fill="black"/></svg>')}]).png().toBuffer();
 const f=new FormData();f.set('file',new File([png],'bukti.png',{type:'image/png'}));f.set('category',category);f.set('receipt_date',date);f.set('receipt_amount',String(amount));f.set('stamped','on');f.set('legible','on');return f;
}
async function verified(extra={}){const r=await createRequest(people.member,data(extra));if(r.kind!=='ADVANCE')await uploadDocument(people.member,r.id,await fileForm('NOTA',r.amount));await verifyRequest(people.fa,r.id,'verify','Dokumen sesuai',checklist);return r;}
test('request editing preserves number, excludes itself from splitting and rejects other actors and verified state',async()=>{
 const input=data({vendor:'Toko edit unik',purpose:'Uji perubahan aman',items:[{rab_id:rab,component:'Bearing edit',quantity:1,unit_price:500000}]});
 const r=await createRequest(people.member,input);
 await assert.rejects(()=>createRequest(people.member2,input,{editId:r.id}),/akses|pengusul/);
 const changed=await createRequest(people.member,{...input,title:'Sudah diedit'},{editId:r.id});
 assert.equal(changed.number,r.number);assert.equal(changed.route,'REGULER');assert.equal(changed.title,'Sudah diedit');
 assert.equal((await pool.query('SELECT count(*) AS n FROM request_items WHERE request_id=$1',[r.id])).rows[0].n,'1');
 await uploadDocument(people.member,r.id,await fileForm('NOTA',500000));await verifyRequest(people.fa,r.id,'verify','Dokumen sesuai',checklist);
 await assert.rejects(()=>createRequest(people.member,input,{editId:r.id}),/sebelum verifikasi/);
});
test('minimum, purchase deadline, permissions and incomplete receipts are enforced',async()=>{
 await assert.rejects(()=>createRequest(people.member,data({items:[{rab_id:rab,component:'Bearing',quantity:1,unit_price:9999}]})),/Minimum/);
 await assert.rejects(()=>createRequest(people.member,data({purchase_date:'2020-01-01'})),/satu bulan/);
 const r=await createRequest(people.member,data());assert.ok(r.flags.some(x=>x.includes('Inventaris')));
 await assert.rejects(()=>getRequest(people.member2,r.id),/akses/);
 await assert.rejects(()=>verifyRequest({...people.member,role:'FA'},r.id,'verify','',checklist),/Pemisahan/);
 await assert.rejects(()=>verifyRequest(people.fa,r.id,'verify','',checklist),/Nota/);
 const f=await fileForm('NOTA');await uploadDocument(people.member,r.id,f);
 await assert.rejects(()=>uploadDocument(people.member,r.id,f),/identik/);
 await assert.rejects(()=>verifyRequest(people.fa,r.id,'verify','',{}),/checklist/);
 await verifyRequest(people.fa,r.id,'verify','Semua bukti lengkap',checklist);
 await assert.rejects(()=>approveRequest({...people.fa,role:'GM'},r.id,'approve','Setuju sesuai kebutuhan'),/Pemisahan/);
 await approveRequest(people.gm,r.id,'approve','Setuju sesuai kebutuhan');
 await assert.rejects(()=>payRequest(people.fa,r.id,'TEST',1),/Pemisahan/);
 const proof=await uploadDocument(people.payer,r.id,await fileForm('BUKTI_TRANSFER'));
 await payRequest(people.payer,r.id,'TRANSFER-001',proof.id);
 assert.equal((await getRequest(people.member,r.id)).status,'Dicairkan');
 await assert.rejects(()=>payRequest(people.payer,r.id,'TRANSFER-002',proof.id),/sudah dicairkan/);
 const lockedForm=await fileForm('NOTA');await assert.rejects(()=>uploadDocument(people.member,r.id,lockedForm),/dikunci/);
 await operateRequest(people.member,r.id,'return',{amount:5000,note:'Barang cacat sebagian'});
 const ret=(await pool.query('SELECT id FROM returns WHERE request_id=$1',[r.id])).rows[0];
 await assert.rejects(()=>operateRequest(people.fa,r.id,'refund_confirm',{return_id:ret.id,note:'Dana sudah diterima'}),/Bukti/);
 await uploadDocument(people.member,r.id,await fileForm('BUKTI_REFUND'));
 await operateRequest(people.fa,r.id,'refund_confirm',{return_id:ret.id,note:'Dana dikembalikan toko'});
 assert.equal(Number((await pool.query("SELECT amount FROM cash_entries WHERE request_id=$1 AND kind='REFUND'",[r.id])).rows[0].amount),5000);
});
test('concurrent approvals cannot exceed division limit',async()=>{
 const a=await verified({items:[{rab_id:rab,component:'Bearing',quantity:1,unit_price:300000}]});
 const b=await verified({items:[{rab_id:rab,component:'Bearing',quantity:1,unit_price:300000}]});
 const results=await Promise.allSettled([approveRequest(people.gm,a.id,'approve','Setuju pengadaan A'),approveRequest(people.gm,b.id,'approve','Setuju pengadaan B')]);
 assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.match(results.find(x=>x.status==='rejected').reason.message,/Limit divisi/);
 const used=Number((await pool.query('SELECT sum(amount) AS n FROM budget_reservations WHERE week=$1 AND division=$2',[weekWIB(),'Mechanical'])).rows[0].n);assert.ok(used<=350000);
 await assert.rejects(()=>reallocate(people.fa,'Electrical','Mechanical',10000,'Alokasi tidak sah'),/kewenangan/);
 await reallocate(people.gm,'Electrical','Mechanical',10000,'Realokasi kebutuhan minggu ini');
});
test('advance, online evidence, split routing and urgent escalation work',async()=>{
 const r=await verified({kind:'ADVANCE',urgent:true});
 await approveRequest(people.gm,r.id,'approve','Sumber dana sponsor kas tersedia');
 const proof=await uploadDocument(people.payer,r.id,await fileForm('BUKTI_TRANSFER'));
 await payRequest(people.payer,r.id,'ADV-001',proof.id);
 await assert.rejects(()=>operateRequest(people.fa,r.id,'settle_verify',{note:'Pertanggungjawaban lengkap'}),/Nota/);
 await uploadDocument(people.member,r.id,await fileForm('NOTA',r.amount));
 await operateRequest(people.fa,r.id,'settle_verify',{note:'Pertanggungjawaban lengkap'});
 await operateRequest(people.gm,r.id,'settle_approve',{note:'Pertanggungjawaban disetujui'});
 assert.ok((await getRequest(people.member,r.id)).settled_at);
 const vendor='Toko splitting';const a=await createRequest(people.member,data({vendor,items:[{rab_id:rab,component:'Bearing',quantity:1,unit_price:500000}]}));
 const b=await createRequest(people.member,data({vendor,items:[{rab_id:rab,component:'Bearing',quantity:1,unit_price:400000}]}));
 assert.equal(b.route,'LANGSUNG');assert.equal((await getRequest(people.member,a.id)).route,'LANGSUNG');
 const urgent=await createRequest(people.member,data({urgent:true}));await pool.query("UPDATE requests SET urgent_due=now()-interval '1 hour' WHERE id=$1",[urgent.id]);
 await tick();await tick();assert.ok((await getRequest(people.member,urgent.id)).escalation_at);
 assert.equal(Number((await pool.query('SELECT count(*) AS n FROM notifications WHERE event_key=$1',[`urgent:${urgent.id}:${people.deputy.id}`])).rows[0].n),1);
 const online=await createRequest(people.member,data({channel:'ONLINE',tracking_number:'RESI123'}));
 await uploadDocument(people.member,online.id,await fileForm('INVOICE'));
 await assert.rejects(()=>verifyRequest(people.fa,online.id,'verify','',checklist),/online/);
 await uploadDocument(people.member,online.id,await fileForm('FOTO_BARANG'));await uploadDocument(people.member,online.id,await fileForm('TRACKING'));
 await verifyRequest(people.fa,online.id,'verify','Online lengkap',checklist);
});
test('lost receipt cap, correction deadline, appeals and physical handoff are recorded',async()=>{
 const r=await createRequest(people.member,data());
 await uploadDocument(people.member,r.id,await fileForm('PERNYATAAN'));await uploadDocument(people.member,r.id,await fileForm('MUTASI'));
 await operateRequest(people.member,r.id,'lost',{note:'Nota hilang dalam perjalanan'});
 await operateRequest(people.gm,r.id,'lost_approve',{note:'Bukti pengganti sudah lengkap'});
 await verifyRequest(people.fa,r.id,'correct','Perbaiki penjelasan kebutuhan',{});
 await operateRequest(people.member,r.id,'resubmit',{note:'Penjelasan kebutuhan sudah diperbaiki'});
 await verifyRequest(people.fa,r.id,'verify','Bukti pengganti lengkap',checklist);
 await operateRequest(people.fa,r.id,'handoff',{location:'Container arsip A',archived:true});
 const second=await createRequest(people.member,data());await uploadDocument(people.member,second.id,await fileForm('PERNYATAAN'));await uploadDocument(people.member,second.id,await fileForm('MUTASI'));
 await assert.rejects(()=>operateRequest(people.member,second.id,'lost',{note:'Nota hilang kedua kalinya'}),/Batas kasus/);
 await verifyRequest(people.fa,second.id,'correct','Invoice belum dapat dibaca',{});
 await pool.query("UPDATE requests SET correction_due=now()-interval '1 hour' WHERE id=$1",[second.id]);await tick();assert.equal((await getRequest(people.member,second.id)).status,'Ditolak');
 await operateRequest(people.member,second.id,'appeal',{note:'Meminta peninjauan waktu perbaikan'});
 await operateRequest(people.deputy,second.id,'appeal_accept',{note:'Diberi kesempatan perbaikan ulang'});assert.equal((await getRequest(people.member,second.id)).status,'Perlu Perbaikan');
 await assert.rejects(()=>pool.query('DELETE FROM audit_events'),/append-only/);
});

test('email outbox delivers to the local SMTP test service', {skip:!process.env.MAILPIT_TEST_URL}, async()=>{await tick();const response=await fetch(process.env.MAILPIT_TEST_URL+'/api/v1/messages');const messages=await response.json();assert.ok(messages.total>0);assert.ok(Number((await pool.query("SELECT count(*) AS n FROM notifications WHERE email_status='sent'")).rows[0].n)>0);});
test('unspent advance is settled only after the remainder returns to team cash',async()=>{
 const r=await verified({kind:'ADVANCE'});await approveRequest(people.gm,r.id,'approve','Dana advance tersedia');
 const proof=await uploadDocument(people.payer,r.id,await fileForm('BUKTI_TRANSFER'));await payRequest(people.payer,r.id,'ADV-PARTIAL',proof.id);
 await uploadDocument(people.member,r.id,await fileForm('NOTA',8000));
 await assert.rejects(()=>operateRequest(people.fa,r.id,'settle_verify',{note:'Periksa sisa dana advance'}),/Total/);
 await operateRequest(people.member,r.id,'return',{amount:2000,note:'Sisa dana advance tidak terpakai'});
 await uploadDocument(people.member,r.id,await fileForm('BUKTI_REFUND'));
 const ret=(await pool.query('SELECT id FROM returns WHERE request_id=$1',[r.id])).rows[0];await operateRequest(people.fa,r.id,'refund_confirm',{return_id:ret.id,note:'Sisa advance diterima kas'});
 await operateRequest(people.fa,r.id,'settle_verify',{note:'Nota dan sisa kas cocok'});await operateRequest(people.gm,r.id,'settle_approve',{note:'Seluruh advance dipertanggungjawabkan'});assert.ok((await getRequest(people.member,r.id)).settled_at);
});
test('public API roles cannot bypass row-level security on application records',async()=>{
 const role='fab_anon_'+Date.now();
 await pool.query(`CREATE ROLE ${role} NOLOGIN`);
 try{
  await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await pool.query(`GRANT SELECT ON users, requests TO ${role}`);
  await transaction(async c=>{await c.query(`SET LOCAL ROLE ${role}`);assert.equal(Number((await c.query('SELECT count(*) AS n FROM users')).rows[0].n),0);assert.equal(Number((await c.query('SELECT count(*) AS n FROM requests')).rows[0].n),0);});
  const flag=(await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.users'::regclass")).rows[0];assert.equal(flag.relrowsecurity,true);
 }finally{await pool.query(`DROP OWNED BY ${role}`);await pool.query(`DROP ROLE ${role}`);}
});
test('cloud receipt lifecycle and private export cleanup work without filesystem storage',async()=>{
 const originalFetch=globalThis.fetch,names=['STORAGE_DRIVER','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SMTP_HOST'];const saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));const objects=new Map();let stored,body;
 const storage=await import('../../lib/storage.mjs');const {publishExport}=await import('../../lib/export-file.mjs');
 Object.assign(process.env,{STORAGE_DRIVER:'supabase',SUPABASE_URL:'https://project.example.test',SUPABASE_SERVICE_ROLE_KEY:'fake-test-key-not-real',SMTP_HOST:''});
 globalThis.fetch=async(url,opts)=>{
  const pathname=new URL(url).pathname;
  if(pathname.includes('/bucket/'))return Response.json({public:false});
  if(pathname.includes('/object/sign/'))return Response.json({signedURL:'/object/sign/fab-documents/'+pathname.split('/').at(-1)+'?token=test'});
  if(opts.method==='POST'){objects.set(pathname.split('/').at(-1),Buffer.from(opts.body));return Response.json({status:'ok'});}
  if(opts.method==='DELETE'){for(const key of JSON.parse(opts.body).prefixes)objects.delete(key);return Response.json({status:'ok'});}
  const value=objects.get(pathname.split('/').at(-1));return value?new Response(value):new Response('missing',{status:404});
 };
 try{
  const r=await createRequest(people.member,data());const f=await fileForm('NOTA');const upload=await uploadDocument(people.member,r.id,f);
  stored=(await pool.query('SELECT * FROM documents WHERE id=$1',[upload.id])).rows[0];body=objects.get(stored.storage_key);assert.ok(body);assert.deepEqual(await storage.readDocument(stored),body);
  await assert.rejects(()=>uploadDocument(people.member,r.id,f),/identik/);assert.equal(objects.size,1);
  const result=await publishExport(people.gm,Buffer.from('PK-test-archive'),'application/zip','demo.zip');assert.equal(result.status,302);assert.equal(new URL(result.headers.get('location')).searchParams.get('download'),'demo.zip');assert.equal(objects.size,2);
  await pool.query("UPDATE export_archives SET expires_at=now()-interval '1 hour'");await tick();assert.equal(objects.size,1);assert.equal(Number((await pool.query('SELECT count(*) AS n FROM export_archives')).rows[0].n),0);
 }finally{
  globalThis.fetch=originalFetch;for(const key of names){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
  // Preserve a local copy for subsequent local browser export checks in this disposable DB.
  if(stored&&body)await storage.storeDocument(stored.storage_key,body,stored.mime);
 }
});
