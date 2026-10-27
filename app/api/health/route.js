import pool from '../../../lib/db.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{await pool.query('SELECT 1');return Response.json({status:'ok'});}catch{return Response.json({status:'unavailable'},{status:503});}}
