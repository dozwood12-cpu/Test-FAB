import pg from 'pg';
const pool = globalThis.fabPool ?? new pg.Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== 'production') globalThis.fabPool = pool;
export default pool;
