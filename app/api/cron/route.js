import {createHash,timingSafeEqual} from 'node:crypto';
import {tick} from '../../../scripts/worker.mjs';
export const maxDuration=60;
async function run(request){
 const key=process.env.CRON_SECRET,provided=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!key||key.length<32||!timingSafeEqual(createHash('sha256').update(key).digest(),createHash('sha256').update(provided).digest()))return Response.json({error:'Tidak diizinkan'},{status:403});
 try{await tick();return Response.json({status:'ok'});}catch{return Response.json({error:'Pengingat belum dapat dijalankan.'},{status:503});}
}
export {run as GET,run as POST};
