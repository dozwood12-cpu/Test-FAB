import {readFile} from 'node:fs/promises';
import path from 'node:path';
import pool from '../db.mjs';
let ready;
export async function ensureSimple(){
 if(!ready)ready=(async()=>{
 const c=await pool.connect();try{
 const installed=(await c.query("SELECT to_regclass('public.simple_versions') AS table_name")).rows[0].table_name;
 if(installed&&Number((await c.query('SELECT count(*) AS n FROM simple_versions WHERE version IN (2,3)')).rows[0].n)===2)return;
 await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(908001)');
 if((await c.query("SELECT to_regclass('public.simple_versions') AS table_name")).rows[0].table_name&&Number((await c.query('SELECT count(*) AS n FROM simple_versions WHERE version IN (2,3)')).rows[0].n)===2){await c.query('COMMIT');return;}
 await c.query(await readFile(path.join(process.cwd(),'lib/simple/schema.sql'),'utf8'));
 // Data lama tidak dihitung ulang. Buku kas lama menjadi saldo pembukaan, satu kali.
 const existed=await c.query("SELECT version FROM simple_versions WHERE version=2");
 if(!existed.rowCount){
 const balance=Number((await c.query("SELECT COALESCE(sum(CASE WHEN kind='KELUAR' THEN -amount ELSE amount END),0) AS n FROM cash_entries")).rows[0].n);
 if(balance!==0){const e=(await c.query("INSERT INTO journal_entries(source_key,description) VALUES('legacy-opening','Saldo pembukaan dari buku kas versi lama; perlu rekonsiliasi bank') RETURNING id")).rows[0];
 await c.query('INSERT INTO journal_lines(entry_id,account_code,debit,credit) VALUES($1,$2,$3,$4),($1,$5,$4,$3)',[e.id,'1100',Math.max(balance,0),Math.max(-balance,0),'3100']);}
 await c.query("INSERT INTO simple_versions(version) VALUES(2) ON CONFLICT DO NOTHING");
 }
 await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 })().catch(e=>{ready=undefined;throw e;});
 return ready;
}
export async function tx(fn){await ensureSimple();const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export {pool};
