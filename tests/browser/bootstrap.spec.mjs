import {test,expect} from '@playwright/test';
import pg from 'pg';
test('setup and cron reject unknown callers, setup retains accounts and passwords',async({page,request})=>{
 if(!process.env.TEST_SETUP_SECRET||!process.env.TEST_CRON_SECRET)throw new Error('Gunakan tests/run-integration.mjs --browser.');
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try{
  const before=(await db.query("SELECT password_hash FROM users WHERE username='FAB'")).rows[0].password_hash;
  expect((await request.post('/api/setup')).status()).toBe(403);
  expect((await request.post('/api/cron')).status()).toBe(403);
  await page.goto('/setup');await page.getByLabel('Kode penyiapan').fill('incorrect-setup-key-'.repeat(3));await page.getByRole('button',{name:'Siapkan database dan akun FAB'}).click();await expect(page.locator('.error[role=alert]')).toContainText('tidak valid');
  const response=await request.post('/api/setup',{headers:{Authorization:'Bearer '+process.env.TEST_SETUP_SECRET}});
  expect(response.status()).toBe(200);expect((await response.json()).adminCreated).toBe(false);
  expect((await db.query("SELECT password_hash FROM users WHERE username='FAB'")).rows[0].password_hash).toBe(before);
  const cron=await request.post('/api/cron',{headers:{Authorization:'Bearer '+process.env.TEST_CRON_SECRET}});expect(cron.status()).toBe(200);
 }finally{await db.end();}
});
