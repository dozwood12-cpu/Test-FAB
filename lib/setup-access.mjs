import {createHash,timingSafeEqual} from 'node:crypto';
export function verifySetupSecret(value){
 const expected=process.env.SETUP_SECRET;
 if(!expected||expected.length<32)return false;
 return timingSafeEqual(createHash('sha256').update(String(value||'')).digest(),createHash('sha256').update(expected).digest());
}
