// Run web + scheduler in one hosting instance so both can access the same disk.
import {spawn} from 'node:child_process';
import {mkdir,chown,chmod,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
const upload=path.resolve(process.env.UPLOAD_DIR||'data/uploads');
if(upload===path.parse(upload).root)throw new Error('UPLOAD_DIR tidak boleh berupa root filesystem.');
process.env.APP_URL ||= process.env.RENDER_EXTERNAL_URL || '';
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT tidak valid.');
await mkdir(upload,{recursive:true,mode:0o700});
if(process.getuid?.()===0){
 await chown(upload,1000,1000);await chmod(upload,0o700);
 process.setgroups([1000]);process.setgid(1000);process.setuid(1000);
}
await access(upload,constants.W_OK);
const children=new Set();let stopping=false;let forced;
function stop(code=0){
 if(stopping)return;stopping=true;process.exitCode=code;
 for(const child of children)child.kill('SIGTERM');
 if(children.size){forced=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');},15000);forced.unref();}
}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
function start(args){
 const child=spawn(process.execPath,args,{stdio:'inherit',env:process.env});children.add(child);
 child.on('exit',()=>{children.delete(child);if(!children.size&&forced)clearTimeout(forced);});
 return child;
}
try{
 await new Promise((resolve,reject)=>{const setup=start(['scripts/setup.mjs']);setup.on('error',reject);setup.on('exit',code=>code===0?resolve():reject(new Error('Persiapan database gagal.')));});
 if(!stopping){
  for(const [name,args] of [['web',['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',String(port)]],['worker',['scripts/worker.mjs']]]){
   const child=start(args);child.on('error',()=>{console.error(name+' tidak dapat dimulai.');stop(1);});child.on('exit',()=>{if(!stopping){console.error(name+' berhenti; layanan akan dimulai ulang oleh hosting.');stop(1);}});
  }
 }
}catch(e){console.error(e.message);stop(1);}
