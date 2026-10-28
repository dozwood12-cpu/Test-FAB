import {test,expect} from '@playwright/test';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {hashPassword} from '../../../lib/security.mjs';
import {todayWIB} from '../../../lib/rules.mjs';
import {PDFDocument} from 'pdf-lib';
const suffix=Date.now()+'-'+Math.floor(Math.random()*10000),password='Test-browser-123';let center;const people={};
async function pdf(label){const p=await PDFDocument.create();p.addPage().drawText(label+' '+randomUUID());return Buffer.from(await p.save());}
async function login(page,username,pass=password){await page.goto('/login');await page.getByLabel('Username',{exact:true}).fill(username);await page.getByLabel('Kata sandi',{exact:true}).fill(pass);await page.getByRole('button',{name:'Masuk ke ruang kerja'}).click();}
test.beforeAll(async()=>{
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});try{
 center=(await db.query('INSERT INTO cost_centers(name,budget) VALUES($1,500000) RETURNING *',['Browser '+suffix])).rows[0];
 for(const [key,role] of [['staff','ANGGOTA'],['other','ANGGOTA'],['fo','FA'],['payer','FA'],['lead','GM']])people[key]=(await db.query('INSERT INTO users(username,name,email,password_hash,role,division) VALUES($1,$1,$2,$3,$4,$5) RETURNING *',[key+'.'+suffix,key+'.'+suffix+'@example.test',hashPassword(password),role,center.name])).rows[0];
 }finally{await db.end();}
});
test('simple request → edit → FO → Lead → payout, permissions and reports',async({browser},info)=>{
 const contexts=[];async function as(key){const c=await browser.newContext({baseURL:process.env.FAB_TEST_BASE_URL,viewport:info.project.use.viewport});contexts.push(c);const p=await c.newPage();await login(p,people[key].username);await expect(p).toHaveURL(/\/requests$/);return p;}
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try{
 const staff=await as('staff');await staff.getByRole('link',{name:'Buat pengajuan'}).click();
 await staff.getByLabel('Judul pembelian').fill('Pembelian browser '+info.project.name);await staff.getByLabel('Nominal (Rp)').fill('30000');await staff.getByLabel('Toko / vendor').fill('Toko Browser');await staff.getByLabel('Tanggal pembelian').fill(todayWIB());await staff.getByLabel('Tujuan pembelian').fill('Penggunaan komponen uji browser');await staff.getByLabel('Rekening penerima').fill('Bank Uji 123 Anggota');await staff.getByLabel('Nota / invoice',{exact:true}).setInputFiles({name:'nota.pdf',mimeType:'application/pdf',buffer:await pdf('NOTA')});await staff.getByRole('button',{name:'Kirim pengajuan'}).click();await expect(staff).toHaveURL(/\/requests\/\d+\?success=1/);
 const path=new URL(staff.url()).pathname,id=path.split('/').pop();await staff.getByRole('link',{name:'Edit pengajuan'}).click();await expect(staff.getByLabel('Nominal (Rp)')).toHaveValue('30000');await staff.getByLabel('Judul pembelian').fill('Diedit '+info.project.name);await staff.getByRole('button',{name:'Simpan perubahan'}).click();await expect(staff.locator('.toolbar .badge')).toHaveText('Diajukan');
 const fo=await as('fo');await fo.goto(path);await fo.getByLabel('Nota dan anggaran sudah saya periksa').check();await fo.getByRole('button',{name:'Verifikasi',exact:true}).click();await expect(fo.locator('.toolbar .badge')).toHaveText('Diverifikasi');
 const lead=await as('lead');await lead.goto(path);await lead.getByRole('button',{name:'Approve',exact:true}).click();await expect(lead.locator('.toolbar .badge')).toHaveText('Disetujui');
 await fo.goto(path);await expect(fo.getByRole('button',{name:'Dana Dicairkan',exact:true})).toHaveCount(0);
 const payer=await as('payer');await payer.goto('/finance');await payer.getByText('Catat penerimaan dana',{exact:true}).click();await payer.getByLabel('Nominal diterima (Rp)').fill('100000');await payer.getByLabel('Sumber dana / referensi').fill('Dana pengujian browser '+suffix);await payer.getByRole('button',{name:'Dana Diterima'}).click();await expect(payer.getByRole('status')).toContainText('Berhasil');
 await payer.goto(path);await payer.getByLabel('Referensi transfer').fill('TRF-'+randomUUID());await payer.getByLabel('Bukti transfer',{exact:true}).setInputFiles({name:'bukti.pdf',mimeType:'application/pdf',buffer:await pdf('TRANSFER')});await payer.getByRole('button',{name:'Dana Dicairkan',exact:true}).click();await expect(payer.locator('.toolbar .badge')).toHaveText('Dicairkan');
 expect((await db.query("SELECT count(*) AS n FROM journal_entries WHERE request_id=$1",[id])).rows[0].n).toBe('2');
 const doc=staff.getByRole('link',{name:'nota.pdf'});const link=await doc.getAttribute('href');expect((await staff.request.get(link)).status()).toBe(200);
 const other=await as('other');expect((await other.request.get(link)).status()).toBe(403);await other.goto('/finance');await expect(other).toHaveURL(/\/requests$/);
 const exportResponse=await lead.request.get('/api/reports?format=xlsx');expect(exportResponse.status()).toBe(200);expect((await exportResponse.body()).subarray(0,2).toString()).toBe('PK');
 for(const p of ['/requests','/finance','/help','/account']){await lead.goto(p);await expect(lead.locator('main h1')).toBeVisible();expect(await lead.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
 await staff.goto('/requests');await staff.screenshot({path:'/tmp/fab-simple-'+info.project.name+'.png',fullPage:true});
 }finally{for(const c of contexts)await c.close();await db.end();}
});
test('admin creates, edits, resets and removes member access',async({page})=>{
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});try{
 await login(page,'FAB',process.env.TEST_ADMIN_PASSWORD);await expect(page).toHaveURL(/\/admin/);
 await page.getByText('＋ Tambah anggota',{exact:true}).click();
 const add=page.locator('details').filter({has:page.getByText('＋ Tambah anggota',{exact:true})}).first();
 const username='new.'+randomUUID().slice(0,12);await add.getByLabel('Nama lengkap').fill('Anggota Browser');await add.getByLabel('Username',{exact:true}).fill(username);await add.getByLabel('Password awal').fill(password);await add.getByRole('button',{name:'Tambah anggota',exact:true}).click();await expect(page.getByRole('status')).toContainText('Berhasil');
 const card=page.locator('section.card').filter({hasText:'@'+username}).first();await card.getByText('Edit anggota',{exact:true}).click();await card.getByLabel('Nama lengkap').fill('Anggota Diedit');await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/admin')),card.getByRole('button',{name:'Simpan anggota'}).click()]);await page.goto('/admin');await expect(card).toContainText('Anggota Diedit');
 await card.locator('summary').filter({hasText:/^Reset password$/}).click();await card.getByLabel('Password pengganti').fill('Password-baru-123');await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/admin')),card.getByRole('button',{name:'Reset password',exact:true}).click()]);await page.goto('/admin');
 await card.getByText('Hapus akses anggota',{exact:true}).click();await Promise.all([page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/admin')),card.getByRole('button',{name:'Hapus akses',exact:true}).click()]);await expect(card).toHaveCount(0);expect((await db.query('SELECT active FROM users WHERE username=$1',[username])).rows[0].active).toBe(false);
 await page.getByRole('button',{name:'Keluar'}).click();await login(page,username,'Password-baru-123');await expect(page.locator('.error[role=alert]')).toContainText('salah');
 }finally{await db.end();}
});
test('setup preserves passwords, unauthorized endpoints blocked and retired features removed',async({request})=>{
 expect((await request.post('/api/setup')).status()).toBe(403);expect((await request.get('/api/cron')).status()).toBe(403);expect((await request.get('/api/handover')).status()).toBe(410);expect((await request.get('/api/files/1')).status()).toBe(401);
 const setup=await request.post('/api/setup',{headers:{Authorization:'Bearer '+process.env.TEST_SETUP_SECRET}});expect(setup.status()).toBe(200);expect((await setup.json()).adminCreated).toBe(false);
});
