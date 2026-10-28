import {test,expect} from '@playwright/test';
import pg from 'pg';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import {PDFDocument} from 'pdf-lib';
import {hashPassword} from '../../lib/security.mjs';
import {todayWIB} from '../../lib/rules.mjs';
const suffix=Date.now().toString();const password='Pengujian-aman123';const users={};let rab,png;
test.beforeAll(async()=>{
 if(!process.env.DATABASE_URL?.includes('/fab_test_'))throw new Error('Pengujian alur hanya boleh berjalan pada database sementara fab_test_.');
 const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
 try{
 for(const [key,role] of [['member','ANGGOTA'],['other','ANGGOTA'],['fa','FA'],['payer','FA'],['gm','GM']]){users[key]=(await db.query('INSERT INTO users(username,name,email,password_hash,role,division) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[key+'.'+suffix,key+' Uji Browser',key+'.'+suffix+'@example.test',hashPassword(password),role,'Non-Technical'])).rows[0];}
 rab=(await db.query('INSERT INTO rab_items(code,title,division,budget) VALUES($1,$2,$3,$4) RETURNING id',['BROWSER-'+suffix,'Kebutuhan uji browser','Non-Technical',500000])).rows[0].id;
 await db.query("INSERT INTO cash_entries(kind,amount,note,actor_id) VALUES('MASUK',1000000,'Kas pengujian browser',$1)",[users.fa.id]);
 png=await sharp({create:{width:600,height:800,channels:3,background:'#ffffff'}}).composite([{input:Buffer.from('<svg width="600" height="800"><rect x="40" y="60" width="400" height="20" fill="black"/><rect x="40" y="120" width="300" height="10" fill="black"/><rect x="40" y="180" width="200" height="10" fill="black"/><rect x="40" y="500" width="400" height="50" fill="green"/></svg>')}]).png().toBuffer();
 }finally{await db.end();}
});
async function login(page,key){await page.goto('/login');await page.getByLabel('Username',{exact:true}).fill(users[key].username);await page.getByLabel('Kata sandi',{exact:true}).fill(password);await page.getByRole('button',{name:'Masuk ke ruang kerja'}).click();await expect(page).toHaveURL(/\/$/);}
test('purchase → receipt → FA → GM → different payer → exports and protected documents',async({browser},testInfo)=>{
 const contexts=[];
 async function pageFor(key){const context=await browser.newContext({baseURL:process.env.FAB_TEST_BASE_URL||'http://127.0.0.1:3000',viewport:testInfo.project.use.viewport});contexts.push(context);const page=await context.newPage();await login(page,key);return page;}
 try{
 const member=await pageFor('member');await member.goto('/requests/new');
 await expect(member.getByLabel('Nomor resi (wajib untuk online)')).toHaveCount(0);await member.getByLabel('Metode pembelian').selectOption('ONLINE');await expect(member.getByLabel('Nomor resi (wajib untuk online)')).toBeVisible();await member.getByLabel('Metode pembelian').selectOption('MANUAL');await expect(member.getByLabel('Alasan kebutuhan / catatan inventaris')).toBeHidden();
 await member.getByLabel('Judul kebutuhan').fill('Pembelian alat tulis pengujian');await member.getByLabel('Nama toko',{exact:true}).fill('Toko Browser '+suffix+' '+testInfo.project.name);await member.getByLabel('Tanggal pembelian',{exact:true}).fill(todayWIB());await member.getByLabel('Tujuan pembelian').fill('Administrasi pengujian '+testInfo.project.name);await member.getByRole('combobox',{name:'RAB',exact:true}).selectOption(rab);await member.getByLabel('Komponen',{exact:true}).fill('Alat tulis');await member.getByLabel('Rekening pencairan').fill('Bank Uji 123456 Anggota Uji');
 await member.getByRole('button',{name:'Buat pengajuan'}).click();await expect(member).toHaveURL(/\/requests\/\d+$/);const requestPath=new URL(member.url()).pathname;await expect(member.getByRole('heading',{name:'Nota & bukti pembayaran'})).toBeVisible();await expect(member.getByText('Rincian pembelian & rekening',{exact:true})).toBeVisible();
 await member.getByLabel('Berkas',{exact:true}).setInputFiles({name:'nota.png',mimeType:'image/png',buffer:await sharp(png).tint(testInfo.project.name==='mobile'?'#ccffdd':'#ffddcc').png().toBuffer()});await member.getByLabel('Nominal nota (Rp)').fill('10000');await member.getByText('Foto terbaca, utuh, toko/tanggal/nominal terlihat',{exact:true}).click();await member.getByText('Nota manual memiliki stempel toko',{exact:true}).click();await member.getByRole('button',{name:'Unggah dokumen'}).click();await expect(member.getByRole('status')).toContainText('berhasil');
 const fa=await pageFor('fa');await fa.goto(requestPath);for(const label of ['Sesuai RAB dan kebutuhan','Nominal dan tanggal sesuai','Bukti terbaca dan sah','Duplikasi dan splitting ditinjau','Riwayat dan inventaris ditinjau','Kelengkapan dokumen terpenuhi'])await fa.getByLabel(label,{exact:true}).check();await fa.getByLabel('Catatan / alasan spesifik',{exact:true}).fill('Semua bukti sesuai kebutuhan tim');await fa.getByRole('button',{name:'Simpan hasil verifikasi'}).click();await expect(fa.locator('.toolbar .badge')).toHaveText('Diverifikasi');
 const gm=await pageFor('gm');await gm.goto(requestPath);await gm.getByLabel('Catatan / alasan spesifik',{exact:true}).fill('Kebutuhan sesuai RAB dan disetujui');await gm.getByRole('button',{name:'Simpan keputusan GM'}).click();await expect(gm.locator('.toolbar .badge')).toHaveText('Disetujui');
 await fa.reload();await expect(fa.getByRole('button',{name:'Catat pencairan',exact:true})).toHaveCount(0);await expect(fa.getByText('Pencairan membutuhkan akun FA berbeda',{exact:false})).toBeVisible();
 const payer=await pageFor('payer');await payer.goto(requestPath);await payer.getByLabel('Berkas',{exact:true}).setInputFiles({name:'transfer.png',mimeType:'image/png',buffer:png});await payer.getByRole('button',{name:'Unggah dokumen'}).click();await expect(payer.getByRole('status')).toContainText('berhasil');await payer.getByLabel('Referensi transfer').fill('TRF-BROWSER-'+suffix);await payer.getByRole('button',{name:'Catat pencairan',exact:true}).click();await expect(payer.locator('.toolbar .badge')).toHaveText('Dicairkan');
 await member.reload();await expect(member.locator('.toolbar .badge')).toHaveText('Dicairkan');const docLink=member.getByRole('link',{name:'nota.png'});const documentPath=await docLink.getAttribute('href');expect((await member.request.get(documentPath)).status()).toBe(200);
 const other=await pageFor('other');expect((await other.request.get(documentPath)).status()).toBe(403);expect((await other.request.get(requestPath)).status()).toBe(404);expect((await other.request.get('/api/reports?month='+todayWIB().slice(0,7)+'&format=xlsx')).status()).toBe(403);
 const month=todayWIB().slice(0,7);const excel=await gm.request.get(`/api/reports?month=${month}&format=xlsx`);expect(excel.status()).toBe(200);const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await excel.body());expect(workbook.getWorksheet('Pengajuan').rowCount).toBeGreaterThan(1);expect(workbook.getWorksheet('Buku Kas')).toBeTruthy();
 const pdf=await gm.request.get(`/api/reports?month=${month}&format=pdf`);expect(pdf.status()).toBe(200);expect((await PDFDocument.load(await pdf.body())).getPageCount()).toBeGreaterThan(0);
 const zip=await gm.request.get('/api/handover');expect(zip.status()).toBe(200);expect((await zip.body()).subarray(0,2).toString()).toBe('PK');
 for(const path of ['/','/finance','/catalog','/help','/notifications','/audit','/handover','/account']){await gm.goto(path);await expect(gm.locator('main h1')).toBeVisible();expect(await gm.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
 await member.goto('/');await member.screenshot({path:'/tmp/fab-'+testInfo.project.name+'.png',fullPage:true});
 }finally{for(const c of contexts)await c.close();}
});
