import {ensureSimple} from '../lib/simple/db.mjs';
import {pathToFileURL} from 'node:url';
import nodemailer from 'nodemailer';
import pool from '../lib/db.mjs';
import {transaction} from '../lib/workflow.mjs';
import {readDocument,removeDocument,storageDriver} from '../lib/storage.mjs';
export async function tick() {
 await ensureSimple();
 if(storageDriver()==='supabase'){const expired=(await pool.query('SELECT storage_key FROM export_archives WHERE expires_at<now() LIMIT 10')).rows;for(const d of expired){await removeDocument(d.storage_key);await pool.query('DELETE FROM export_archives WHERE storage_key=$1',[d.storage_key]);}}
 const transport=process.env.SMTP_HOST?nodemailer.createTransport({pool:true,maxConnections:2,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000,host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined,requireTLS:process.env.SMTP_REQUIRE_TLS!=='false'}):null;
 await transaction(async c=>{
  const jobs=(await c.query("SELECT n.*,u.email FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.event_key LIKE 'simple:%' AND n.email_status IN ('pending','failed','unavailable') AND n.next_attempt<=now() AND n.attempts<5 ORDER BY n.id LIMIT $1 FOR UPDATE OF n SKIP LOCKED",[process.env.VERCEL?5:20])).rows;
  for(const n of jobs) {
   if(!transport||!n.email){await c.query("UPDATE notifications SET email_status='unavailable',next_attempt=now()+interval '5 minutes',last_error=$2 WHERE id=$1",[n.id,!transport?'SMTP_NOT_CONFIGURED':'USER_EMAIL_MISSING']);continue;}
   try {
    const attachments=[];
    const eventId=n.event_key.split(':')[1];
    const doc=(await c.query("SELECT f.* FROM simple_events e JOIN simple_payments p ON p.id=(e.details->>'payment')::bigint JOIN simple_files f ON f.id=p.file_id WHERE e.id=$1 AND e.action='Dana dicairkan'",[eventId])).rows[0];
    if(doc)attachments.push({filename:'bukti-transfer'+(doc.mime==='application/pdf'?'.pdf':'.jpg'),content:await readDocument(doc),contentType:doc.mime});
    const base=process.env.APP_URL||(process.env.VERCEL_PROJECT_PRODUCTION_URL?`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`:'');
    const url=base&&n.request_id?`\n${base.replace(/\/$/,'')}/requests/${n.request_id}`:'';
    await transport.sendMail({from:process.env.SMTP_FROM||'FAB <fab@example.test>',to:n.email,subject:n.subject,text:n.message+url,attachments});
    await c.query("UPDATE notifications SET email_status='sent',email_sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1",[n.id]);
   } catch(e) {await c.query("UPDATE notifications SET email_status='failed',attempts=attempts+1,next_attempt=now()+interval '5 minutes',last_error=$2 WHERE id=$1",[n.id,String(e.code||'DELIVERY_FAILED').slice(0,50)]);}
  }
 });
 if(transport)transport.close();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
if(process.argv.includes('--once')) { await tick();await pool.end(); }
else {let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});while(!stopping){try{await tick();}catch(e){console.error('Worker:',e.code||e.message);}await new Promise(r=>setTimeout(r,10000));}await pool.end();}

}
