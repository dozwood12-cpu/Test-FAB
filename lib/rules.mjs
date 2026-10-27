export const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
export const normalize = s => String(s).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export const todayWIB = (now=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function weekWIB(now=new Date()) { const d=new Date(todayWIB(now)+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)); return d.toISOString().slice(0,10); }
export function monthDeadline(date) {
 const d=new Date(date+'T00:00:00Z'); if(!Number.isFinite(d.getTime())) throw new Error('Tanggal tidak valid.');
 const day=d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+1);
 const max=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(day,max)); return d.toISOString().slice(0,10);
}
export function assertDistinct(request,actor,stage) {
 const forbidden=[request.proposer_id];
 if(stage==='approve') forbidden.push(request.verifier_id);
 if(stage==='pay') forbidden.push(request.verifier_id,request.approver_id);
 if(forbidden.filter(Boolean).some(id=>String(id)===String(actor.id))) throw new Error('Pemisahan tugas: pengusul, verifikator, penyetuju dan pencair harus orang berbeda.');
}
export function selectRoute({urgent,amount,aggregate=0,threshold=800000}) { return urgent?'URGENT':Math.max(Number(amount),Number(aggregate))>Number(threshold)?'LANGSUNG':'REGULER'; }
export const statuses=['Diajukan','Diverifikasi','Perlu Perbaikan','Disetujui','Dicairkan','Ditolak'];
export const labelRole={ANGGOTA:'Anggota',HOD:'HOD',FA:'Finance & Administration',GM:'General Manager',ADMIN:'Admin'};
export function dateText(d) { return d?new Date(d).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}):'—'; }
export function positiveInteger(v,name='Nominal') { const n=Number(v); if(!Number.isSafeInteger(n)||n<=0||n>100000000000) throw new Error(`${name} harus bilangan bulat positif.`);return n; }
export function canView(user,r) { return ['FA','GM','ADMIN'].includes(user.role)||String(user.id)===String(r.proposer_id)||(user.role==='HOD'&&user.division===r.division); }
// Maximum seven-calendar-day window containing the new purchase, not a thirteen-day sum.
export function splittingWindow(date,amount,existing) {
 const day=86400000,t=new Date(date+'T00:00:00Z').getTime();
 const rows=existing.map(r=>({...r,t:new Date(r.purchase_date).setUTCHours(0,0,0,0)}));
 let best={amount:Number(amount),ids:[]};
 for(let offset=0;offset<7;offset++){
  const end=t+offset*day,start=end-6*day;
  const matches=rows.filter(r=>r.t>=start&&r.t<=end);
  const total=Number(amount)+matches.reduce((s,r)=>s+Number(r.amount),0);
  if(total>best.amount)best={amount:total,ids:matches.map(r=>r.id)};
 }
 return best;
}
