import { ArrowDown, ArrowUp, Printer, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api, auth } from '../api';
import { isGlobal } from '../authz';
import PrintDocument from '../components/PrintDocument';
import { PageHead, SkeletonTable } from '../components/UI';
import { fmtNumber, relativeTime } from '../ioc-format';
import '../styles/ioc-accountability.css';

type Person={id:string;fullName:string;position?:string|null;lastLoginAt?:string|null};
type DepartmentRow={
  id:string;name:string;color:string;managers:Person[];targets:number;pendingReports:number;oldestPendingDays:number;
  autoApprovedReports:number;rejectedProposals:number;rejectionReasons:{actorName:string;reason?:string|null;at:string;candidateId?:string|null}[];
  autoApprovedProposals:number;bounces:number;escalations:number;unassigned:number;missingReports:number;
  openExplanations:number;overdueExplanations:number;withoutDirective:number;withoutEvaluation:number;
};
type Accountability={year:number;generatedAt:string;departments:DepartmentRow[];leaders:Person[];autoApprovedProposalsTotal:number;autoApprovedReportsTotal:number};
type NumericKey=Exclude<keyof DepartmentRow,'id'|'name'|'color'|'managers'|'rejectionReasons'>;

/** Cột trách nhiệm; `warn`/`bad` là ngưỡng tô màu con số trên màn hình. */
const COLUMNS:{key:NumericKey;label:string;warn:number;bad:number}[]=[
  {key:'pendingReports',label:'Chờ duyệt',warn:1,bad:5},
  {key:'oldestPendingDays',label:'Chờ lâu nhất (ngày)',warn:3,bad:7},
  {key:'autoApprovedReports',label:'Báo cáo tự thông qua',warn:1,bad:3},
  {key:'rejectedProposals',label:'Đề xuất bị từ chối',warn:3,bad:10},
  {key:'autoApprovedProposals',label:'Đề xuất tự thông qua',warn:1,bad:3},
  {key:'bounces',label:'Chuyển, trả việc',warn:2,bad:5},
  {key:'escalations',label:'Báo lên lãnh đạo',warn:1,bad:5},
  {key:'unassigned',label:'Chưa giao người',warn:1,bad:10},
  {key:'missingReports',label:'Thiếu báo cáo kỳ',warn:1,bad:5},
  {key:'overdueExplanations',label:'Giải trình quá hạn',warn:1,bad:1},
];

const tone=(value:number,column:typeof COLUMNS[number])=>value>=column.bad?'bad':value>=column.warn?'warn':value===0?'zero':'';
const managerNames=(row:DepartmentRow)=>row.managers.map(person=>person.fullName).join(', ');

function loginState(person:Person){
  if(!person.lastLoginAt)return {text:'chưa đăng nhập',tone:'bad'};
  const days=(Date.now()-new Date(person.lastLoginAt).getTime())/86_400_000;
  return {text:`đăng nhập ${relativeTime(person.lastLoginAt)}`,tone:days>7?'warn':''};
}

function asOf(iso:string){
  const at=new Date(iso);
  const pad=(value:number)=>String(value).padStart(2,'0');
  return `${pad(at.getHours())} giờ ${pad(at.getMinutes())} ngày ${pad(at.getDate())}/${pad(at.getMonth()+1)}/${at.getFullYear()}`;
}

