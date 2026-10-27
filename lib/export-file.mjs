import {randomBytes} from 'node:crypto';
import {storeDocument,removeDocument,signedDocumentUrl} from './storage.mjs';
import {transaction} from './workflow.mjs';
export async function publishExport(user,body,mime,filename){
 if(body.length>40*1024*1024)throw new Error('Ekspor melebihi batas 40 MB per berkas pada paket demo.');
 const key=randomBytes(24).toString('hex');await storeDocument(key,body,mime);
 try{await transaction(c=>c.query('INSERT INTO export_archives(storage_key,user_id) VALUES($1,$2)',[key,user.id]));}catch(e){await removeDocument(key);throw e;}
 const link=new URL(await signedDocumentUrl({storage_key:key}));link.searchParams.set('download',filename);return new Response(null,{status:302,headers:{Location:link.toString(),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
