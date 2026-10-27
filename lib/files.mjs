import {createHash,randomBytes} from 'node:crypto';
import {mkdir,writeFile,unlink,readFile} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
import {transaction,getRequest,audit} from './workflow.mjs';
import {assertDistinct,normalize,todayWIB} from './rules.mjs';
export const uploadRoot=path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR||path.join(process.cwd(),'data','uploads'));
export function documentPath(doc){if(!/^[a-f0-9]{48}$/.test(doc.storage_key))throw new Error('Invalid storage key');return path.join(/* turbopackIgnore: true */ uploadRoot,doc.storage_key);}
export async function readDocument(doc){return readFile(/* turbopackIgnore: true */ documentPath(doc));}
export async function uploadDocument(user,id,form) {
 const file=form.get('file');const category=String(form.get('category')||'');
 if(!file||typeof file.arrayBuffer!=='function'||file.size<20||file.size>10*1024*1024) throw new Error('Berkas wajib berukuran 20 byte sampai 10 MB.');
 const data=Buffer.from(await file.arrayBuffer());
 let mime,phash=null;
 if(data.subarray(0,5).toString()==='%PDF-') {
  try {const pdf=await PDFDocument.load(data);if(pdf.getPageCount()<1||pdf.getPageCount()>50)throw new Error();}catch{throw new Error('PDF tidak valid, terenkripsi, atau lebih dari 50 halaman.');}
  mime='application/pdf';
 }
 else {
  let meta;try{meta=await sharp(data,{limitInputPixels:40000000}).metadata();}catch{throw new Error('Berkas harus berupa JPEG, PNG, WebP, atau PDF yang valid.');}
  if(!['jpeg','png','webp'].includes(meta.format)||Math.min(meta.width||0,meta.height||0)<400) throw new Error('Foto harus JPEG/PNG/WebP dan minimal 400 piksel pada setiap sisi agar dapat dibaca.');
  const stats=await sharp(data).stats();if(stats.channels.every(c=>c.stdev<4))throw new Error('Foto tampak kosong atau kontras terlalu rendah. Unggah ulang dengan pencahayaan yang baik.');
  mime={jpeg:'image/jpeg',png:'image/png',webp:'image/webp'}[meta.format];
  const tiny=await sharp(data).resize(8,8,{fit:'fill'}).greyscale().raw().toBuffer();
  const average=[...tiny].reduce((a,b)=>a+b,0)/tiny.length;
  phash=[...tiny].map(b=>b>=average?'1':'0').join('');
 }
 const digest=createHash('sha256').update(data).digest('hex');const key=randomBytes(24).toString('hex');
 await mkdir(uploadRoot,{recursive:true});await writeFile(path.join(/* turbopackIgnore: true */ uploadRoot,key),data,{flag:'wx',mode:0o600});
 try {
  return await transaction(async c=>{
   const r=await getRequest(user,id,c,true);
   const isOwner=String(r.proposer_id)===String(user.id);
   if(category==='BUKTI_TRANSFER') {if(user.role!=='FA'||r.status!=='Disetujui') throw new Error('Bukti transfer hanya dapat diunggah pencair FA setelah persetujuan.');assertDistinct(r,user,'pay');}
   else if(category==='BUKTI_REFUND') {if(!isOwner&&user.role!=='FA') throw new Error('Tidak memiliki izin unggah refund.');if(r.status!=='Dicairkan') throw new Error('Refund hanya untuk pengajuan dicairkan.');}
   else {
    if(!isOwner) throw new Error('Hanya pengusul yang dapat mengunggah dokumen pengajuan.');
    if(!['Diajukan','Perlu Perbaikan'].includes(r.status)&&!(r.kind==='ADVANCE'&&r.status==='Dicairkan'&&!r.settled_at)) throw new Error('Dokumen pada tahap ini sudah dikunci.');
    if(!['NOTA','INVOICE','FOTO_BARANG','TRACKING','PERNYATAAN','MUTASI'].includes(category)) throw new Error('Kategori dokumen tidak valid.');
   }
   const receipt=['NOTA','INVOICE'].includes(category);let receiptDate=null,amount=null,vendor=null;
   if(receipt) {
    receiptDate=String(form.get('receipt_date')||'');amount=Number(form.get('receipt_amount'));vendor=normalize(form.get('receipt_vendor')||r.vendor);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)||receiptDate>todayWIB()||receiptDate<(r.kind==='ADVANCE'?todayWIB(new Date(r.submitted_at)):r.purchase_date.toISOString().slice(0,10))||!Number.isSafeInteger(amount)||amount<=0) throw new Error('Tanggal nota tidak boleh mendahului awal pengajuan advance / pembelian pertama dan nominal harus positif.');
    if(!form.get('legible')) throw new Error('Konfirmasikan keterbacaan dan kelengkapan foto.');
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['receipt:'+digest]);
    const duplicate=(await c.query("SELECT id FROM documents WHERE sha256=$1 AND category IN ('NOTA','INVOICE')",[digest])).rows[0];
    if(duplicate) throw new Error('Nota identik sudah pernah diunggah. Gunakan nota asli yang belum diajukan.');
    const tuple=(await c.query("SELECT request_id FROM documents WHERE vendor_key=$1 AND receipt_date=$2 AND receipt_amount=$3 AND category IN ('NOTA','INVOICE')",[vendor,receiptDate,amount])).rows;
    if(tuple.length) await c.query('UPDATE requests SET flags=flags||$2::jsonb WHERE id=$1',[id,JSON.stringify(['Potensi nota ganda: kombinasi toko, tanggal, dan nominal sama.'])]);
    if(phash) {
     const similar=(await c.query("SELECT id FROM documents WHERE perceptual_hash IS NOT NULL AND bit_count(perceptual_hash::bit(64) # $1::bit(64))<=4 AND category IN ('NOTA','INVOICE') LIMIT 1",[phash])).rowCount;
     if(similar) await c.query('UPDATE requests SET flags=flags||$2::jsonb WHERE id=$1',[id,JSON.stringify(['Foto nota mirip dengan unggahan sebelumnya; FA wajib memeriksa manual.'])]);
    }
   }
   const d=(await c.query('INSERT INTO documents(request_id,uploaded_by,category,original_name,storage_key,mime,size,sha256,perceptual_hash,vendor_key,receipt_date,receipt_amount,stamped,legible_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id',[id,user.id,category,String(file.name).slice(0,200),key,mime,data.length,digest,phash,vendor,receiptDate,amount,!!form.get('stamped'),!!form.get('legible')])).rows[0];
   await audit(c,user,'DOCUMENT_UPLOADED',id,{document:d.id,category,sha256:digest});return d;
  });
 } catch(e){await unlink(path.join(/* turbopackIgnore: true */ uploadRoot,key));throw e;}
}
