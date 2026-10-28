import ExcelJS from 'exceljs';
import {currentUser} from '../../../lib/auth.mjs';
import {finance,log} from '../../../lib/simple/core.mjs';
import {ensureSimple,pool,tx} from '../../../lib/simple/db.mjs';
import {storageDriver} from '../../../lib/storage.mjs';
import {publishExport} from '../../../lib/export-file.mjs';
export const maxDuration=60;
export async function GET(){
 const user=await currentUser();if(!user||!finance(user))return new Response('Tidak diizinkan',{status:403});await ensureSimple();
 const data=await tx(async c=>{await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');return {
 requests:(await c.query('SELECT r.number,r.title,u.name AS pengusul,cc.name AS divisi,r.vendor,r.amount,r.status,r.purchase_date,r.due_date,COALESCE((SELECT sum(amount) FROM simple_payments WHERE request_id=r.id),0) AS dibayar FROM simple_requests r JOIN cost_centers cc ON cc.id=r.cost_center_id JOIN users u ON u.id=r.proposer_id ORDER BY r.id')).rows,
 journals:(await c.query('SELECT e.id,e.created_at,e.source_key,e.description,l.account_code,a.name,l.debit,l.credit,c.name AS divisi FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id JOIN gl_accounts a ON a.code=l.account_code LEFT JOIN cost_centers c ON c.id=l.cost_center_id ORDER BY e.id,l.id')).rows,
 budgets:(await c.query("SELECT c.name,c.budget,COALESCE((SELECT sum(amount) FROM simple_requests WHERE cost_center_id=c.id AND status IN ('Disetujui','Dicairkan')),0) AS terpakai FROM cost_centers c ORDER BY name")).rows,
 payments:(await c.query('SELECT p.id,r.number,p.amount,p.reference,u.name AS petugas,p.created_at FROM simple_payments p JOIN simple_requests r ON r.id=p.request_id JOIN users u ON u.id=p.actor_id ORDER BY p.id')).rows};});
 const book=new ExcelJS.Workbook();for(const [name,rows] of Object.entries(data)){const sheet=book.addWorksheet(name);if(!rows.length){sheet.addRow(['Belum ada data']);continue;}sheet.columns=Object.keys(rows[0]).map(key=>({header:key,key,width:25}));for(const row of rows)sheet.addRow(Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='string'&&/^\d+$/.test(value)&&!['number','account_code','source_key','reference'].includes(key)?Number(value):value])));sheet.getRow(1).font={bold:true};}
 const bytes=Buffer.from(await book.xlsx.writeBuffer());await tx(c=>log(c,user,null,'Laporan diunduh'));
 if(storageDriver()==='supabase')return publishExport(user,bytes,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','laporan-fab.xlsx');
 return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="laporan-fab.xlsx"','Cache-Control':'private, no-store'}});
}
