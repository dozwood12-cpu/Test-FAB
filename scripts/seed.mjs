import {ensureSimple,pool} from '../lib/simple/db.mjs';
import {createDemo} from '../lib/simple/demo.mjs';
try{await ensureSimple();const actor=(await pool.query("SELECT * FROM users WHERE username='FAB' AND role='ADMIN' AND active")).rows[0];if(!actor)throw new Error('Akun Admin FAB tidak tersedia.');await createDemo(actor,process.env.DEMO_PASSWORD||'');console.log('Empat akun dan dua pengajuan contoh siap; tidak menambah kas.');}finally{await pool.end();}
