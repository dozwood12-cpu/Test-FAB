import {verifySetupSecret,setupFailureCode} from '../../../lib/setup-access.mjs';
import {initializeDatabase} from '../../../lib/initialize.mjs';
export const maxDuration=60;
export async function POST(request){
 if(!verifySetupSecret(request.headers.get('authorization')?.replace(/^Bearer /,'')))return Response.json({error:'Tidak diizinkan'},{status:403});
 try{const result=await initializeDatabase();return Response.json({status:'ok',adminCreated:result.created});}catch(error){const code=setupFailureCode(error);return Response.json({code,error:'Penyiapan database gagal. Periksa konfigurasi database dan password admin.'},{status:503});}
}
