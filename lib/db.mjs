import pg from 'pg';
let connectionString=process.env.DATABASE_URL;let ssl;
if(connectionString){
 let url;try{url=new URL(connectionString);}catch{throw new Error('DATABASE_URL harus berupa connection string PostgreSQL yang valid.');}
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL harus menggunakan protokol PostgreSQL.');
 if(!['127.0.0.1','localhost','db'].includes(url.hostname)||process.env.DATABASE_SSL_CA){
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  connectionString=url.toString();
  ssl={rejectUnauthorized:true,...(process.env.DATABASE_SSL_CA?{ca:process.env.DATABASE_SSL_CA.replace(/\\n/g,'\n')}:{})};
 }
}
const pool=globalThis.fabPool??new pg.Pool({connectionString,ssl,max:process.env.VERCEL?2:10,idleTimeoutMillis:10000,connectionTimeoutMillis:10000,allowExitOnIdle:true});
if(!globalThis.fabPool){pool.on('error',e=>console.error('Koneksi database idle terputus:',e.code||'DB_CONNECTION_ERROR'));globalThis.fabPool=pool;}
export default pool;
