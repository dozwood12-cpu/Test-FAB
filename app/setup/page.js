export const maxDuration=60;
import {setup} from './actions';
export const metadata={title:'Penyiapan awal — Anargya FAB',robots:{index:false,follow:false}};
export default async function Setup({searchParams}){
 const q=await searchParams;
 return <main className="member card"><span className="eyebrow">ANARGYA GEN 8 · ADMINISTRATOR</span><h1>Penyiapan awal.</h1><p>Jalankan sekali setelah database Supabase terhubung. Kode penyiapan adalah nilai SETUP_SECRET yang Anda simpan di pengaturan hosting, berbeda dari kata sandi login.</p>{q.error&&<div role="alert" className="error">{q.error==='secret'?'Kode penyiapan tidak valid atau SETUP_SECRET belum diatur (minimal 32 karakter).':'Database belum dapat disiapkan. Periksa DATABASE_URL pooler, sertifikat TLS, dan ADMIN_INITIAL_PASSWORD di pengaturan hosting.'}{q.error==='database'&&<p>Kode diagnosis: {String(q.code||'SETUP_FAILED').replace(/[^A-Z0-9_]/g,'').slice(0,64)}. Sampaikan kode ini kepada pengelola aplikasi.</p>}</div>}<form action={setup}><label>Kode penyiapan<input name="secret" type="password" required minLength={32} autoComplete="off"/></label><button>Siapkan database dan akun FAB</button></form><p className="muted">Penyiapan berulang mempertahankan data dan kata sandi akun yang sudah ada. Jangan membagikan kode ini.</p></main>
}
