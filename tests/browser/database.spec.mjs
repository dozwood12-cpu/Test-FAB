import {test,expect} from '@playwright/test';
import pg from 'pg';
test('admin checks database and creates repeatable dummy data with protected access',async({page})=>{
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try{
 await page.goto('/admin/database');await expect(page).toHaveURL(/\/login/);
 await page.getByLabel('Username',{exact:true}).fill('FAB');await page.getByLabel('Kata sandi',{exact:true}).fill(process.env.TEST_ADMIN_PASSWORD);await page.getByRole('button',{name:'Masuk ke ruang kerja'}).click();
 await expect(page).toHaveURL(/\/admin$/);await page.goto('/admin/database');
 await expect(page.getByRole('heading',{name:'Database & data contoh'})).toBeVisible();
 await expect(page.getByText(/Pengajuan tanpa pengusul: 0/)).toBeVisible();
 const cash=(await db.query('SELECT count(*) AS n FROM cash_entries')).rows[0].n;
 for(let i=0;i<2;i++){
 await page.getByLabel('Password untuk akun demo baru').fill('Dummy-test-12345');await page.getByLabel('Saya memahami data contoh').check();await page.getByRole('button',{name:'Buat data dummy'}).click();await expect(page.getByRole('status')).toContainText('berhasil');
 }
 expect((await db.query("SELECT count(*) AS n FROM users WHERE username LIKE 'demo.%'")).rows[0].n).toBe('6');
 expect((await db.query("SELECT count(*) AS n FROM requests WHERE title LIKE '[CONTOH]%'")).rows[0].n).toBe('3');
 expect((await db.query('SELECT count(*) AS n FROM cash_entries')).rows[0].n).toBe(cash);
 await page.getByRole('button',{name:'Keluar'}).click();await page.getByLabel('Username',{exact:true}).fill('demo.anggota');await page.getByLabel('Kata sandi',{exact:true}).fill('Dummy-test-12345');await page.getByRole('button',{name:'Masuk ke ruang kerja'}).click();await expect(page.getByRole('heading',{name:/Halo/})).toBeVisible();
 await page.goto('/admin/database');await expect(page).toHaveURL((process.env.FAB_TEST_BASE_URL||'http://127.0.0.1:3000')+'/');
 }finally{await db.end();}
});
