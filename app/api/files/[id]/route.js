import {currentUser} from '../../../../lib/auth.mjs';
import {ensureSimple,pool} from '../../../../lib/simple/db.mjs';
import {getRequest,log} from '../../../../lib/simple/core.mjs';
import {readDocument,signedDocumentUrl} from '../../../../lib/storage.mjs';
import {tx} from '../../../../lib/simple/db.mjs';
export async function GET(request,{params}){
 const user=await currentUser();if(!user)return new Response('Login diperlukan',{status:401});await ensureSimple();const {id}=await params;if(!/^\d+$/.test(id))return new Response('Tidak ditemukan',{status:404});
 const f=(await pool.query('SELECT * FROM simple_files WHERE id=$1',[id])).rows[0];if(!f)return new Response('Tidak ditemukan',{status:404});
 try{await getRequest(user,f.request_id);}catch{return new Response('Tidak diizinkan',{status:403});}
 await tx(c=>log(c,user,f.request_id,'Dokumen dilihat','',{file:f.id}));
 const signed=await signedDocumentUrl(f);if(signed)return new Response(null,{status:302,headers:{Location:signed,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 return new Response(await readDocument(f),{headers:{'Content-Type':f.mime,'Content-Disposition':`inline; filename="dokumen-${f.id}${f.mime==='application/pdf'?'.pdf':'.jpg'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