/** Trách nhiệm người đứng đầu (DH-04): theo từng phòng — chậm duyệt, tự thông qua, đá việc, giải trình, đăng nhập. */
export default function Accountability(){
  const global=isGlobal(auth.user);
  const [year,setYear]=useState(()=>new Date().getFullYear());
  const [data,setData]=useState<Accountability|null>(null);
  const [error,setError]=useState('');
  const [sort,setSort]=useState<{key:NumericKey|'name';dir:1|-1}>({key:'autoApprovedReports',dir:-1});

  const load=useCallback(async()=>{
    setError('');
    try{setData(await api<Accountability>(`/ioc/accountability?year=${year}`))}
    catch(caught){setError(caught instanceof Error?caught.message:'Không tải được dữ liệu')}
  },[year]);
  useEffect(()=>{setData(null);void load()},[load]);

  const rows=useMemo(()=>[...(data?.departments??[])].sort((a,b)=>sort.key==='name'
    ?a.name.localeCompare(b.name,'vi')*sort.dir
    :((a[sort.key] as number)-(b[sort.key] as number))*sort.dir||a.name.localeCompare(b.name,'vi')),[data,sort]);
  const printRows=useMemo(()=>[...(data?.departments??[])].sort((a,b)=>a.name.localeCompare(b.name,'vi')),[data]);
  const toggleSort=(key:NumericKey|'name')=>setSort(current=>current.key===key?{key,dir:current.dir===1?-1:1}:{key,dir:key==='name'?1:-1});
  const sum=(key:NumericKey)=>rows.reduce((total,row)=>total+(row[key] as number),0);
  const thisYear=new Date().getFullYear();

  const head=<PageHead title="Trách nhiệm người đứng đầu" actions={<>
    <select aria-label="Năm" value={year} onChange={event=>setYear(Number(event.target.value))}>
      {[thisYear+1,thisYear,thisYear-1,thisYear-2].map(value=><option key={value} value={value}>Năm {value}</option>)}
    </select>
    <button type="button" className="btn secondary icon" onClick={()=>void load()} aria-label="Làm mới" title="Làm mới"><RefreshCw aria-hidden="true"/></button>
    <button type="button" className="btn secondary" onClick={()=>window.print()} disabled={!data}><Printer aria-hidden="true"/>In</button>
  </>}/>;

  if(error)return <>{head}<div className="form-error" role="alert">{error} <button type="button" className="btn secondary sm" onClick={()=>void load()}>Thử lại</button></div></>;
  if(!data)return <>{head}<SkeletonTable rows={6}/></>;

  return <>
    <div className="screen-only acc">
      {head}
      <section className="acc-stats panel flush" aria-label="Tổng hợp">
        <div><span>Báo cáo tự thông qua</span><strong className={data.autoApprovedReportsTotal?'bad':''}>{fmtNumber(data.autoApprovedReportsTotal)}</strong></div>
        <div><span>Đề xuất tự thông qua</span><strong className={data.autoApprovedProposalsTotal?'warn':''}>{fmtNumber(data.autoApprovedProposalsTotal)}</strong></div>
        <div><span>Báo cáo chờ duyệt</span><strong>{fmtNumber(sum('pendingReports'))}</strong></div>
        <div><span>Chuyển, trả việc</span><strong>{fmtNumber(sum('bounces'))}</strong></div>
        <div><span>Giải trình quá hạn</span><strong className={sum('overdueExplanations')?'bad':''}>{fmtNumber(sum('overdueExplanations'))}</strong></div>
      </section>

      <section className="panel flush">
        <div className="table-wrap">
          <table className="acc-table">
            <thead><tr>
              <th scope="col" aria-sort={sort.key==='name'?(sort.dir===1?'ascending':'descending'):'none'}>
                <SortButton active={sort.key==='name'} dir={sort.dir} onClick={()=>toggleSort('name')}>Đơn vị</SortButton>
              </th>
              <th scope="col" className="ioc-num">Chỉ tiêu</th>
              {COLUMNS.map(column=><th key={column.key} scope="col" className="ioc-num" aria-sort={sort.key===column.key?(sort.dir===1?'ascending':'descending'):'none'}>
                <SortButton active={sort.key===column.key} dir={sort.dir} onClick={()=>toggleSort(column.key)}>{column.label}</SortButton>
              </th>)}
            </tr></thead>
            <tbody>{rows.map(row=><tr key={row.id}>
              <td className="acc-name">
                <Link className="acc-dept" to={`/admin/targets?departmentId=${encodeURIComponent(row.id)}`}><i className="ioc-dept-dot" style={{'--dept':row.color} as CSSProperties} aria-hidden="true"/>{row.name}</Link>
                {row.managers.length
                  ?row.managers.map(person=>{const login=loginState(person);return <small key={person.id}>{person.fullName} · <span className={login.tone}>{login.text}</span></small>})
                  :<small className="warn">Chưa có trưởng phòng</small>}
                {row.rejectionReasons.length>0&&<details className="acc-reasons">
                  <summary>Lý do từ chối ({row.rejectionReasons.length})</summary>
                  <ul>{row.rejectionReasons.map((item,index)=><li key={index}>{item.reason||'—'} <span>({item.actorName})</span></li>)}</ul>
                </details>}
              </td>
              <td className="ioc-num">{fmtNumber(row.targets)}</td>
              {COLUMNS.map(column=><td key={column.key} className={`ioc-num ${tone(row[column.key] as number,column)}`}>{fmtNumber(row[column.key] as number)}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      {global&&data.leaders.length>0&&<section className="panel flush">
        <div className="panel-head"><h3>Lãnh đạo UBND</h3></div>
        <table className="acc-leaders">
          <tbody>{data.leaders.map(person=>{const login=loginState(person);return <tr key={person.id}>
            <td>{person.fullName}</td>
            <td className="acc-muted">{person.position||'Lãnh đạo UBND'}</td>
            <td className={`ioc-num ${login.tone}`}>{login.text}</td>
          </tr>})}</tbody>
        </table>
      </section>}
    </div>

    <PrintDocument
      kind="PHỤ LỤC"
      title={`Tình hình thực hiện trách nhiệm của người đứng đầu các phòng, đơn vị năm ${data.year}`}
      subtitle={`(Số liệu trích xuất từ hệ thống lúc ${asOf(data.generatedAt)})`}
      orientation="landscape"
    >
      <table>
        <thead>
          <tr>
            <th rowSpan={2} className="w-stt">STT</th>
            <th rowSpan={2} className="w-name">Phòng, đơn vị</th>
            <th rowSpan={2} className="w-person">Người đứng đầu</th>
            <th rowSpan={2}>Số chỉ tiêu</th>
            <th colSpan={3}>Duyệt báo cáo số liệu</th>
            <th colSpan={2}>Đề xuất chỉ tiêu</th>
            <th colSpan={3}>Giao việc</th>
            <th rowSpan={2}>Thiếu báo cáo kỳ</th>
            <th rowSpan={2}>Giải trình quá hạn</th>
          </tr>
          <tr>
            <th>Đang chờ</th>
            <th>Chờ lâu nhất (ngày)</th>
            <th>Tự thông qua</th>
            <th>Bị từ chối</th>
            <th>Tự thông qua</th>
            <th>Chưa giao người</th>
            <th>Chuyển, trả việc</th>
            <th>Báo lên lãnh đạo</th>
          </tr>
        </thead>
        <tbody>
          {printRows.map((row,index)=><tr key={row.id}>
            <td className="num">{index+1}</td>
            <td className="text">{row.name}</td>
            <td className="text">{managerNames(row)||'—'}</td>
            <td className="num">{row.targets}</td>
            <td className="num">{row.pendingReports}</td>
            <td className="num">{row.oldestPendingDays}</td>
            <td className="num">{row.autoApprovedReports}</td>
            <td className="num">{row.rejectedProposals}</td>
            <td className="num">{row.autoApprovedProposals}</td>
            <td className="num">{row.unassigned}</td>
            <td className="num">{row.bounces}</td>
            <td className="num">{row.escalations}</td>
            <td className="num">{row.missingReports}</td>
            <td className="num">{row.overdueExplanations}</td>
          </tr>)}
          <tr className="group">
            <td className="num" colSpan={3}>Tổng cộng</td>
            <td className="num">{sum('targets')}</td>
            <td className="num">{sum('pendingReports')}</td>
            <td className="num">{Math.max(0,...rows.map(row=>row.oldestPendingDays))}</td>
            <td className="num">{sum('autoApprovedReports')}</td>
            <td className="num">{sum('rejectedProposals')}</td>
            <td className="num">{sum('autoApprovedProposals')}</td>
            <td className="num">{sum('unassigned')}</td>
            <td className="num">{sum('bounces')}</td>
            <td className="num">{sum('escalations')}</td>
            <td className="num">{sum('missingReports')}</td>
            <td className="num">{sum('overdueExplanations')}</td>
          </tr>
        </tbody>
      </table>
    </PrintDocument>
  </>;
}

function SortButton({active,dir,onClick,children}:{active:boolean;dir:1|-1;onClick:()=>void;children:string}){
  return <button type="button" className="acc-sort" onClick={onClick}>
    {children}{active&&(dir===1?<ArrowUp aria-hidden="true"/>:<ArrowDown aria-hidden="true"/>)}
  </button>;
}
