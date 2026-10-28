import {readFile} from 'node:fs/promises';
import path from 'node:path';
import pool from './db.mjs';
import {hashPassword} from './security.mjs';
export async function initializeDatabase(){
 const c=await pool.connect();
 try{
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(808010)');
await c.query(`
CREATE TABLE IF NOT EXISTS users (
 id bigserial PRIMARY KEY, username text NOT NULL, name text NOT NULL,
 email text, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('ANGGOTA','HOD','FA','GM','ADMIN')),
 division text, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci ON users(lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci ON users(lower(email)) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id bigint NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
 username text PRIMARY KEY, failures integer NOT NULL DEFAULT 0, window_start timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
 id bigserial PRIMARY KEY, actor_id bigint REFERENCES users(id), action text NOT NULL,
 target_id bigint, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION prevent_audit_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit bersifat append-only'; END; $$;
DROP TRIGGER IF EXISTS audit_immutable ON audit_events;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_events
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_changes();
`);
const found = await c.query('SELECT id FROM users WHERE lower(username) = $1', ['fab']);
if (!found.rowCount) {
 if (!process.env.ADMIN_INITIAL_PASSWORD) throw Object.assign(new Error('ADMIN_INITIAL_PASSWORD diperlukan untuk akun admin pertama.'),{code:'ADMIN_PASSWORD_MISSING'});
 await c.query('INSERT INTO users(username,name,password_hash,role) VALUES($1,$2,$3,$4)', ['FAB','Administrator FAB',hashPassword(process.env.ADMIN_INITIAL_PASSWORD),'ADMIN']);

}
await c.query(await readFile(path.join(process.cwd(),'lib','schema.sql'),'utf8'));
await c.query(await readFile(path.join(process.cwd(),'lib','simple','schema.sql'),'utf8'));
await c.query('COMMIT');return {created:!found.rowCount};

 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
