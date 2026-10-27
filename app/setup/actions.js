'use server';
import {redirect} from 'next/navigation';
import {checkOrigin} from '../../lib/auth.mjs';
import {verifySetupSecret} from '../../lib/setup-access.mjs';
import {initializeDatabase} from '../../lib/initialize.mjs';
export async function setup(form){
 await checkOrigin();if(!verifySetupSecret(form.get('secret')))redirect('/setup?error=secret');
 try{await initializeDatabase();}catch{redirect('/setup?error=database');}
 redirect('/login?setup=1');
}
