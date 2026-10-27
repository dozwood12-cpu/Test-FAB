import {publishExport} from '../../../lib/export-file.mjs';
import {currentUser} from '../../../lib/auth.mjs';
import {transaction,audit} from '../../../lib/workflow.mjs';
import {streamDocument,storageDriver} from '../../../lib/storage.mjs';
import {ZipArchive} from 'archiver';
import {PassThrough,Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {todayWIB} from '../../../lib/rules.mjs';
export const maxDuration=60;
export async function GET(request){
 const user=await currentUser();if(!user||!['FA','GM','ADMIN'].includes(user.role))return new Response('Tidak diizinkan',{status:403});
 const cloud=storageDriver()==='supabase';
 const data=await transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');const data={schema_version:1,exported_at:new Date().toISOString()};
  const tables=['policy','policy_history','approval_policies','rab_items','inventory','requests','request_items','documents','request_events','reviews','weekly_budgets','budget_weeks','budget_reservations','reallocations','cash_entries','disbursements','receipt_handoffs','lost_receipts','appeals','returns','sanctions','reconciliations','handover_notes','audit_events'];
  for(const table of tables)data[table]=(await c.query(`SELECT * FROM ${table}`)).rows;
  data.documents.sort((a,b)=>Number(a.id)-Number(b.id));
  data.users=(await c.query('SELECT id,username,name,email,role,division,active,deputy,created_at,onboarded_at FROM users')).rows;
  data.notifications=(await c.query('SELECT id,user_id,request_id,subject,message,read_at,created_at,email_status,email_sent_at FROM notifications')).rows;return data;
 });
 const json=JSON.stringify(data,null,2),limit=40*1024*1024;
 const parts=[[]];let size=Buffer.byteLength(json);
 if(cloud&&size>limit)return new Response('Metadata terlalu besar untuk ekspor demo serverless. Gunakan backup server sesuai panduan.',{status:422});
 for(const d of data.documents){if(cloud&&size+Number(d.size)>limit){parts.push([]);size=0;}parts.at(-1).push(d);size+=Number(d.size);}
 const q=new URL(request.url).searchParams.get('part');
 if(cloud&&parts.length>1&&q===null){
  const links=parts.map((_,i)=>`<li><a href="?part=${i+1}">Unduh bagian ${i+1} dari ${parts.length}</a></li>`).join('');
  return new Response(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Serah terima FAB</title><body style="font:16px/1.8 Arial;padding:24px;max-width:640px;margin:auto"><h1>Paket serah terima</h1><p>Arsip dibagi agar setiap berkas sesuai batas penyimpanan gratis. Unduh semua bagian; data.json terdapat pada bagian pertama. Hindari perubahan data saat mengunduh seluruh paket.</p><ol>${links}</ol><p><a href="/handover">Kembali</a></p></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 const part=q===null?1:Number(q);if(!Number.isInteger(part)||part<1||part>parts.length)return new Response('Bagian tidak valid',{status:400});
 const selected=cloud?parts[part-1]:data.documents;
 // Verify integrity before creating an archive. Private downloads are authorized above.
 for(const d of selected){const hash=createHash('sha256');for await(const chunk of await streamDocument(d))hash.update(chunk);if(hash.digest('hex')!==d.sha256)throw new Error('Integritas dokumen tidak sesuai.');}
 await transaction(c=>audit(c,user,'HANDOVER_EXPORTED',null,{documents:selected.length,part,parts:cloud?parts.length:1}));
 const archive=new ZipArchive({zlib:{level:6}}),output=new PassThrough();archive.on('error',e=>output.destroy(e));archive.on('warning',e=>output.destroy(e));archive.pipe(output);
 const chunks=[];const completed=cloud?new Promise((resolve,reject)=>{output.on('data',b=>chunks.push(b));output.on('end',resolve);output.on('error',reject);}):null;
 if(part===1||!cloud)archive.append(json,{name:'data.json'});
 archive.append(`Paket serah terima Anargya FAB. Bagian ${part} dari ${cloud?parts.length:1}. Unduh semua bagian dan ekstrak pada folder yang sama. data.json terdapat di bagian pertama. Cocokkan storage_key dan SHA-256 dokumen. Tidak menyertakan hash kata sandi atau sesi. Simpan arsip secara aman. Backup pemulihan layanan dijelaskan di docs/DEPLOYMENT.md.`,{name:`README-bagian-${part}.txt`});
 for(const d of selected)archive.append(await streamDocument(d),{name:`documents/${d.storage_key}`});archive.finalize();
 if(cloud){
  await completed;return publishExport(user,Buffer.concat(chunks),'application/zip',`FAB-serah-terima-${todayWIB()}-bagian-${part}.zip`);
 }
 return new Response(Readable.toWeb(output),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="FAB-serah-terima-${todayWIB()}.zip"`,'Cache-Control':'private, no-store'}});
}
