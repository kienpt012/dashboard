import { MonitorPlay, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, auth } from '../api';
import { APPROVAL_ROLES, FRAMEWORK_EDITOR_ROLES, hasAnyRole, SUPERVISOR_ROLES } from '../authz';
import { DensityToggle, Hint, useDensity } from '../components/Detail';
import { Empty, PageHead, Skeleton } from '../components/UI';
import { fmtDate, fmtDateTime, fmtNumber, relativeTime } from '../ioc-format';
import type { AlertItem, Overview } from '../ioc-types';
import { useLocality } from '../locality';
import '../styles/ioc-ops.css';

const REFRESH_MS=120_000;
const ALERT_HASH:Record<string,string>={OVERDUE:'#thuc-hien',AT_RISK:'#thuc-hien',MISSING_REPORT:'#thuc-hien',EXPLANATION_OVERDUE:'#danh-gia'};
const STATUS_KEYS=['COMPLETED','ON_TRACK','AT_RISK','OVERDUE','NOT_STARTED'] as const;

function vietnamYear(){
  return Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric'}).format(new Date()));
}
const deptStyle=(color?:string|null)=>({'--dept':color||undefined} as CSSProperties);
const tone=(value:number,kind:'warn'|'bad')=>value>0?kind:'';
const STATUS_LABELS:Record<string,string>={COMPLETED:'Hoàn thành',ON_TRACK:'Đúng tiến độ',AT_RISK:'Cần theo dõi',OVERDUE:'Quá hạn',NOT_STARTED:'Chưa bắt đầu'};
const ALERT_KINDS:Record<string,string>={STALLED:'Bị treo',MISSING_REPORT:'Thiếu báo cáo',AT_RISK:'Nguy cơ không đạt',OVERDUE:'Quá hạn',UNASSIGNED:'Chưa giao người',PROPOSAL_PENDING:'Đề xuất chờ duyệt',REPORT_PENDING:'Báo cáo chờ duyệt',EXPLANATION_OVERDUE:'Giải trình quá hạn'};

