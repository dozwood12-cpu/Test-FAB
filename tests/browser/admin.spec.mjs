import {test,expect} from '@playwright/test';
import pg from 'pg';
test('admin login, persistent member creation, member access boundary and logout',async({page})=>{
 if(!process.env.TEST_ADMIN_PASSWORD) throw new Error('TEST_ADMIN_PASSWORD diperlukan');
 const suffix=Date.now(); const username=`uji.${suffix}`;
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try {
 await page.goto('/admin'); await expect(page).toHaveURL(/\/login/);
 await page.getByLabel('Username',{exact:true}).fill('FAB');
 await page.getByLabel('Kata sandi',{exact:true}).fill('incorrect');
 await page.getByRole('button',{name:'Masuk ke ruang kerja'}).click();
 await expect(page.locator('.error[role=alert]')).toContainText('salah');
 await page.getByLabel('Username',{exact:true}).fill('FAB');
 await page.getByLabel('Kata sandi',{exact:true}).fill(process.env.TEST_ADMIN_PASSWORD);
 await page.getByRole('button',{name:'Masuk ke ruang kerja'}).click();
 await expect(page).toHaveURL(/\/admin/);
 await page.getByLabel('Nama lengkap').fill('Anggota Pengujian');
 await page.getByLabel('Username',{exact:true}).fill(username);
 await page.getByLabel('Email',{exact:true}).fill(`${username}@example.com`);
 await page.getByLabel('Kata sandi awal').fill('Tes-anggota123');
 await page.getByRole('button',{name:'Tambahkan anggota'}).click();
 await expect(page.getByRole('status')).toContainText('berhasil');
 await expect(page.getByRole('cell').filter({hasText:username}).first()).toBeVisible();
 const result=await db.query('SELECT id,password_hash FROM users WHERE username=$1',[username]);
 expect(result.rowCount).toBe(1); expect(result.rows[0].password_hash).not.toBe('Tes-anggota123');
 await page.getByRole('button',{name:'Keluar'}).click();
 await expect(page).toHaveURL(/\/login/);
 await expect(page.getByRole('heading',{name:'Selamat datang kembali'})).toBeVisible();
 await page.getByLabel('Username',{exact:true}).fill(username);
 await page.getByLabel('Kata sandi',{exact:true}).fill('Tes-anggota123');
 await page.getByRole('button',{name:'Masuk ke ruang kerja'}).click();
 await expect(page.getByRole('heading',{name:'Halo, Anggota.'})).toBeVisible();
 await page.goto('/admin'); await expect(page).toHaveURL((process.env.FAB_TEST_BASE_URL||'http://127.0.0.1:3000')+'/');
 await page.getByRole('button',{name:'Keluar'}).click();
 await expect(page).toHaveURL(/\/login/);
 await expect(page.getByRole('heading',{name:'Selamat datang kembali'})).toBeVisible();
 await page.goto('/admin'); await expect(page).toHaveURL(/\/login/);
 } finally {
 await db.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE username=$1)',[username]);
 // Audit retained; detach target is unnecessary because audit target_id is an historical identifier.
 await db.query('UPDATE users SET active=false WHERE username=$1',[username]); await db.end();
 }
});
