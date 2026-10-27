'use server';
import {redirect} from 'next/navigation';
import {checkOrigin} from '../../lib/auth.mjs';
import {verifySetupSecret,setupFailureCode} from '../../lib/setup-access.mjs';
import {initializeDatabase} from '../../lib/initialize.mjs';
export async function setup(form){
 await checkOrigin();if(!verifySetupSecret(form.get('secret')))redirect('/setup?error=secret');
 try{await initializeDatabase();}catch(error){redirect('/setup?error=database&code='+setupFailureCode(error));}
 redirect('/login?setup=1');
}
