import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {ensureSimple,tx,pool} from '../../lib/simple/db.mjs';
import {saveRequest,uploadFile,decide,pay,receive,cashBalance,post,getRequest,setCenter} from '../../lib/simple/core.mjs';
import {prepareFile,discard} from '../../lib/simple/files.mjs';
import {createDemo} from '../../lib/simple/demo.mjs';
import {todayWIB} from '../../lib/rules.mjs';
import {PDFDocument} from 'pdf-lib';
const people={};let center;let i=0;
async function file(){const pdf=await PDFDocument.create();pdf.addPage().drawText('TEST RECEIPT '+randomUUID());return prepareFile(new File([await pdf.save()],'nota.pdf',{type:'application/pdf'}));}
const data=(extra={})=>({cost_center_id:center,title:'Pembelian '+(++i),vendor:'Toko Uji',purpose:'Penggunaan untuk pengujian tim',amount:20000,purchase_date:todayWIB(),bank_details:'Rekening uji 123',...extra});
async function create(extra={}){const f=await file();try{return await saveRequest(people.staff,data(extra),f);}catch(e){await discard(f);throw e;}}
async function approved(extra={}){const r=await create(extra);await decide(people.fo,r.id,'verify','','5100');await decide(people.lead,r.id,'approve');return r;}
before(async()=>{
 // Simulate a pre-existing cash balance before installing new ledger.
 await pool.query("INSERT INTO cash_entries(kind,amount,note,actor_id) SELECT 'MASUK',100000,'Saldo sebelum upgrade',id FROM users WHERE username='FAB'");
 await ensureSimple();
 center=(await pool.query("INSERT INTO cost_centers(name,budget) VALUES('Divisi Uji',1000000) RETURNING id")).rows[0].id;
 for(const [key,role] of [['staff','ANGGOTA'],['other','ANGGOTA'],['fo','FA'],['payer','FA'],['lead','GM'],['admin','ADMIN']])people[key]=(await pool.query('INSERT INTO users(username,name,password_hash,role,division) VALUES($1,$1,$2,$3,$4) RETURNING *',[key,'not-for-login',role,'Divisi Uji'])).rows[0];
});
after(()=>pool.end());
test('opening balance preserved once and requests remain separate from legacy',async()=>{
 assert.equal(await cashBalance(),100000);await ensureSimple();assert.equal(await cashBalance(),100000);
 assert.equal((await pool.query("SELECT count(*) AS n FROM journal_entries WHERE source_key='legacy-opening'")).rows[0].n,'1');
});
test('submission requires valid amount, receipt, center and date; edit preserves number',async()=>{
 await assert.rejects(()=>saveRequest(people.staff,data()),/Nota/);
 await assert.rejects(()=>create({amount:9999}),/Minimal/);
 await assert.rejects(()=>create({purchase_date:'2026-02-30'}),/Tanggal/);
 await assert.rejects(()=>create({cost_center_id:999999}),/divisi/);
 const r=await create();const changed=await saveRequest(people.staff,data({title:'Diperbaiki'}),null,r.id);assert.equal(changed.number,r.number);
 await assert.rejects(()=>getRequest(people.other,r.id),/diakses/);
 await assert.rejects(()=>saveRequest(people.other,data(),null,r.id),/diakses/);
 await decide(people.fo,r.id,'correct','Nominal nota belum sesuai');await saveRequest(people.staff,data(),null,r.id);assert.equal((await getRequest(people.staff,r.id)).status,'Diajukan');
 await decide(people.fo,r.id,'verify');await assert.rejects(()=>saveRequest(people.staff,data(),null,r.id),/sebelum verifikasi/);
});
test('approval posts balanced payable; partial and full payouts update ledger atomically',async()=>{
 const start=await cashBalance();const r=await approved({amount:30000});
 assert.equal(await cashBalance(),start);
 await assert.rejects(()=>pay(people.fo,r.id,30000,'Transfer',awaitableFile(),randomUUID()),/Pemisahan/);
 function awaitableFile(){return '99999';}
 const first=await file();const token=randomUUID();await pay(people.payer,r.id,10000,'Termin pertama',first,token);
 assert.equal(await cashBalance(),start-10000);assert.equal((await getRequest(people.staff,r.id)).status,'Disetujui');
 const retry=await file();await assert.rejects(()=>pay(people.payer,r.id,10000,'Klik ulang',retry,token));await discard(retry);assert.equal(await cashBalance(),start-10000);
 await pay(people.payer,r.id,20000,'Pelunasan',await file(),randomUUID());assert.equal((await getRequest(people.staff,r.id)).status,'Dicairkan');assert.equal(await cashBalance(),start-30000);
 const outstanding=Number((await pool.query("SELECT COALESCE(sum(credit-debit),0) AS n FROM journal_lines WHERE account_code='2100' AND cost_center_id=$1",[center])).rows[0].n);assert.equal(outstanding,0);
});
test('posted journals reject changes, extra lines and unbalanced posting',async()=>{
 const e=(await pool.query('SELECT id FROM journal_entries ORDER BY id LIMIT 1')).rows[0];
 await assert.rejects(()=>pool.query('UPDATE journal_entries SET description=$1 WHERE id=$2',['ubah',e.id]),/tidak dapat diubah/);
 await assert.rejects(()=>pool.query('DELETE FROM journal_lines WHERE entry_id=$1',[e.id]),/tidak dapat diubah/);
 await assert.rejects(()=>pool.query("INSERT INTO journal_lines(entry_id,account_code,debit) VALUES($1,'1100',1)",[e.id]),/sudah dibukukan/);
 await assert.rejects(()=>tx(c=>post(c,people.fo,'bad:'+randomUUID(),'Tidak seimbang',[{account:'1100',debit:100}])) ,/minimal dua|debit sama/);
 assert.equal((await pool.query("SELECT count(*) AS n FROM journal_entries WHERE source_key LIKE 'bad:%'")).rows[0].n,'0');
});
test('concurrent approvals cannot exceed budget and unauthorized roles cannot approve',async()=>{
 const cc=(await pool.query("INSERT INTO cost_centers(name,budget) VALUES('Batas Uji',30000) RETURNING id")).rows[0];
 const staff={...people.staff,division:'Batas Uji'};
 const a=await saveRequest(staff,data({cost_center_id:cc.id}),await file());const b=await saveRequest(staff,data({cost_center_id:cc.id}),await file());
 await decide(people.fo,a.id,'verify');await decide(people.fo,b.id,'verify');
 await assert.rejects(()=>decide(people.admin,a.id,'approve'),/Lead/);
 const result=await Promise.allSettled([decide(people.lead,a.id,'approve'),decide(people.lead,b.id,'approve')]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);
 await assert.rejects(()=>setCenter(people.lead,{id:cc.id,name:'Batas Uji',budget:10000,active:true}),/komitmen/);
});
test('receipt duplicates rejected and cancellation cannot affect approved requests',async()=>{
 const f=await file();const r=await saveRequest(people.staff,data(),f);
 await assert.rejects(()=>saveRequest(people.staff,data(),{...f,storage_key:randomBytes(24).toString('hex')}),/Nota yang sama/);
 await decide(people.staff,r.id,'cancel','Pembelian dibatalkan');assert.equal((await getRequest(people.staff,r.id)).status,'Dibatalkan');
 const a=await approved();await assert.rejects(()=>decide(people.staff,a.id,'cancel','Batalkan'),/diverifikasi/);
});
test('insufficient cash rolls back payment, file metadata, journal and status',async()=>{
 await setCenter(people.lead,{id:center,name:'Divisi Uji',budget:10000000,active:true});const r=await approved({amount:2000000});const f=await file();const before=await cashBalance();
 await assert.rejects(()=>pay(people.payer,r.id,2000000,'Terlalu besar',f,randomUUID()),/Saldo kas/);await discard(f);
 assert.equal(await cashBalance(),before);assert.equal((await pool.query('SELECT count(*) AS n FROM simple_payments WHERE request_id=$1',[r.id])).rows[0].n,'0');
 assert.equal((await pool.query('SELECT count(*) AS n FROM simple_files WHERE storage_key=$1',[f.storage_key])).rows[0].n,'0');
});
test('cash receipts are idempotent and demo data repeat without fake cash or payouts',async()=>{
 const token=randomUUID();const before=await cashBalance();await receive(people.fo,10000,'Penerimaan sponsor uji',token);await assert.rejects(()=>receive(people.fo,10000,'Ulang',token));assert.equal(await cashBalance(),before+10000);
 const count=await pool.query('SELECT count(*) AS n FROM simple_payments');await createDemo(people.admin,'Password-contoh-123');await createDemo(people.admin,'Password-baru-123');
 assert.equal((await pool.query("SELECT count(*) AS n FROM users WHERE username LIKE 'contoh.%'")).rows[0].n,'4');assert.equal((await pool.query("SELECT count(*) AS n FROM simple_requests WHERE title LIKE '[CONTOH]%'")).rows[0].n,'2');assert.equal(await cashBalance(),before+10000);assert.equal((await pool.query('SELECT count(*) AS n FROM simple_payments')).rows[0].n,count.rows[0].n);
});
test('non-owner database roles cannot read application tables through public APIs',async()=>{
 const role='simple_reader_'+randomBytes(5).toString('hex');const c=await pool.connect();try{
 await c.query('BEGIN');await c.query('CREATE ROLE '+role);await c.query('GRANT USAGE ON SCHEMA public TO '+role);await c.query('GRANT SELECT ON simple_requests,journal_entries,simple_files TO '+role);await c.query('SET LOCAL ROLE '+role);
 assert.equal((await c.query('SELECT count(*) AS n FROM simple_requests')).rows[0].n,'0');assert.equal((await c.query('SELECT count(*) AS n FROM journal_entries')).rows[0].n,'0');
 }finally{await c.query('ROLLBACK');c.release();}
});
test('payment outbox delivers email with receipt through local SMTP',{skip:!process.env.MAILPIT_TEST_URL},async()=>{
 await pool.query("UPDATE users SET email='simple.staff@example.test' WHERE id=$1",[people.staff.id]);
 const r=await approved({amount:10000});await pay(people.payer,r.id,10000,'Transfer notifikasi',await file(),randomUUID());
 const n=(await pool.query("SELECT * FROM notifications WHERE user_id=$1 AND event_key LIKE 'simple:%' ORDER BY id DESC LIMIT 1",[people.staff.id])).rows[0];
 await pool.query("UPDATE notifications SET next_attempt=now()+interval '1 day' WHERE id<>$1",[n.id]);
 const {tick}=await import('../../scripts/worker.mjs');await tick();
 assert.equal((await pool.query('SELECT email_status FROM notifications WHERE id=$1',[n.id])).rows[0].email_status,'sent');
});

test('cut-over freezes financial writes from old deployments',async()=>{
 await assert.rejects(()=>pool.query("INSERT INTO cash_entries(kind,amount,note,actor_id) VALUES('MASUK',1,'Stale deployment',$1)",[people.fo.id]),/read-only/);
 await assert.rejects(()=>pool.query("INSERT INTO requests(proposer_id,division,title,vendor,vendor_key,purpose,purpose_key,amount,purchase_date,kind,channel,route,bank_details,generation,policy_snapshot,purchase_due) VALUES($1,'Divisi Uji','Stale','Vendor','vendor','Tujuan','tujuan',10000,CURRENT_DATE,'REIMBURSEMENT','MANUAL','REGULER','Bank','Gen 8','{}',CURRENT_DATE)",[people.staff.id]),/read-only/);
});
