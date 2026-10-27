import test from 'node:test';
import assert from 'node:assert/strict';
import {storeDocument,removeDocument,readDocument,streamDocument,signedDocumentUrl,storageDriver,uploadLimit} from '../lib/storage.mjs';
import {verifySetupSecret} from '../lib/setup-access.mjs';
const key='a'.repeat(48);
test('Supabase adapter sends private uploads and returns authorized signed URLs',async()=>{
 const original={...process.env},fetch=globalThis.fetch;const calls=[];
 Object.assign(process.env,{STORAGE_DRIVER:'supabase',SUPABASE_URL:'https://project.example.test',SUPABASE_SERVICE_ROLE_KEY:'fake-test-key-not-real',SUPABASE_STORAGE_BUCKET:'fab-documents'});
 globalThis.fetch=async(url,opts)=>{calls.push({url,opts});if(url.includes('/object/sign/'))return Response.json({signedURL:`/object/sign/fab-documents/${key}?token=test`});if(opts.method==='GET')return new Response('nota-test');return Response.json({Key:key});};
 try{
  await storeDocument(key,Buffer.from('nota-test'),'image/png');assert.equal(calls[0].opts.headers['x-upsert'],'false');assert.equal(calls[0].opts.headers.apikey,'fake-test-key-not-real');assert.equal(calls[0].opts.redirect,'error');
  assert.equal((await readDocument({storage_key:key})).toString(),'nota-test');
  const chunks=[];for await(const c of await streamDocument({storage_key:key}))chunks.push(c);assert.equal(Buffer.concat(chunks).toString(),'nota-test');
  const signed=await signedDocumentUrl({storage_key:key});assert.ok(signed.startsWith('https://project.example.test/storage/v1/object/sign/'));assert.ok(!signed.includes('fake-test-key'));
  await removeDocument(key);assert.deepEqual(JSON.parse(calls.at(-1).opts.body),{prefixes:[key]});
  await assert.rejects(()=>readDocument({storage_key:'../escape'}),/Storage key/);
  globalThis.fetch=async()=>Response.json({signedURL:'https://evil.example/object/sign/'});await assert.rejects(()=>signedDocumentUrl({storage_key:key}),/tidak valid/);
 }finally{globalThis.fetch=fetch;for(const name of Object.keys(process.env))if(!(name in original))delete process.env[name];Object.assign(process.env,original);}
});
test('Vercel never silently writes receipts to a temporary local disk',async()=>{
 const vars=['VERCEL','STORAGE_DRIVER','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const saved=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 try{process.env.VERCEL='1';for(const k of vars.slice(1))delete process.env[k];assert.equal(storageDriver(),'supabase');assert.equal(uploadLimit(),3*1024*1024);await assert.rejects(()=>readDocument({storage_key:key}),/belum diatur/);}finally{for(const k of vars){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
});
test('initialization secret rejects missing, short and wrong credentials',()=>{
 const original=process.env.SETUP_SECRET;
 try{delete process.env.SETUP_SECRET;assert.equal(verifySetupSecret(''),false);process.env.SETUP_SECRET='short';assert.equal(verifySetupSecret('short'),false);process.env.SETUP_SECRET='x'.repeat(48);assert.equal(verifySetupSecret('x'.repeat(48)),true);assert.equal(verifySetupSecret('y'.repeat(48)),false);}finally{if(original===undefined)delete process.env.SETUP_SECRET;else process.env.SETUP_SECRET=original;}
});
