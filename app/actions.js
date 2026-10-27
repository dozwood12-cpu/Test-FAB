'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'node:crypto';
import pool from '../lib/db.mjs';
import {transaction,audit} from '../lib/workflow.mjs';
import { hashPassword, verifyPassword, validateMember } from '../lib/security.mjs';
import { checkOrigin, requireAdmin, tokenHash } from '../lib/auth.mjs';
export async function login(form) {
 await checkOrigin();
 const username = String(form.get('username') ?? '').trim().toLowerCase().slice(0,64);
 const password = String(form.get('password') ?? '');
 if (password.length > 128) redirect('/login?error=invalid');
 const client = await pool.connect();
 let user;
 try {
  await client.query('BEGIN');
  await client.query('INSERT INTO login_attempts(username) VALUES($1) ON CONFLICT DO NOTHING', [username]);
  const a = (await client.query('SELECT * FROM login_attempts WHERE username=$1 FOR UPDATE',[username])).rows[0];
  if (Date.now()-new Date(a.window_start).getTime() > 900000) {
   await client.query('UPDATE login_attempts SET failures=0,window_start=now() WHERE username=$1',[username]);
   a.failures=0;
  }
  if (a.failures >= 10) { await client.query('COMMIT'); redirect('/login?error=limited'); }
  user = (await client.query('SELECT * FROM users WHERE lower(username)=$1 AND active=true',[username])).rows[0];
  const valid = verifyPassword(password, user?.password_hash ?? hashPassword('dummy-password'));
  if (!user || !valid) {
   await client.query('UPDATE login_attempts SET failures=failures+1 WHERE username=$1',[username]);
   await audit(client,null,'LOGIN_FAILED',null,{username});
   await client.query('COMMIT');
   redirect('/login?error=invalid');
  }
  await client.query('DELETE FROM login_attempts WHERE username=$1',[username]);
  await audit(client,user,'LOGIN_SUCCEEDED',user.id);
  await client.query('COMMIT');
 } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
 const token = randomBytes(32).toString('hex');
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",[tokenHash(token),user.id]);
 (await cookies()).set('fab_session', token, {httpOnly:true, secure:process.env.COOKIE_SECURE === 'true',sameSite:'lax',path:'/',maxAge:28800});
 redirect(user.role === 'ADMIN' ? '/admin' : '/');
}
export async function logout() {
 await checkOrigin();
 const jar = await cookies();
 const token = jar.get('fab_session')?.value;
 if(token)await transaction(async c=>{const row=(await c.query('DELETE FROM sessions WHERE token_hash=$1 RETURNING user_id',[tokenHash(token)])).rows[0];if(row)await audit(c,{id:row.user_id},'LOGOUT',row.user_id);});
 jar.delete('fab_session'); redirect('/login');
}
export async function addMember(form) {
 await checkOrigin();
 const actor = await requireAdmin();
 const data = Object.fromEntries(['name','username','email','password','role','division'].map(k=>[k,String(form.get(k) ?? '').trim()]));
 data.password=String(form.get('password') ?? '');
 const error=validateMember(data);
 if(error) redirect('/admin?error='+encodeURIComponent(error));
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const result=await client.query('INSERT INTO users(name,username,email,password_hash,role,division) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[data.name,data.username,data.email,hashPassword(data.password),data.role,data.division]);
  await client.query('INSERT INTO audit_events(actor_id,action,target_id) VALUES($1,$2,$3)',[actor.id,'MEMBER_CREATED',result.rows[0].id]);
  await client.query('COMMIT');
 } catch(e) {
  await client.query('ROLLBACK');
  if(e.code==='23505') redirect('/admin?error='+encodeURIComponent('Username atau email sudah digunakan.'));
  throw e;
 } finally { client.release(); }
 revalidatePath('/admin'); redirect('/admin?success=1');
}
