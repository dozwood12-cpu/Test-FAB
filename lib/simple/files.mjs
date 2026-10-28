import {randomBytes,createHash} from 'node:crypto';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {storeDocument,removeDocument,uploadLimit} from '../storage.mjs';
export async function prepareFile(file){
 if(!file||typeof file.arrayBuffer!=='function'||file.size<20||file.size>uploadLimit())throw new Error(`Pilih foto atau PDF maksimal ${uploadLimit()/1048576} MB.`);
 const data=Buffer.from(await file.arrayBuffer());let mime;
 if(data.subarray(0,5).toString()==='%PDF-'){
 try{const pdf=await PDFDocument.load(data);if(pdf.getPageCount()<1||pdf.getPageCount()>50)throw new Error();}catch{throw new Error('PDF tidak valid atau lebih dari 50 halaman.');}mime='application/pdf';
 }else{let meta;try{meta=await sharp(data,{limitInputPixels:40000000}).metadata();}catch{throw new Error('Gunakan foto JPG, PNG, WebP atau PDF.');}if(!['jpeg','png','webp'].includes(meta.format)||Math.min(meta.width||0,meta.height||0)<400)throw new Error('Foto minimal 400 × 400 piksel agar nota dapat dibaca.');mime={jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[meta.format];}
 const result={name:String(file.name||'dokumen').slice(0,150),storage_key:randomBytes(24).toString('hex'),mime,size:data.length,sha256:createHash('sha256').update(data).digest('hex')};
 await storeDocument(result.storage_key,data,mime);return result;
}
export async function discard(file){if(file)try{await removeDocument(file.storage_key);}catch{console.error('SIMPLE_STORAGE_CLEANUP_FAILED');}}
