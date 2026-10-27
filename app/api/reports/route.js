import {currentUser} from '../../../lib/auth.mjs';
import pool from '../../../lib/db.mjs';
import {transaction,audit} from '../../../lib/workflow.mjs';
import {money} from '../../../lib/rules.mjs';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
export async function GET(request){
 const user=await currentUser();if(!user||!['FA','GM','ADMIN'].includes(user.role))return new Response('Tidak diizinkan',{status:403});
 const url=new URL(request.url),month=url.searchParams.get('month'),format=url.searchParams.get('format');
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!['xlsx','pdf'].includes(format))return new Response('Bulan/format tidak valid',{status:400});
 const start=month+'-01';
 const {requests,cash,rab,recon}=await transaction(async c=>{
  await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  return {requests:(await c.query('SELECT r.number,r.title,u.name AS proposer,r.division,r.purchase_date,r.amount,r.route,r.kind,r.status,r.paid_at FROM requests r JOIN users u ON u.id=r.proposer_id WHERE r.purchase_date >= $1::date AND r.purchase_date< $1::date+interval \'1 month\' ORDER BY r.number',[start])).rows,
  cash:(await c.query("SELECT c.kind,c.amount,c.note,c.created_at,r.number FROM cash_entries c LEFT JOIN requests r ON r.id=c.request_id WHERE c.created_at>=($1::date AT TIME ZONE 'Asia/Jakarta') AND c.created_at<(($1::date+interval '1 month') AT TIME ZONE 'Asia/Jakarta') ORDER BY c.created_at",[start])).rows,
  rab:(await c.query("SELECT b.code,b.title,b.division,b.budget,COALESCE(sum(i.quantity*i.unit_price) FILTER(WHERE r.status<>'Ditolak'),0) AS requested,COALESCE(sum(i.quantity*i.unit_price) FILTER(WHERE r.status='Dicairkan'),0) AS paid FROM rab_items b LEFT JOIN request_items i ON i.rab_id=b.id LEFT JOIN requests r ON r.id=i.request_id AND r.purchase_date >=$1::date AND r.purchase_date<$1::date+interval '1 month' GROUP BY b.id ORDER BY b.code",[start])).rows,
  recon:(await c.query('SELECT * FROM reconciliations WHERE month=$1',[start])).rows};
 });
 await transaction(c=>audit(c,user,'REPORT_EXPORTED',null,{month,format,requests:requests.length}));
 let body,mime;
 if(format==='xlsx'){
  const workbook=new ExcelJS.Workbook();workbook.creator='Anargya FAB';
  const definitions=[['Pengajuan',requests,['number','title','proposer','division','purchase_date','amount','route','kind','status','paid_at'],['Nomor','Judul','Pengusul','Divisi','Tanggal pembelian','Nominal','Jalur','Jenis','Status','Dicairkan']],['Buku Kas',cash,['created_at','kind','number','amount','note'],['Tanggal','Jenis','Pengajuan','Nominal','Catatan']],['RAB',rab,['code','title','division','budget','requested','paid'],['Kode','Nama','Divisi','Anggaran','Diajukan bulan ini','Dicairkan dari pengajuan bulan ini']],['Rekonsiliasi',recon,['month','statement_balance','ledger_balance','difference','note'],['Bulan','Saldo rekening','Saldo buku','Selisih','Catatan']]];
  for(const [name,rows,keys,labels] of definitions){const sheet=workbook.addWorksheet(name);sheet.columns=keys.map((key,i)=>({header:labels[i],key,width:i===1?35:23}));for(const row of rows)sheet.addRow(Object.fromEntries(keys.map(k=>[k,['amount','budget','requested','paid','statement_balance','ledger_balance','difference'].includes(k)?Number(row[k]):row[k]])));sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];}
  body=Buffer.from(await workbook.xlsx.writeBuffer());mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 } else {
  const doc=new PDFDocument({size:'A4',margin:42});const chunks=[];
  const done=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',resolve);doc.on('error',reject);});
  doc.fontSize(21).text('ANARGYA GEN 8 — FAB');doc.moveDown().fontSize(14).text('Laporan keuangan '+month);doc.fontSize(10).text('Dibuat: '+new Date().toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}));
  const section=(title,lines)=>{doc.moveDown().fontSize(14).text(title);doc.fontSize(9);if(!lines.length)doc.text('Tidak ada data.');for(const line of lines){if(doc.y>740)doc.addPage();doc.text(line,{lineGap:5});}};
  section('Pengajuan',requests.map(r=>`${r.number} | ${r.division} | ${money(r.amount)} | ${r.status}\n${r.title} — ${r.proposer}`));
  section('Buku kas',cash.map(c=>`${c.kind} | ${money(c.amount)} | ${c.number||'Kas tim'} | ${c.note}`));
  section('RAB dan pengajuan bulan ini',rab.map(r=>`${r.code} ${r.title}\nRAB ${money(r.budget)} | Diajukan ${money(r.requested)} | Dicairkan ${money(r.paid)}`));
  section('Rekonsiliasi rekening',recon.map(r=>`Rekening ${money(r.statement_balance)} | Buku ${money(r.ledger_balance)} | Selisih ${money(r.difference)}\n${r.note}`));
  doc.end();await done;body=Buffer.concat(chunks);mime='application/pdf';
 }
 return new Response(body,{headers:{'Content-Type':mime,'Content-Disposition':`attachment; filename="FAB-${month}.${format}"`,'Cache-Control':'private, no-store'}});
}
