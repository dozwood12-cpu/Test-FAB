import SubmitButton from './submit-button';
import Link from 'next/link';
import {logout} from './actions';
import {roles,finance,master} from '../lib/simple/core.mjs';
export {money,dateText} from '../lib/rules.mjs';
export function Field({label,name,type='text',required=true,...props}){return <label>{label}<input name={name} type={type} required={required} {...props}/></label>}
export function Status({value}){return <span className={'badge status-'+value.replaceAll(' ','-')}>{value}</span>}
export function Empty({children='Belum ada data.'}){return <p className="empty">{children}</p>}
export default function Shell({user,active,title,subtitle,children,query={}}){
 const nav=[['/requests','Pengajuan'],...(finance(user)?[['/finance','Keuangan']]:[]),...(user.role==='ADMIN'?[['/admin','Anggota']]:[]),['/help','Panduan'],['/account','Akun saya']];
 return <div className="shell"><aside><Link className="brand" href="/requests">ANARGYA<span>KEUANGAN TIM · GEN 8</span></Link><nav>{nav.map(([href,label])=><Link key={href} href={href} className={active===href?'active':''}>{label}</Link>)}</nav><div className="identity"><b>{user.name}</b><small>{roles[user.role]}</small></div><form action={logout}><SubmitButton className="secondary">Keluar</SubmitButton></form></aside><main className="workspace"><header><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</header>{query.error&&<div className="error" role="alert">{String(query.error)}</div>}{query.success&&<div className="success" role="status">Berhasil disimpan.</div>}{children}<footer>Anargya Gen 8 · Waktu Indonesia Barat</footer></main></div>;
}
