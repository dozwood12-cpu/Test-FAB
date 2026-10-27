import {mkdir,writeFile,unlink,readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import path from 'node:path';
export const uploadRoot=path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR||path.join(process.cwd(),'data','uploads'));
export function storageDriver(){const driver=process.env.STORAGE_DRIVER||(process.env.VERCEL||process.env.SUPABASE_URL?'supabase':'local');if(!['local','supabase'].includes(driver))throw new Error('STORAGE_DRIVER tidak valid.');return driver;}
export function uploadLimit(){return process.env.VERCEL?3*1024*1024:10*1024*1024;}
function validKey(key){if(!/^[a-f0-9]{48}$/.test(key))throw new Error('Storage key tidak valid.');return key;}
export function documentPath(doc){return path.join(/* turbopackIgnore: true */ uploadRoot,validKey(doc.storage_key));}
function config(){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,bucket=process.env.SUPABASE_STORAGE_BUCKET||'fab-documents';
 if(!url||!key)throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diatur di hosting.');
 const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname))throw new Error('SUPABASE_URL harus berupa URL project HTTPS.');
 if(!/^[A-Za-z0-9_-]{3,63}$/.test(bucket))throw new Error('Nama bucket tidak valid.');
 return {base:parsed.origin,key,bucket};
}
const privateBuckets=new Map();
async function requestStorage(c,route,options={}){
 const response=await fetch(`${c.base}/storage/v1${route}`,{...options,headers:{apikey:c.key,Authorization:`Bearer ${c.key}`,'Content-Type':'application/json',...options.headers},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(`Supabase Storage gagal (${response.status}). Periksa bucket privat dan API key server.`);
 return response;
}
async function api(route,{method='GET',body,contentType='application/json',headers={}}={}){
 const c=config(),cacheKey=`${c.base}/${c.bucket}`;
 if((privateBuckets.get(cacheKey)||0)<Date.now()){
  const bucket=await (await requestStorage(c,`/bucket/${c.bucket}`,{method:'GET'})).json();
  if(bucket.public!==false)throw new Error('Bucket dokumen harus privat. Matikan Public bucket di Supabase Storage.');
  privateBuckets.set(cacheKey,Date.now()+60000);
 }
 return requestStorage(c,route,{method,body,headers:{'Content-Type':contentType,...headers}});
}
export async function storeDocument(key,data,mime){
 validKey(key);
 if(storageDriver()==='local'){await mkdir(uploadRoot,{recursive:true});await writeFile(path.join(/* turbopackIgnore: true */ uploadRoot,key),data,{flag:'wx',mode:0o600});return;}
 const {bucket}=config();await api(`/object/${bucket}/${key}`,{method:'POST',body:data,contentType:mime,headers:{'x-upsert':'false'}});
}
export async function removeDocument(key){
 validKey(key);if(storageDriver()==='local'){await unlink(path.join(/* turbopackIgnore: true */ uploadRoot,key));return;}
 const {bucket}=config();await api(`/object/${bucket}`,{method:'DELETE',body:JSON.stringify({prefixes:[key]})});
}
export async function readDocument(doc){
 validKey(doc.storage_key);if(storageDriver()==='local')return readFile(/* turbopackIgnore: true */ documentPath(doc));
 const {bucket}=config();return Buffer.from(await (await api(`/object/authenticated/${bucket}/${doc.storage_key}`)).arrayBuffer());
}
export async function streamDocument(doc){
 validKey(doc.storage_key);if(storageDriver()==='local')return createReadStream(/* turbopackIgnore: true */ documentPath(doc));
 const {bucket}=config();const response=await api(`/object/authenticated/${bucket}/${doc.storage_key}`);return Readable.fromWeb(response.body);
}
export async function signedDocumentUrl(doc){
 validKey(doc.storage_key);if(storageDriver()==='local')return null;
 const {base,bucket}=config();const result=await (await api(`/object/sign/${bucket}/${doc.storage_key}`,{method:'POST',body:JSON.stringify({expiresIn:60})})).json();
 if(typeof result.signedURL!=='string')throw new Error('Supabase tidak mengembalikan tautan dokumen.');
 const signed=new URL(result.signedURL.startsWith('http')?result.signedURL:`${base}/storage/v1${result.signedURL.startsWith('/')?'':'/'}${result.signedURL}`);
 if(signed.origin!==base||!signed.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`))throw new Error('Tautan dokumen tidak valid.');return signed.toString();
}
