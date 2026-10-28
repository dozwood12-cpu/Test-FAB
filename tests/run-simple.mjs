import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const base=new URL(process.env.DATABASE_URL||'postgresql://fab@127.0.0.1:5432/fab');
if(!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('Runner hanya membuat database sementara di PostgreSQL lokal.');
const name='fab_test_'+randomBytes(8).toString('hex');const admin=new pg.Pool({connectionString:base.toString()});const dir=await mkdtemp(path.join(os.tmpdir(),'fab-integration-'));
async function run(args,env){await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{stdio:'inherit',env:{...process.env,...env}});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`Test command exited ${code}`)));});}
try{
 await admin.query(`CREATE DATABASE ${name}`);base.pathname='/'+name;
 const env={DATABASE_URL:base.toString(),ADMIN_INITIAL_PASSWORD:randomBytes(24).toString('hex'),UPLOAD_DIR:dir,STORAGE_DRIVER:'local',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SETUP_SECRET:randomBytes(24).toString('hex'),CRON_SECRET:randomBytes(24).toString('hex'),SMTP_HOST:process.env.MAILPIT_TEST_URL?'127.0.0.1':'',SMTP_PORT:'1025',SMTP_REQUIRE_TLS:'false',SMTP_FROM:'FAB Test <test@example.test>'};
 await run(['scripts/setup.mjs'],env);
 if(!process.argv.includes('--browser-only'))await run(['--test','--test-concurrency=1','tests/simple/core.mjs'],env);

 if(process.argv.includes('--browser')||process.argv.includes('--browser-only')) {
  const port=3100;const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{stdio:'inherit',env:{...process.env,...env}});
  try{
   let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
   if(!ready)throw new Error('Server pengujian tidak siap.');
   await run(['node_modules/@playwright/test/cli.js','test'],{...env,TEST_ADMIN_PASSWORD:env.ADMIN_INITIAL_PASSWORD,TEST_SETUP_SECRET:env.SETUP_SECRET,TEST_CRON_SECRET:env.CRON_SECRET,FAB_TEST_BASE_URL:`http://127.0.0.1:${port}`});
  } finally {server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});}
 }

}finally{await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();await rm(dir,{recursive:true,force:true});}
