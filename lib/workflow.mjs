// Compatibility helpers for authentication, exports and read-only legacy documents.
import pool from './db.mjs';
export async function transaction(fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function audit(c,actor,action,target,details={}){await c.query('INSERT INTO audit_events(actor_id,action,target_id,details) VALUES($1,$2,$3,$4)',[actor?.id||null,action,target||null,JSON.stringify(details)]);}
export async function getRequest(user,id,c=pool){
 if(!/^\d+$/.test(String(id)))throw new Error('Pengajuan tidak ditemukan.');
 const r=(await c.query('SELECT * FROM requests WHERE id=$1',[id])).rows[0];
 if(!r||(!['FA','GM','ADMIN'].includes(user.role)&&String(r.proposer_id)!==String(user.id)))throw new Error('Tidak memiliki akses.');return r;
}
