import {currentUser} from '../../../lib/auth.mjs';
import {transaction,audit} from '../../../lib/workflow.mjs';
import {documentPath} from '../../../lib/files.mjs';
import {ZipArchive} from 'archiver';
import {createReadStream} from 'node:fs';
import {PassThrough,Readable} from 'node:stream';
import {createHash} from 'node:crypto';
export async function GET(){
 const user=await currentUser();if(!user||!['FA','GM','ADMIN'].includes(user.role))return new Response('Tidak diizinkan',{status:403});
 const data=await transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const data={schema_version:1,exported_at:new Date().toISOString()};
  const tables=['policy','policy_history','approval_policies','rab_items','inventory','requests','request_items','documents','request_events','reviews','weekly_budgets','budget_weeks','budget_reservations','reallocations','cash_entries','disbursements','receipt_handoffs','lost_receipts','appeals','returns','sanctions','reconciliations','handover_notes','audit_events'];
  for(const table of tables)data[table]=(await c.query(`SELECT * FROM ${table}`)).rows;
  data.users=(await c.query('SELECT id,username,name,email,role,division,active,deputy,created_at,onboarded_at FROM users')).rows;
  data.notifications=(await c.query('SELECT id,user_id,request_id,subject,message,read_at,created_at,email_status,email_sent_at FROM notifications')).rows;return data;
 });
 // Check every file before responding so missing evidence cannot silently produce a successful export.
 const files=[];for(const d of data.documents){const file=documentPath(d);const hash=createHash('sha256');for await(const chunk of createReadStream(/* turbopackIgnore: true */ file))hash.update(chunk);if(hash.digest('hex')!==d.sha256)throw new Error('Integritas dokumen tidak sesuai.');files.push({file,name:`documents/${d.storage_key}`});}
 await transaction(c=>audit(c,user,'HANDOVER_EXPORTED',null,{documents:files.length}));
 const archive=new ZipArchive({zlib:{level:6}});const output=new PassThrough();archive.on('error',e=>output.destroy(e));archive.on('warning',e=>output.destroy(e));archive.pipe(output);
 archive.append(JSON.stringify(data,null,2),{name:'data.json'});
 archive.append('Paket serah terima Anargya FAB. data.json berisi metadata dan SHA-256 dokumen. documents/ berisi berkas privat; cocokkan storage_key dan mime dalam metadata. Tidak menyertakan hash kata sandi atau sesi. Simpan arsip secara aman. Paket ini untuk serah terima; pemulihan layanan menggunakan backup PostgreSQL dan volume dokumen sesuai docs/DEPLOYMENT.md.',{name:'README.txt'});
 for(const f of files)archive.file(f.file,{name:f.name});archive.finalize();
 return new Response(Readable.toWeb(output),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="FAB-serah-terima-${new Date().toISOString().slice(0,10)}.zip"`,'Cache-Control':'private, no-store'}});
}
