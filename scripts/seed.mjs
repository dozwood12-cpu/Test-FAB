import pool from '../lib/db.mjs';
import {seedDemo} from '../lib/demo.mjs';
try{await seedDemo(process.env.DEMO_PASSWORD);console.log('Data contoh siap; tanpa kas atau pencairan nyata. Password akun lama tidak diubah.');}finally{await pool.end();}
