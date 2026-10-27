import { cookies, headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import pool from './db.mjs';
export const tokenHash = t => createHash('sha256').update(t).digest('hex');
export async function currentUser() {
 const token = (await cookies()).get('fab_session')?.value;
 if (!token) return null;
 const result = await pool.query('SELECT u.id,u.name,u.role,u.username,u.division,u.deputy,u.onboarded_at,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active=true', [tokenHash(token)]);
 return result.rows[0] ?? null;
}
export async function requireAdmin() {
 const user = await currentUser();
 if (!user) redirect('/login');
 if (user.role !== 'ADMIN') redirect('/');
 return user;
}
export async function checkOrigin() {
 const h = await headers();
 const origin = h.get('origin');
 if (!origin || new URL(origin).host !== h.get('host')) throw new Error('Origin tidak diizinkan');
}

export async function requireUser() { const user=await currentUser(); if(!user) redirect('/login'); return user; }
