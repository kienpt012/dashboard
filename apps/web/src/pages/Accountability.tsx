import { ArrowDown, ArrowUp, Printer, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { api, auth } from '../api';
import { isGlobal } from '../authz';
import { PageHead, SkeletonTable } from '../components/UI';
import { fmtDateTime, fmtNumber, relativeTime } from '../ioc-format';
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

/** Các cột trách nhiệm; `warn`/`bad` là ngưỡng tô màu ô. */
const COLUMNS:{key:NumericKey;label:string;hint:string;warn:number;bad:number}[]=[
  {key:'pendingReports',label:'Báo cáo chờ duyệt',hint:'Báo cáo số liệu cán bộ đã gửi, trưởng phòng chưa duyệt.',warn:1,bad:5},
  {key:'oldestPendingDays',label:'Chờ lâu nhất (ngày)',hint:'Số ngày của báo cáo chờ duyệt lâu nhất. Quá thời hạn quy định thì hệ thống tự thông qua.',warn:3,bad:7},
  {key:'autoApprovedReports',label:'Báo cáo bị tự thông qua',hint:'Số báo cáo hệ thống phải tự thông qua vì người duyệt không xử lý trong thời hạn.',warn:1,bad:3},
  {key:'rejectedProposals',label:'Đề xuất bị từ chối',hint:'Đề xuất chỉ tiêu của phòng bị từ chối; xem lý do ở dòng dưới tên phòng.',warn:3,bad:10},
  {key:'autoApprovedProposals',label:'Đề xuất tự thông qua',hint:'Đề xuất đã trình mà người có thẩm quyền không xử lý trong thời hạn.',warn:1,bad:3},
  {key:'bounces',label:'Chuyển / trả việc',hint:'Số lần chỉ tiêu bị chuyển cho đồng nghiệp hoặc trả về trưởng phòng — "đá việc".',warn:2,bad:5},
  {key:'escalations',label:'Bị báo lên lãnh đạo',hint:'Số lần hệ thống leo thang: chưa giao người quá hạn, trễ báo cáo kỳ quá 7 ngày, việc bị đá qua lại.',warn:1,bad:5},
  {key:'unassigned',label:'Chưa giao người',hint:'Chỉ tiêu của phòng chưa có chuyên viên phụ trách.',warn:1,bad:10},
  {key:'missingReports',label:'Thiếu báo cáo kỳ',hint:'Chỉ tiêu có kỳ báo cáo đã qua hạn mà chưa có số liệu.',warn:1,bad:5},
  {key:'openExplanations',label:'Giải trình đang mở',hint:'Yêu cầu giải trình của lãnh đạo chưa được trả lời.',warn:1,bad:3},
  {key:'overdueExplanations',label:'Giải trình quá hạn',hint:'Yêu cầu giải trình đã quá hạn trả lời.',warn:1,bad:1},
  {key:'withoutDirective',label:'Thiếu văn bản chỉ đạo',hint:'Chỉ tiêu (trừ chỉ tiêu thống kê) chưa có văn bản chỉ đạo điều hành trong hồ sơ.',warn:1,bad:10},
  {key:'withoutEvaluation',label:'Chưa đánh giá',hint:'Chỉ tiêu chưa có đánh giá kết quả kỳ nào.',warn:1,bad:10},
];

function tone(value:number,column:typeof COLUMNS[number]){
  if(value>=column.bad)return 'bad';
  if(value>=column.warn)return 'warn';
  return value===0?'zero':'';
}

function loginText(person:Person){
  if(!person.lastLoginAt)return {text:'Chưa từng đăng nhập',tone:'bad'};
  const days=(Date.now()-new Date(person.lastLoginAt).getTime())/86_400_000;
  return {text:`Đăng nhập ${relativeTime(person.lastLoginAt)}`,tone:days>7?'warn':'ok'};
}

/** Trách nhiệm người đứng đầu (DH-04): theo từng phòng — chậm duyệt, bị tự thông qua, đá việc, giải trình, đăng nhập. */
export default function Accountability(){
  const me=auth.user;
  const [year,setYear]=useState(()=>new Date().getFullYear());
  const [data,setData]=useState<Accountability|null>(null);
  const [error,setError]=useState('');
  const [sort,setSort]=useState<{key:NumericKey|'name';dir:1|-1}>({key:'autoApprovedReports',dir:-1});

  const load=useCallback(async()=>{
    setError('');
    try{setData(await api<Accountability>(`/ioc/accountability?year=${year}`))}
    catch(caught){setError(caught instanceof Error?caught.message:'Không tải được dữ liệu trách nhiệm')}
  },[year]);
  useEffect(()=>{setData(null);void load()},[load]);

  const rows=useMemo(()=>[...(data?.departments??[])].sort((a,b)=>sort.key==='name'
    ?a.name.localeCompare(b.name,'vi')*sort.dir
    :((a[sort.key] as number)-(b[sort.key] as number))*sort.dir||a.name.localeCompare(b.name,'vi')),[data,sort]);

  const toggleSort=(key:NumericKey|'name')=>setSort(current=>current.key===key?{key,dir:current.dir===1?-1:1}:{key,dir:key==='name'?1:-1});
  const global=isGlobal(me);
  const years=[year-1,year,year+1].filter((value,index,list)=>list.indexOf(value)===index);

  return <div className="accountability">
    <PageHead
      eyebrow="Điều hành"
      title="Trách nhiệm người đứng đầu"
      description={global
        ?'Theo từng phòng: ai chậm duyệt, việc nào bị hệ thống tự thông qua, đề xuất bị từ chối vì sao, việc bị đá qua lại, giải trình quá hạn, có dùng hệ thống không. Đầu vào để đánh giá cán bộ theo kết quả nhiệm vụ (Nghị định 335/2025).'
        :'Các chỉ số trách nhiệm của phòng bạn: báo cáo chờ duyệt, việc bị tự thông qua, chuyển trả việc, giải trình. Lãnh đạo UBND xem cùng bảng này cho mọi phòng.'}
      actions={<>
        <label className="acc-year">Năm<select value={year} onChange={event=>setYear(Number(event.target.value))}>{years.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <button type="button" className="btn secondary" onClick={()=>void load()}><RefreshCw aria-hidden="true"/>Làm mới</button>
        <button type="button" className="btn secondary" onClick={()=>window.print()}><Printer aria-hidden="true"/>In</button>
      </>}
    />

    {error?<div className="form-error" role="alert">{error} <button type="button" className="btn secondary sm" onClick={()=>void load()}>Thử lại</button></div>
      :!data?<SkeletonTable rows={6}/>
      :<>
        <div className="ioc-kpis">
          <div className={`ioc-kpi ${data.autoApprovedReportsTotal?'bad':'ok'}`}><span>Báo cáo bị tự thông qua</span><strong>{fmtNumber(data.autoApprovedReportsTotal)}</strong><small>người duyệt để quá hạn</small></div>
          <div className={`ioc-kpi ${data.autoApprovedProposalsTotal?'warn':'ok'}`}><span>Đề xuất tự thông qua</span><strong>{fmtNumber(data.autoApprovedProposalsTotal)}</strong><small>không ai quyết định trong hạn</small></div>
          <div className="ioc-kpi info"><span>Báo cáo đang chờ duyệt</span><strong>{fmtNumber(rows.reduce((sum,row)=>sum+row.pendingReports,0))}</strong><small>trên toàn bộ phòng</small></div>
          <div className="ioc-kpi warn"><span>Chuyển / trả việc</span><strong>{fmtNumber(rows.reduce((sum,row)=>sum+row.bounces,0))}</strong><small>lần trong năm {data.year}</small></div>
        </div>

        <section className="panel flush">
          <div className="panel-head"><div><h3>Theo từng phòng</h3><p>Bấm tiêu đề cột để sắp xếp. Ô đỏ/vàng là điểm cần chấn chỉnh. Số liệu lúc {fmtDateTime(data.generatedAt)}.</p></div></div>
          <div className="table-wrap tall">
            <table className="acc-table">
              <thead><tr>
                <th scope="col" aria-sort={sort.key==='name'?(sort.dir===1?'ascending':'descending'):'none'}>
                  <button type="button" className="acc-sort" onClick={()=>toggleSort('name')}>Phòng · trưởng phòng{sort.key==='name'&&(sort.dir===1?<ArrowUp aria-hidden="true"/>:<ArrowDown aria-hidden="true"/>)}</button>
                </th>
                <th scope="col" className="ioc-num">Chỉ tiêu</th>
                {COLUMNS.map(column=><th key={column.key} scope="col" className="ioc-num" aria-sort={sort.key===column.key?(sort.dir===1?'ascending':'descending'):'none'}>
                  <button type="button" className="acc-sort" title={column.hint} onClick={()=>toggleSort(column.key)}>{column.label}{sort.key===column.key&&(sort.dir===1?<ArrowUp aria-hidden="true"/>:<ArrowDown aria-hidden="true"/>)}</button>
                </th>)}
              </tr></thead>
              <tbody>
                {rows.map(row=><tr key={row.id}>
                  <td className="name">
                    <Link className="acc-dept" to={`/admin/targets?departmentId=${encodeURIComponent(row.id)}`}><span className="ioc-dept-dot" style={{'--dept':row.color} as CSSProperties} aria-hidden="true"/>{row.name}</Link>
                    {row.managers.length
                      ?row.managers.map(person=>{const login=loginText(person);return <span key={person.id} className="acc-person">{person.fullName}{person.position?` — ${person.position}`:''} · <span className={`ioc-${login.tone}`}>{login.text}</span></span>})
                      :<span className="acc-person ioc-warn">Chưa có trưởng phòng trên hệ thống</span>}
                    {row.rejectionReasons.length>0&&<details className="acc-reasons-box">
                      <summary>{row.rejectionReasons.length} lý do từ chối gần đây</summary>
                      <ul className="acc-reasons">{row.rejectionReasons.map((item,index)=><li key={index}>{item.reason||'(không ghi lý do)'} — {item.actorName}, {fmtDateTime(item.at)}</li>)}</ul>
                    </details>}
                  </td>
                  <td className="ioc-num">{fmtNumber(row.targets)}</td>
                  {COLUMNS.map(column=>{const value=row[column.key];const level=tone(value,column);return <td key={column.key} className="ioc-num">
                    <span className={`acc-cell ${level}`}>{fmtNumber(value)}</span>
                  </td>})}
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        {global&&data.leaders.length>0&&<section className="panel acc-leaders">
          <div className="panel-head"><div><h3>Lãnh đạo UBND</h3><p>Lần đăng nhập gần nhất — lãnh đạo dùng hệ thống thì cán bộ mới dùng theo.</p></div></div>
          <ul className="ioc-list">{data.leaders.map(person=>{const login=loginText(person);return <li key={person.id}>
            <span className="grow"><span className="title">{person.fullName}</span><span className="sub">{person.position||'Lãnh đạo UBND'}</span></span>
            <span className={`side ioc-${login.tone}`}>{login.text}</span>
          </li>})}</ul>
        </section>}

        <details className="panel acc-legend">
          <summary>Cách tính từng cột</summary>
          <dl className="dos-kv">{COLUMNS.map(column=><div key={column.key}><dt>{column.label}</dt><dd>{column.hint}</dd></div>)}</dl>
        </details>
      </>}
  </div>;
}
