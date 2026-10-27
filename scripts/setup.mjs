import {initializeDatabase} from '../lib/initialize.mjs';
import pool from '../lib/db.mjs';
try{const result=await initializeDatabase();console.log(result.created?'Akun admin FAB dibuat.':'Akun admin sudah ada; kata sandi tidak diubah.');console.log('Skema pengadaan siap.');}finally{await pool.end();}