/** Trung tâm điều hành (DH-01): số liệu, việc cần xử lý, bộ chỉ tiêu, đơn vị, cảnh báo. */
export default function OpsCenter(){
  const locality=useLocality();
  const user=auth.user;
  const currentYear=useMemo(vietnamYear,[]);
  const [params,setParams]=useSearchParams();
  const requested=Number(params.get('year'));
  const year=Number.isInteger(requested)&&requested>=2000&&requested<=2100?requested:currentYear;
  const [data,setData]=useState<Overview|null>(null);
  const [error,setError]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const [allAlerts,setAllAlerts]=useState(false);
  const [alertKind,setAlertKind]=useState('ALL');
  const [density,setDensity]=useDensity('ops');
  const detailed=density==='detailed';
  const seq=useRef(0);

  const load=useCallback(async(silent=false)=>{
    const id=++seq.current;
    if(silent)setRefreshing(true);
    try{
      const result=await api<Overview>(`/ioc/overview?year=${year}`);
      if(id===seq.current){setData(result);setError('')}
    }catch(caught){
      if(id===seq.current&&!silent)setError(caught instanceof Error?caught.message:'Không tải được dữ liệu');
    }finally{if(id===seq.current)setRefreshing(false)}
  },[year]);

  useEffect(()=>{
    setData(null);
    void load();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load(true)},REFRESH_MS);
    return()=>window.clearInterval(timer);
  },[load]);

  const canApprove=hasAnyRole(user,APPROVAL_ROLES);
  const canSupervise=hasAnyRole(user,SUPERVISOR_ROLES);
  const departmentIds=useMemo(()=>new Map((data?.departments??[]).map(item=>[item.name,item.id])),[data]);
  const title=data?.scope==='department'&&data.departments[0]?data.departments[0].name:'Trung tâm điều hành';

  const head=<PageHead title={title} actions={<>
    {data&&<span className="ops-updated" title={`Tổng hợp lúc ${fmtDateTime(data.generatedAt)}`}>Cập nhật {fmtDateTime(data.dataAsOf??data.generatedAt)}</span>}
    <DensityToggle value={density} onChange={setDensity}/>
    <select aria-label="Năm" value={year} onChange={event=>setParams(next=>{next.set('year',event.target.value);return next},{replace:true})}>
      {[currentYear+1,currentYear,currentYear-1,currentYear-2].map(value=><option key={value} value={value}>Năm {value}</option>)}
    </select>
    <Link className="btn secondary" to="/trinh-chieu"><MonitorPlay aria-hidden="true"/>Trình chiếu</Link>
    <button type="button" className="btn secondary icon" onClick={()=>void load(true)} disabled={refreshing} aria-label="Làm mới" title="Làm mới">
      <RefreshCw className={refreshing?'spin':undefined} aria-hidden="true"/>
    </button>
  </>}/>;

  if(error&&!data)return <>{head}<div className="form-error" role="alert">{error} <button type="button" className="btn secondary sm" onClick={()=>void load()}>Thử lại</button></div></>;
  if(!data)return <>{head}<div className="ops"><Skeleton style={{height:76}}/><Skeleton style={{height:52}}/><Skeleton style={{height:220}}/><Skeleton style={{height:280}}/></div></>;

  const t=data.totals;
  const stats=[
    {label:'Chỉ tiêu',value:fmtNumber(t.targets),to:'/admin/targets'},
    {label:'Tiến độ chung',value:`${fmtNumber(t.progress)}%`},
    {label:'Đúng tiến độ',value:fmtNumber(t.onTrack),to:'/admin/targets?status=ON_TRACK'},
    {label:'Cần theo dõi',value:fmtNumber(t.atRisk),tone:tone(t.atRisk,'warn'),to:'/admin/targets?status=AT_RISK'},
    {label:'Quá hạn',value:fmtNumber(t.overdue),tone:tone(t.overdue,'bad'),to:'/admin/targets?status=OVERDUE'},
    {label:'Hoàn thành',value:fmtNumber(t.completed),to:'/admin/targets?status=COMPLETED'},
  ];
  const todo=[
    {label:'Thiếu báo cáo kỳ',value:t.missingReports,tone:tone(t.missingReports,'warn'),to:'/admin/viec-cua-toi'},
    {label:'Chưa giao người',value:t.unassigned,tone:tone(t.unassigned,'warn'),to:'/admin/targets?assignee=none'},
    {label:'Báo cáo chờ duyệt',value:t.pendingReports,tone:tone(t.pendingReports,'warn'),to:canApprove?'/admin/approvals':undefined},
    {label:'Đề xuất chờ quyết định',value:t.pendingProposals,tone:tone(t.pendingProposals,'warn'),to:'/admin/proposals?status=SUBMITTED'},
    {label:'Giải trình đang mở',value:t.openExplanations,tone:tone(t.openExplanations,'warn'),to:canSupervise?'/admin/trach-nhiem':undefined},
    {label:'Việc bị treo',value:t.stalled,tone:tone(t.stalled,'bad'),to:'#viec-bi-treo'},
    {label:'Phản ánh quá hạn',value:t.feedbackOverdue,tone:tone(t.feedbackOverdue,'bad'),to:'/admin/feedback'},
  ];
  const alertKinds=[...new Set(data.alerts.map(alert=>alert.kind))];
  const filteredAlerts=alertKind==='ALL'?data.alerts:data.alerts.filter(alert=>alert.kind===alertKind);
  const alerts=allAlerts||detailed?filteredAlerts:filteredAlerts.slice(0,8);

  return <>
    {head}
    <div className="ops">
      {!locality.configured&&hasAnyRole(user,['ADMIN'])&&<div className="notice warn">Chưa thiết lập thông tin địa phương. <Link to="/admin/thiet-lap">Thiết lập</Link></div>}

      <section className="ops-stats panel flush" aria-label="Số liệu chỉ tiêu">
        {stats.map(item=>{
          const body=<><span>{item.label}</span><strong className={item.tone}>{item.value}</strong></>;
          return item.to?<Link key={item.label} className="ops-stat" to={item.to}>{body}</Link>:<div key={item.label} className="ops-stat">{body}</div>;
        })}
      </section>

      <section className="ops-todo panel flush" aria-label="Việc cần xử lý">
        {todo.map(item=>{
          const body=<><span>{item.label}</span><b className={item.tone}>{fmtNumber(item.value)}</b></>;
          if(!item.to)return <div key={item.label} className="ops-todo-item">{body}</div>;
          return item.to.startsWith('#')
            ?<a key={item.label} className="ops-todo-item" href={item.to}>{body}</a>
            :<Link key={item.label} className="ops-todo-item" to={item.to}>{body}</Link>;
        })}
      </section>

      <section className="panel flush">
        <div className="panel-head"><h3>Bộ chỉ tiêu</h3></div>
        {data.frameworks.length
          ?<div className="table-wrap">
            <table className="ops-table">
              <thead><tr>
                <th scope="col">Bộ chỉ tiêu</th>
                <th scope="col">Loại</th>
                {detailed&&<th scope="col">Cấp giao</th>}
                <th scope="col" className="ioc-num">Chỉ tiêu</th>
                <th scope="col" className="ioc-num">Kết quả</th>
                <th scope="col">Trạng thái</th>
                <th scope="col" className="ioc-num">Thiếu báo cáo</th>
                {detailed&&<th scope="col" className="ioc-num">Có chỉ đạo</th>}
                {detailed&&<th scope="col" className="ioc-num">Đã đánh giá</th>}
              </tr></thead>
              <tbody>{data.frameworks.map(framework=>{
                const s=framework.summary;
                const result=framework.kind==='SCORE'&&s.score!==null?`${fmtNumber(s.score)} / ${fmtNumber(s.maxScore??100)} điểm`
                  :framework.kind==='STAT'?`${fmtNumber(s.reported)} / ${fmtNumber(s.total)} có số liệu`
                  :`${fmtNumber(s.progress??0)}%`;
                return <tr key={framework.id}>
                  <td>
                    <Hint title={framework.name} rows={[
                      {label:'Căn cứ',value:framework.legalBasis},
                      {label:'Cấp giao',value:framework.issuingLevelLabel},
                      ...STATUS_KEYS.map(key=>({label:STATUS_LABELS[key],value:s.counts[key]?fmtNumber(s.counts[key]):null})),
                      {label:'Đã có số liệu',value:`${fmtNumber(s.reported)}/${fmtNumber(s.total)}`},
                      {label:'Có văn bản chỉ đạo',value:`${fmtNumber(s.withDirective)}/${fmtNumber(s.total)}`},
                      {label:'Đã đánh giá',value:`${fmtNumber(s.withEvaluation)}/${fmtNumber(s.total)}`},
                    ]}>
                      <Link className="ops-link" to={`/admin/targets?frameworkId=${encodeURIComponent(framework.id)}`}>{framework.name}</Link>
                    </Hint>
                    {detailed&&framework.legalBasis&&<small className="ops-muted ops-sub">{framework.legalBasis}</small>}
                  </td>
                  <td className="ops-muted">{framework.kindLabel}</td>
                  {detailed&&<td className="ops-muted">{framework.issuingLevelLabel}</td>}
                  <td className="ioc-num">{fmtNumber(s.total)}</td>
                  <td className="ioc-num ops-strong">{result}</td>
                  <td>
                    <StatusBar counts={s.counts} total={s.total}/>
                    {detailed&&<small className="ops-muted ops-counts">{STATUS_KEYS.filter(key=>s.counts[key]).map(key=>`${STATUS_LABELS[key]} ${s.counts[key]}`).join(' · ')}</small>}
                  </td>
                  <td className={`ioc-num ${tone(framework.missingReports,'warn')}`}>{fmtNumber(framework.missingReports)}</td>
                  {detailed&&<td className="ioc-num">{fmtNumber(s.withDirective)}</td>}
                  {detailed&&<td className="ioc-num">{fmtNumber(s.withEvaluation)}</td>}
                </tr>;
              })}</tbody>
            </table>
          </div>
          :<Empty showIcon={false} title="Chưa có bộ chỉ tiêu" description={`Năm ${year}`} action={hasAnyRole(user,FRAMEWORK_EDITOR_ROLES)?<Link className="btn secondary sm" to="/admin/bo-chi-tieu">Mở Bộ chỉ tiêu</Link>:undefined}/>}
      </section>

      <section className="panel flush">
        <div className="panel-head"><h3>Theo đơn vị</h3></div>
        <div className="table-wrap">
          <table className="ops-table">
            <thead><tr>
              <th scope="col">Đơn vị</th>
              <th scope="col" className="ioc-num">Chỉ tiêu</th>
              <th scope="col" className="ioc-num">Hoàn thành</th>
              <th scope="col" className="ioc-num">Đúng tiến độ</th>
              <th scope="col" className="ioc-num">Cần theo dõi</th>
              <th scope="col" className="ioc-num">Quá hạn</th>
              <th scope="col" className="ioc-num">Thiếu báo cáo</th>
              <th scope="col" className="ioc-num">Chưa giao</th>
              <th scope="col" className="ioc-num">Chờ duyệt</th>
              {detailed&&<th scope="col" className="ioc-num">Giải trình mở</th>}
              {detailed&&<th scope="col" className="ioc-num">Thống kê có số liệu</th>}
              {detailed&&<th scope="col" className="ioc-num">Có chỉ đạo</th>}
              {detailed&&<th scope="col" className="ioc-num">Đã đánh giá</th>}
              <th scope="col">Tiến độ</th>
            </tr></thead>
            <tbody>{data.departments.map(department=>{
              const by=(query:string)=>`/admin/targets?departmentId=${encodeURIComponent(department.id)}${query?`&${query}`:''}`;
              const manager=department.managers[0];
              return <tr key={department.id}>
                <td>
                  <Hint title={department.name} rows={[
                    {label:'Trưởng phòng',value:department.managers.map(item=>item.fullName).join(', ')||'Chưa có'},
                    {label:'Đăng nhập gần nhất',value:manager?(manager.lastLoginAt?fmtDateTime(manager.lastLoginAt):'Chưa đăng nhập'):null},
                    {label:'Chưa bắt đầu',value:fmtNumber(department.notStarted)},
                    {label:'Chờ duyệt lâu nhất',value:department.pendingReports?`${fmtNumber(department.oldestPendingDays)} ngày`:null},
                    {label:'Giải trình đang mở',value:fmtNumber(department.openExplanations)},
                    {label:'Thống kê có số liệu',value:department.statTotal?`${fmtNumber(department.statReported)}/${fmtNumber(department.statTotal)}`:null},
                    {label:'Có văn bản chỉ đạo',value:fmtNumber(department.withDirective)},
                    {label:'Đã đánh giá',value:fmtNumber(department.withEvaluation)},
                  ]}>
                    <Link className="ops-link ops-dept" to={by('')}><i className="ioc-dept-dot" style={deptStyle(department.color)} aria-hidden="true"/>{department.name}</Link>
                  </Hint>
                  <small className="ops-muted">{manager?`${manager.fullName}${manager.lastLoginAt?'':' · chưa đăng nhập'}`:'Chưa có trưởng phòng'}</small>
                </td>
                <td className="ioc-num">{fmtNumber(department.total)}</td>
                <td className="ioc-num">{fmtNumber(department.completed)}</td>
                <td className="ioc-num">{fmtNumber(department.onTrack)}</td>
                <td className={`ioc-num ${tone(department.atRisk,'warn')}`}>{fmtNumber(department.atRisk)}</td>
                <td className={`ioc-num ${tone(department.overdue,'bad')}`}>{fmtNumber(department.overdue)}</td>
                <td className={`ioc-num ${tone(department.missingReports,'warn')}`}>{fmtNumber(department.missingReports)}</td>
                <td className={`ioc-num ${tone(department.unassigned,'warn')}`}><Link to={by('assignee=none')}>{fmtNumber(department.unassigned)}</Link></td>
                <td className={`ioc-num ${department.oldestPendingDays>=3?'bad':tone(department.pendingReports,'warn')}`}>{fmtNumber(department.pendingReports)}</td>
                {detailed&&<td className={`ioc-num ${tone(department.openExplanations,'warn')}`}>{fmtNumber(department.openExplanations)}</td>}
                {detailed&&<td className="ioc-num">{department.statTotal?`${fmtNumber(department.statReported)}/${fmtNumber(department.statTotal)}`:'—'}</td>}
                {detailed&&<td className="ioc-num">{fmtNumber(department.withDirective)}</td>}
                {detailed&&<td className="ioc-num">{fmtNumber(department.withEvaluation)}</td>}
                <td><span className="ops-progress"><span className="progress sm"><i style={{width:`${Math.min(100,department.progress)}%`}}/></span>{fmtNumber(department.progress)}%</span></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <div className="ops-columns">
        <section className="panel flush">
          <div className="panel-head"><h3>Cảnh báo</h3><span className="ops-muted">{fmtNumber(filteredAlerts.length)}</span></div>
          {alertKinds.length>1&&<div className="ops-filter" role="group" aria-label="Lọc cảnh báo">
            <button type="button" className={alertKind==='ALL'?'active':''} aria-pressed={alertKind==='ALL'} onClick={()=>setAlertKind('ALL')}>Tất cả <b>{data.alerts.length}</b></button>
            {alertKinds.map(kind=><button key={kind} type="button" className={alertKind===kind?'active':''} aria-pressed={alertKind===kind} onClick={()=>setAlertKind(kind)}>
              {ALERT_KINDS[kind]??kind} <b>{data.alerts.filter(alert=>alert.kind===kind).length}</b>
            </button>)}
          </div>}
          {alerts.length
            ?<ul className="ops-list">
              {alerts.map((alert,index)=>{
                const to=alertLink(alert,departmentIds);
                return <li key={`${alert.kind}-${alert.targetId??alert.candidateId??index}`}>
                  <i className={`ops-dot ${alert.severity}`} aria-hidden="true"/>
                  <div>
                    {to?<Link className="ops-link" to={to}>{alert.title}</Link>:<span>{alert.title}</span>}
                    <small className="ops-muted">{[alert.departmentName,alertWhen(alert)].filter(Boolean).join(' · ')}</small>
                  </div>
                </li>;
              })}
            </ul>
            :<p className="ops-empty">Không có cảnh báo.</p>}
          {!detailed&&filteredAlerts.length>8&&<button type="button" className="ops-more" onClick={()=>setAllAlerts(value=>!value)}>{allAlerts?'Thu gọn':`Xem tất cả ${filteredAlerts.length}`}</button>}
        </section>

        <div className="ops-side">
          <section className="panel flush" id="viec-bi-treo">
            <div className="panel-head"><h3>Việc bị treo</h3><span className="ops-muted">{fmtNumber(data.stalled.length)}</span></div>
            {data.stalled.length
              ?<ul className="ops-list">
                {(detailed?data.stalled:data.stalled.slice(0,6)).map(item=><li key={item.id}>
                  <i className="ops-dot critical" aria-hidden="true"/>
                  <div>
                    <Link className="ops-link" to={`/admin/targets/${item.id}`}>{item.title}</Link>
                    <small className="ops-muted">{item.code} · {item.reason}</small>
                  </div>
                </li>)}
              </ul>
              :<p className="ops-empty">Không có việc bị treo.</p>}
            {!detailed&&data.stalled.length>6&&<Link className="ops-more" to="/admin/trach-nhiem">Xem tất cả {data.stalled.length}</Link>}
          </section>

          <section className="panel flush">
            <div className="panel-head"><h3>Hoạt động gần đây</h3></div>
            {data.recent.length
              ?<ul className="ops-list compact">
                {data.recent.slice(0,detailed?25:6).map(event=>{
                  const to=event.target?`/admin/targets/${event.target.id}`:event.candidate?`/admin/proposals?id=${encodeURIComponent(event.candidate.id)}`:null;
                  const subject=event.target?.code??event.candidate?.name;
                  return <li key={event.id}>
                    <div>
                      <span><b>{event.actorName}</b> · {event.label.toLocaleLowerCase('vi')}{subject&&<> {to?<Link className="ops-link" to={to}>{subject}</Link>:subject}</>}</span>
                      {detailed&&event.note&&<small className="ops-muted">{event.note}</small>}
                      <small className="ops-muted" title={fmtDateTime(event.createdAt)}>{relativeTime(event.createdAt)}</small>
                    </div>
                  </li>;
                })}
              </ul>
              :<p className="ops-empty">Chưa có hoạt động.</p>}
          </section>
        </div>
      </div>
    </div>
  </>;
}

function StatusBar({counts,total}:{counts:Record<string,number>;total:number}){
  const label=STATUS_KEYS.filter(key=>counts[key]).map(key=>`${STATUS_LABELS[key]} ${counts[key]}`).join(' · ');
  return <span className="ioc-dist ops-dist" role="img" aria-label={label} title={label}>
    {STATUS_KEYS.map(key=>counts[key]?<i key={key} className={key} style={{width:`${(counts[key]/Math.max(total,1))*100}%`}}/>:null)}
  </span>;
}

function alertLink(alert:AlertItem,departmentIds:Map<string,string>){
  if(alert.targetId)return `/admin/targets/${alert.targetId}${ALERT_HASH[alert.kind]??''}`;
  if(alert.candidateId)return `/admin/proposals?status=SUBMITTED&id=${encodeURIComponent(alert.candidateId)}`;
  if(alert.kind==='UNASSIGNED'){
    const id=alert.departmentName?departmentIds.get(alert.departmentName):undefined;
    return `/admin/targets?assignee=none${id?`&departmentId=${encodeURIComponent(id)}`:''}`;
  }
  return null;
}

function alertWhen(alert:AlertItem){
  if(!alert.at)return '';
  if(alert.kind==='OVERDUE'||alert.kind==='EXPLANATION_OVERDUE')return `Hạn ${fmtDate(alert.at)}`;
  return relativeTime(alert.at);
}
