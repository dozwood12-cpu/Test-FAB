export const maxDuration=60;
import {currentUser} from '../../../../lib/auth.mjs';
import {getRequest,transaction,audit} from '../../../../lib/workflow.mjs';
import {readDocument,signedDocumentUrl} from '../../../../lib/storage.mjs';
import pool from '../../../../lib/db.mjs';
export async function GET(request,{params}) {
 const user=await currentUser();if(!user)return new Response('Tidak diizinkan',{status:401});
 const {id}=await params;if(!/^\d+$/.test(id))return new Response('Tidak ditemukan',{status:404});
 const doc=(await pool.query('SELECT * FROM documents WHERE id=$1',[id])).rows[0];if(!doc)return new Response('Tidak ditemukan',{status:404});
 try{const r=await getRequest(user,doc.request_id);if(user.role==='HOD'&&String(user.id)!==String(r.proposer_id)&&['MUTASI','BUKTI_TRANSFER','BUKTI_REFUND','PERNYATAAN'].includes(doc.category))return new Response('Tidak diizinkan',{status:403});}catch{return new Response('Tidak diizinkan',{status:403});}
 const signed=await signedDocumentUrl(doc);await transaction(c=>audit(c,user,'DOCUMENT_VIEWED',doc.request_id,{document:doc.id}));
 if(signed)return new Response(null,{status:302,headers:{Location:signed,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 const body=await readDocument(doc);
 return new Response(body,{headers:{'Content-Type':doc.mime,'Content-Disposition':`inline; filename="dokumen-${doc.id}${doc.mime==='application/pdf'?'.pdf':doc.mime==='image/png'?'.png':doc.mime==='image/webp'?'.webp':'.jpg'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
