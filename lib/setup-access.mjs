import {createHash,timingSafeEqual} from 'node:crypto';
export function verifySetupSecret(value){
 const expected=process.env.SETUP_SECRET;
 if(!expected||expected.length<32)return false;
 return timingSafeEqual(createHash('sha256').update(String(value||'')).digest(),createHash('sha256').update(expected).digest());
}

export function setupFailureCode(error){
 const allowed=new Set(['28P01','3D000','42501','42P01','42703','ENOTFOUND','ECONNREFUSED','ETIMEDOUT','ECONNRESET','ENOENT','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','CERT_HAS_EXPIRED','ADMIN_PASSWORD_MISSING']);
 const code=allowed.has(error?.code)?error.code:'SETUP_FAILED';
 console.error('FAB_SETUP_FAILED',code);
 return code;
}
