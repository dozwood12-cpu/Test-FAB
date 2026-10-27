import test from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,validateMember} from '../lib/security.mjs';
test('passwords use salted hashes and reject incorrect credentials',()=>{
 const hash=hashPassword('contoh-kata-sandi');
 assert.equal(verifyPassword('contoh-kata-sandi',hash),true);
 assert.equal(verifyPassword('salah',hash),false);
 assert.notEqual(hash,hashPassword('contoh-kata-sandi'));
 assert.equal(verifyPassword('x','malformed'),false);
});
test('member validation rejects invalid roles, emails and passwords',()=>{
 const valid={name:'Anggota Uji',username:'anggota.uji',email:'uji@example.com',password:'contoh123',role:'ANGGOTA',division:'Mechanical'};
 assert.equal(validateMember(valid),null);
 for(const patch of [{role:'ROOT'},{email:'invalid'},{password:'123'},{division:'unknown'},{username:'a b'}]) assert.ok(validateMember({...valid,...patch}));
});
