import {pathToFileURL} from 'node:url';
import nodemailer from 'nodemailer';
import pool from '../lib/db.mjs';
import {transaction,getPolicy,ensureBudget,notify,notifyRole,event} from '../lib/workflow.mjs';
import {readDocument} from '../lib/files.mjs';
export async function tick() {
 await transaction(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(808009)');
  await ensureBudget(c,await getPolicy(c));
  const overdue=(await c.query("SELECT * FROM requests WHERE status='Perlu Perbaikan' AND correction_due<now() FOR UPDATE")).rows;
  for(const r of overdue) {await c.query("UPDATE requests SET status='Ditolak' WHERE id=$1",[r.id]);await event(c,r,null,'CORRECTION_EXPIRED','Ditolak','Batas perbaikan tiga hari terlewati. Banding tetap tersedia.');}
  const urgent=(await c.query("SELECT * FROM requests WHERE route='URGENT' AND urgent_due<now() AND urgent_responded_at IS NULL AND escalation_at IS NULL AND status IN ('Diajukan','Diverifikasi') FOR UPDATE")).rows;
  for(const r of urgent) {
   await c.query('UPDATE requests SET escalation_at=now() WHERE id=$1',[r.id]);
   const deputy=(await c.query("SELECT id FROM users WHERE role='GM' AND deputy AND active")).rows;
   if(deputy.length)await notify(c,deputy.map(u=>u.id),r,`Eskalasi urgent ${r.number}`,'Batas respons urgent terlewati. Mohon tindak lanjut.',`urgent:${r.id}`);
   else await notifyRole(c,'GM',r,`Eskalasi urgent ${r.number}`,'Wakil GM belum ditetapkan. Batas respons terlewati.',`urgent:${r.id}`);
   await c.query('INSERT INTO request_events(request_id,action,from_status,to_status,note) VALUES($1,$2,$3,$3,$4)',[r.id,'URGENT_ESCALATED',r.status,'Eskalasi otomatis ke wakil GM/GM.']);
  }
  const reminders=(await c.query("SELECT * FROM requests WHERE (status='Disetujui' AND payout_due<now()+interval '1 day') OR (kind='ADVANCE' AND status='Dicairkan' AND settled_at IS NULL AND advance_due<now()+interval '1 day') OR (status IN ('Diajukan','Perlu Perbaikan') AND purchase_due<=CURRENT_DATE+3)")).rows;
  for(const r of reminders) {
   const reason=r.status==='Disetujui'?'Pencairan mendekati/melewati SLA tujuh hari.':r.status==='Dicairkan'?'Pertanggungjawaban advance mendekati/melewati tenggat.':'Batas satu bulan sejak pembelian mendekat/terlewati. Lengkapi pengajuan.';
   await notify(c,[r.proposer_id],r,`Pengingat ${r.number}`,reason,`deadline:${r.id}:${r.status}:${new Date().toISOString().slice(0,10)}`);
   if(r.status==='Disetujui') await notifyRole(c,'FA',r,`SLA pencairan ${r.number}`,reason,`payout:${r.id}:${new Date().toISOString().slice(0,10)}`);
   if(r.status==='Dicairkan'&&new Date(r.advance_due)<new Date()) await notifyRole(c,'GM',r,`Advance terlambat ${r.number}`,reason,`advance-late:${r.id}`);
  }
 });
 const transport=process.env.SMTP_HOST?nodemailer.createTransport({pool:true,maxConnections:2,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000,host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,requireTLS:process.env.SMTP_REQUIRE_TLS!=='false'}):null;
 await transaction(async c=>{
  const jobs=(await c.query("SELECT n.*,u.email FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.email_status IN ('pending','failed','unavailable') AND n.next_attempt<=now() AND n.attempts<5 ORDER BY n.id LIMIT 20 FOR UPDATE OF n SKIP LOCKED")).rows;
  for(const n of jobs) {
   if(!transport||!n.email){await c.query("UPDATE notifications SET email_status='unavailable',next_attempt=now()+interval '5 minutes',last_error=$2 WHERE id=$1",[n.id,!transport?'SMTP_NOT_CONFIGURED':'USER_EMAIL_MISSING']);continue;}
   try {
    const attachments=[];
    if(n.request_id && n.subject.endsWith(': Dicairkan')) {
     const doc=(await c.query('SELECT d.* FROM disbursements p JOIN documents d ON d.id=p.document_id WHERE p.request_id=$1',[n.request_id])).rows[0];
     if(doc)attachments.push({filename:'bukti-transfer'+(doc.mime==='application/pdf'?'.pdf':doc.mime==='image/png'?'.png':doc.mime==='image/webp'?'.webp':'.jpg'),content:await readDocument(doc),contentType:doc.mime});
    }
    const url=process.env.APP_URL&&n.request_id?`\n${process.env.APP_URL.replace(/\/$/,'')}/requests/${n.request_id}`:'';
    await transport.sendMail({from:process.env.SMTP_FROM||'FAB <fab@example.test>',to:n.email,subject:n.subject,text:n.message+url,attachments});
    await c.query("UPDATE notifications SET email_status='sent',email_sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[n.id]);
   } catch(e) {await c.query("UPDATE notifications SET email_status='failed',attempts=attempts+1,next_attempt=now()+interval '5 minutes',last_error=$2 WHERE id=$1",[n.id,String(e.code||'DELIVERY_FAILED').slice(0,50)]);}
  }
 });
 if(transport)transport.close();
}
if(import.meta.url===pathToFileURL(process.argv[1]).href) {
if(process.argv.includes('--once')) { await tick();await pool.end(); }
else {let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});while(!stopping){try{await tick();}catch(e){console.error('Worker:',e.code||e.message);}await new Promise(r=>setTimeout(r,10000));}await pool.end();}

}
