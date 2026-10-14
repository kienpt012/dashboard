import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Hourglass,
  History,
  Inbox,
  Layers,
  MonitorPlay,
  RefreshCw,
  Settings2,
  Siren,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, auth } from '../api';
import { ADMIN_ROLES, APPROVAL_ROLES, FRAMEWORK_EDITOR_ROLES, SUPERVISOR_ROLES, hasAnyRole } from '../authz';
import { Badge, Empty, Skeleton, SkeletonTable, StateCard } from '../components/UI';
import { toast } from '../components/Toast';
import { fmtDate, fmtDateTime, fmtNumber, relativeTime, untilText } from '../ioc-format';
import type { AlertItem, FrameworkKind, Overview, OverviewDepartment, TargetStatusKey } from '../ioc-types';
import { useLocality } from '../locality';
import { statusMeta } from '../types';
import '../styles/ioc-ops.css';

// Trung tâm điều hành (DH-01): một màn hình cho lãnh đạo nắm tình hình — mọi con số đều bấm tới nơi xử lý.
// Với trưởng phòng/chuyên viên/người xem, API tự thu hẹp về phòng mình (scope 'department').

const REFRESH_MS=120_000;
const STALE_DAYS=7;
const ALERT_PREVIEW=8;
const STALLED_PREVIEW=6;
const ALERT_CAP=40;
const STATUS_ORDER:TargetStatusKey[]=['COMPLETED','ON_TRACK','AT_RISK','OVERDUE','NOT_STARTED'];
const STATUS_LABEL:Record<TargetStatusKey,string>={
  COMPLETED:statusMeta.COMPLETED.label,
  ON_TRACK:statusMeta.ON_TRACK.label,
  AT_RISK:'Cần theo dõi',
  OVERDUE:statusMeta.OVERDUE.label,
  NOT_STARTED:statusMeta.NOT_STARTED.label,
};
const ALERT_KINDS:Record<string,string>={
  OVERDUE:'Quá hạn',
  EXPLANATION_OVERDUE:'Giải trình trễ hạn',
  STALLED:'Bị treo',
  AT_RISK:'Nguy cơ không đạt',
  MISSING_REPORT:'Thiếu báo cáo',
  UNASSIGNED:'Chưa giao người',
  PROPOSAL_PENDING:'Đề xuất chờ duyệt',
};
const KIND_TONE:Record<FrameworkKind,'info'|'accent'|'neutral'|'ai'>={PLAN:'info',SCORE:'accent',TASK:'neutral',STAT:'ai'};

type Tone='ok'|'warn'|'bad'|'info'|'';
type Kpi={key:string;label:string;value:ReactNode;hint:string;tone:Tone;to?:string;onClick?:()=>void};
type FrameworkItem=Overview['frameworks'][number];

function vietnamYear(){
  return Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric'}).format(new Date()));
}

const validYear=(value:number)=>Number.isInteger(value)&&value>=2000&&value<=2100;
const pct=(part:number,total:number)=>total?Math.round(part*100/total):0;
/** "Đánh giá kết quả" → "đánh giá kết quả" để ghép sau tên người; giữ nguyên mã viết hoa toàn bộ. */
const lowerFirst=(text:string)=>text.length>1&&text[1]===text[1].toLocaleLowerCase('vi')?text[0].toLocaleLowerCase('vi')+text.slice(1):text;
const deptStyle=(color?:string|null)=>({'--dept':color||undefined} as CSSProperties);

/** Chi tiết cảnh báo "đề xuất chờ duyệt" có mốc ISO thô từ máy chủ — đổi sang giờ Việt Nam kèm đếm ngược. */
function readableDetail(alert:AlertItem){
  return alert.detail.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g,iso=>`${fmtDateTime(iso)} (${untilText(iso)})`);
}

/** Phần hồ sơ cần mở theo loại cảnh báo (hợp đồng hash của trang hồ sơ chỉ tiêu). */
const ALERT_HASH:Record<string,string>={OVERDUE:'#thuc-hien',AT_RISK:'#thuc-hien',MISSING_REPORT:'#thuc-hien',EXPLANATION_OVERDUE:'#danh-gia'};

export default function OpsCenter(){
  const locality=useLocality();
  const user=auth.user;
  const currentYear=useMemo(vietnamYear,[]);
  const [params,setParams]=useSearchParams();
  const requested=Number(params.get('year'));
  const year=validYear(requested)?requested:currentYear;
  const [yearText,setYearText]=useState(String(year));
  const [data,setData]=useState<Overview|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const [failedAt,setFailedAt]=useState<Date|null>(null);
  const [alertKind,setAlertKind]=useState('ALL');
  const [showAllAlerts,setShowAllAlerts]=useState(false);
  const [showAllStalled,setShowAllStalled]=useState(false);
  const seq=useRef(0);
  const lastLoad=useRef(0);
  const alertsRef=useRef<HTMLElement>(null);
  const stalledRef=useRef<HTMLElement>(null);

  useEffect(()=>setYearText(String(year)),[year]);

  const load=useCallback(async(mode:'full'|'silent'|'manual')=>{
    const id=++seq.current;
    if(mode==='full')setLoading(true);else setRefreshing(true);
    try{
      const result=await api<Overview>(`/ioc/overview?year=${year}`);
      if(id!==seq.current)return;
      setData(result);setError('');setFailedAt(null);lastLoad.current=Date.now();
      if(mode==='manual')toast.ok('Đã làm mới số liệu');
    }catch(reason){
      if(id!==seq.current)return;
      setError(reason instanceof Error?reason.message:'Không tải được dữ liệu điều hành');
      setFailedAt(new Date());
    }finally{
      if(id===seq.current){setLoading(false);setRefreshing(false)}
    }
  },[year]);

  useEffect(()=>{void load('full')},[load]);

  // Tự làm mới mỗi 2 phút khi tab đang hiển thị; quay lại tab sau lâu thì làm mới ngay.
  useEffect(()=>{
    const tick=()=>{if(document.visibilityState==='visible')void load('silent')};
    const onVisible=()=>{if(document.visibilityState==='visible'&&Date.now()-lastLoad.current>=REFRESH_MS)void load('silent')};
    const timer=window.setInterval(tick,REFRESH_MS);
    document.addEventListener('visibilitychange',onVisible);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible)};
  },[load]);

  // Rời trang: bỏ qua mọi phản hồi còn đang bay về.
  useEffect(()=>()=>{seq.current++},[]);

  function pickYear(value:number){
    if(!validYear(value))return;
    setAlertKind('ALL');setShowAllAlerts(false);setShowAllStalled(false);
    setParams(previous=>{
      const next=new URLSearchParams(previous);
      if(value===currentYear)next.delete('year');else next.set('year',String(value));
      return next;
    },{replace:true});
  }

  function focusSection(ref:RefObject<HTMLElement|null>){
    window.requestAnimationFrame(()=>{
      ref.current?.scrollIntoView({behavior:'smooth',block:'start'});
      ref.current?.focus({preventScroll:true});
    });
  }

  const typedYear=Number(yearText);
  const yearValid=validYear(typedYear);
  const yearPicker=<div className="year-picker" aria-label="Chọn năm">
    <button type="button" aria-label="Xem năm trước" disabled={loading||year<=2000} onClick={()=>pickYear(year-1)}><ChevronLeft/></button>
    <input aria-label="Năm" aria-invalid={!yearValid||undefined} type="number" min="2000" max="2100" value={yearText}
      onChange={event=>setYearText(event.target.value)}
      onBlur={()=>{if(yearValid&&typedYear!==year)pickYear(typedYear);else setYearText(String(year))}}
      onKeyDown={event=>{if(event.key==='Enter'&&yearValid)pickYear(typedYear)}}/>
    <button type="button" aria-label="Xem năm sau" disabled={loading||year>=2100} onClick={()=>pickYear(year+1)}><ChevronRight/></button>
  </div>;

  const actions=<div className="actions">
    {yearPicker}
    <Link className="btn secondary" to="/trinh-chieu" aria-label="Trình chiếu phòng họp"><MonitorPlay aria-hidden="true"/><span className="label">Trình chiếu</span></Link>
    <Link className="btn secondary" to="/admin/viec-cua-toi" aria-label="Việc của tôi"><Inbox aria-hidden="true"/><span className="label">Việc của tôi</span></Link>
    <button type="button" className="btn ghost" disabled={loading||refreshing} onClick={()=>void load('manual')} aria-label={refreshing?'Đang làm mới':'Làm mới số liệu'}>
      <RefreshCw aria-hidden="true"/><span className="label">{refreshing?'Đang làm mới…':'Làm mới'}</span>
    </button>
  </div>;

  const showSkeleton=loading&&(!data||data.year!==year);
  if(showSkeleton)return <div className="ops-page"><OpsSkeleton/></div>;

  if(!data||data.year!==year)return <div className="ops-page">
    <StateCard icon={<AlertTriangle/>} title="Không tải được trung tâm điều hành" description={error||'Máy chủ chưa phản hồi. Vui lòng thử lại.'}
      action={<button type="button" className="btn primary" disabled={loading||refreshing} onClick={()=>void load('full')}>{loading?'Đang tải…':'Thử lại'}</button>}/>
  </div>;

  const {totals}=data;
  const departmentScope=data.scope==='department';
  // "Phòng Kinh tế…" → "Điều hành của phòng Kinh tế…"; đơn vị khác (Công an, Văn phòng…) giữ nguyên tên.
  const ownDepartment=data.departments[0]?.name??user?.department?.name??'đơn vị';
  const title=departmentScope?`Điều hành của ${ownDepartment.replace(/^phòng\s+/i,'phòng ')}`:'Trung tâm điều hành';
  const description=departmentScope
    ?`Năm ${data.year}: chỉ tiêu, báo cáo và việc tồn đọng của đơn vị — ai đang chậm và vì sao.`
    :`Năm ${data.year}: tiến độ các bộ chỉ tiêu, đơn vị nào đang chậm, việc nào đang bị treo.`;
  const canApprove=hasAnyRole(user,APPROVAL_ROLES);
  const canSupervise=hasAnyRole(user,SUPERVISOR_ROLES);
  const canEditFrameworks=hasAnyRole(user,FRAMEWORK_EDITOR_ROLES);
  // Danh mục chỉ tiêu mặc định năm hiện tại; khi đang xem năm khác thì mang theo ?year=.
  const targetsLink=(query:string)=>{
    const search=[query,data.year===currentYear?'':`year=${data.year}`].filter(Boolean).join('&');
    return search?`/admin/targets?${search}`:'/admin/targets';
  };
  const oldestPending=Math.max(0,...data.departments.map(item=>item.oldestPendingDays));
  const explanationLate=data.alerts.filter(item=>item.kind==='EXPLANATION_OVERDUE').length;
  const empty=!data.frameworks.length&&!totals.targets&&!totals.statTotal;

  const openAlerts=(kind:string)=>{setAlertKind(kind);setShowAllAlerts(true);focusSection(alertsRef)};
  const openStalled=()=>{setShowAllStalled(true);focusSection(stalledRef)};

  const progressKpis:Kpi[]=[
    {key:'progress',label:'Tiến độ chung',value:`${totals.progress}%`,hint:`${fmtNumber(totals.targets)} chỉ tiêu theo dõi`,tone:'info',to:targetsLink('')},
    {key:'onTrack',label:'Đúng tiến độ',value:totals.onTrack,hint:`${pct(totals.onTrack,totals.targets)}% số chỉ tiêu`,tone:totals.onTrack?'ok':'',to:targetsLink('status=ON_TRACK')},
    {key:'atRisk',label:'Cần theo dõi',value:totals.atRisk,hint:'Dưới ngưỡng tiến độ',tone:totals.atRisk?'warn':'',to:targetsLink('status=AT_RISK')},
    {key:'overdue',label:'Quá hạn',value:totals.overdue,hint:'Hết hạn, chưa đạt',tone:totals.overdue?'bad':'',to:targetsLink('status=OVERDUE')},
    {key:'completed',label:'Hoàn thành',value:totals.completed,hint:`${pct(totals.completed,totals.targets)}% số chỉ tiêu`,tone:totals.completed?'ok':'',to:targetsLink('status=COMPLETED')},
  ];
  const blockerKpis:Kpi[]=[
    {key:'missing',label:'Thiếu báo cáo kỳ',value:totals.missingReports,hint:'Chỉ tiêu trễ kỳ báo cáo',tone:totals.missingReports?'warn':'',onClick:()=>openAlerts('MISSING_REPORT')},
    {key:'unassigned',label:'Chưa giao người',value:totals.unassigned,hint:'Chưa có người phụ trách',tone:totals.unassigned?'warn':'',to:targetsLink('assignee=none')},
    {key:'pendingReports',label:'Báo cáo chờ duyệt',value:totals.pendingReports,hint:totals.pendingReports?`Lâu nhất ${oldestPending} ngày`:'Không tồn đọng',tone:oldestPending>=3?'bad':totals.pendingReports?'warn':'',to:canApprove?'/admin/approvals':undefined},
    {key:'proposals',label:'Đề xuất chờ quyết',value:totals.pendingProposals,hint:'Đã trình, chờ quyết định',tone:totals.pendingProposals?'info':'',to:'/admin/proposals?status=SUBMITTED'},
    {key:'explanations',label:'Giải trình đang mở',value:totals.openExplanations,hint:explanationLate?`${explanationLate} quá hạn trả lời`:'Chờ trả lời',tone:explanationLate?'bad':totals.openExplanations?'warn':'',to:canSupervise?'/admin/trach-nhiem':'/admin/viec-cua-toi'},
    {key:'stalled',label:'Việc bị treo',value:totals.stalled,hint:'Bị đẩy qua lại hoặc để lâu',tone:totals.stalled?'bad':'',onClick:openStalled},
    {key:'feedback',label:'Phản ánh quá hạn',value:totals.feedbackOverdue,hint:`${fmtNumber(totals.feedbackOpen)} phản ánh đang mở`,tone:totals.feedbackOverdue?'bad':'',to:'/admin/feedback'},
  ];

  return <div className="ops-page">
    <header className="ops-head">
      <div>
        <span className="eyebrow">{locality.name}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions}
    </header>

    {!locality.configured&&hasAnyRole(user,ADMIN_ROLES)&&<div className="notice warn ops-section">
      <Settings2 aria-hidden="true"/>
      <p>Chưa thiết lập thông tin địa phương — tên đơn vị trên màn hình và báo cáo đang để trống. <Link to="/admin/thiet-lap">Thiết lập ngay</Link></p>
    </div>}

    <Freshness data={data} error={error} failedAt={failedAt} refreshing={refreshing} onRetry={()=>void load('manual')}/>

    {data.year!==currentYear&&<div className="notice ops-section" role="status">
      <Clock3 aria-hidden="true"/>
      <p>Đang xem số liệu năm {data.year}. <button type="button" className="btn ghost sm" onClick={()=>pickYear(currentYear)}>Về năm {currentYear}</button></p>
    </div>}

    {empty?<div className="panel">
      <Empty title={`Chưa có chỉ tiêu năm ${data.year}`}
        description={canEditFrameworks?'Nạp bộ chỉ tiêu từ thư viện mẫu (KT-XH, chuyển đổi số, thống kê) hoặc nhập từ Excel để bắt đầu theo dõi.':departmentScope?'Phòng chưa được giao chỉ tiêu nào trong năm này. Liên hệ văn thư hoặc lãnh đạo để được giao.':'Liên hệ văn thư hoặc lãnh đạo để nạp bộ chỉ tiêu cho năm này.'}
        action={canEditFrameworks?<Link className="btn primary" to="/admin/bo-chi-tieu"><Layers aria-hidden="true"/>Nạp bộ chỉ tiêu</Link>:undefined}/>
    </div>:<>
      <section className="ops-kpi-group" aria-labelledby="ops-kpi-progress">
        <h3 id="ops-kpi-progress">Tiến độ chỉ tiêu</h3>
        <KpiGrid items={progressKpis}/>
      </section>
      <section className="ops-kpi-group" aria-labelledby="ops-kpi-blockers">
        <h3 id="ops-kpi-blockers">Điểm nghẽn trách nhiệm</h3>
        <KpiGrid items={blockerKpis}/>
      </section>

      {data.frameworks.length>0&&<section className="ops-section" aria-labelledby="ops-frameworks">
        <h3 className="ioc-section-title" id="ops-frameworks"><Layers aria-hidden="true"/>Bộ chỉ tiêu<span className="count">{data.frameworks.length} bộ</span></h3>
        <div className="ops-frameworks" style={{marginBottom:0}}>
          {data.frameworks.map(framework=><FrameworkCard key={framework.id} framework={framework} to={targetsLink(`frameworkId=${encodeURIComponent(framework.id)}`)}/>)}
        </div>
      </section>}

      <DepartmentMatrix departments={data.departments} departmentScope={departmentScope} targetsLink={targetsLink} canApprove={canApprove} canSupervise={canSupervise}/>

      <div className="ioc-grid ops-section">
        <AlertStream sectionRef={alertsRef} alerts={data.alerts} departments={data.departments} totals={totals} kind={alertKind} setKind={setAlertKind}
          showAll={showAllAlerts} setShowAll={setShowAllAlerts} targetsLink={targetsLink}/>
        <div className="ioc-stack">
          <StalledList sectionRef={stalledRef} stalled={data.stalled} showAll={showAllStalled} setShowAll={setShowAllStalled}/>
          <RecentActivity recent={data.recent}/>
        </div>
      </div>
    </>}
  </div>;
}

/** Dòng độ mới dữ liệu: số liệu báo cáo gần nhất, thời điểm tổng hợp, trạng thái tự làm mới. */
function Freshness({data,error,failedAt,refreshing,onRetry}:{data:Overview;error:string;failedAt:Date|null;refreshing:boolean;onRetry:()=>void}){
  const asOf=data.dataAsOf;
  const stale=asOf?Date.now()-new Date(asOf).getTime()>STALE_DAYS*86_400_000:true;
  return <div className="ops-fresh" aria-live="polite">
    <span className={stale?'stale':''}>
      <History aria-hidden="true"/>
      {asOf?<>Dữ liệu cập nhật lúc <b><time dateTime={asOf}>{fmtDateTime(asOf)}</time></b> ({relativeTime(asOf)})</>:<>Chưa có số liệu nào được báo cáo trong năm {data.year}</>}
    </span>
    <span className="live">Tổng hợp lúc {fmtDateTime(data.generatedAt)} · tự làm mới mỗi 2 phút</span>
    {refreshing&&<span>Đang làm mới…</span>}
    {error&&failedAt&&!refreshing&&<span className="failed" role="alert">
      Không làm mới được lúc {fmtDateTime(failedAt)}: {error}
      <button type="button" className="btn ghost sm" onClick={onRetry}>Thử lại</button>
    </span>}
  </div>;
}

function KpiGrid({items}:{items:Kpi[]}){
  return <div className="ioc-kpis">
    {items.map(item=>{
      const body=<><span>{item.label}</span><strong>{typeof item.value==='number'?fmtNumber(item.value):item.value}</strong><small>{item.hint}</small></>;
      const className=`ioc-kpi${item.tone?` ${item.tone}`:''}`;
      if(item.to)return <Link key={item.key} className={className} to={item.to}>{body}</Link>;
      if(item.onClick)return <button key={item.key} type="button" className={className} onClick={item.onClick}>{body}</button>;
      return <div key={item.key} className={`${className} static`}>{body}</div>;
    })}
  </div>;
}

/** Con số chính theo loại bộ: chấm điểm → điểm; kế hoạch/nhiệm vụ → % tiến độ; thống kê → số chỉ tiêu đã có số liệu. */
function FrameworkCard({framework,to}:{framework:FrameworkItem;to:string}){
  const {summary}=framework;
  const stat=framework.kind==='STAT';
  const counts:Partial<Record<TargetStatusKey,number>>=stat
    ?{ON_TRACK:summary.reported,NOT_STARTED:Math.max(0,summary.total-summary.reported)}
    :summary.counts;
  const total=Object.values(counts).reduce((sum,value)=>sum+(value??0),0);
  const label=(key:TargetStatusKey)=>stat?(key==='ON_TRACK'?'Đã có số liệu':'Chưa có số liệu'):STATUS_LABEL[key];
  const big=framework.kind==='SCORE'
    ?{value:summary.score===null?'—':fmtNumber(summary.score),unit:summary.maxScore?`/ ${fmtNumber(summary.maxScore)} điểm`:'điểm',note:'Điểm tự đánh giá hiện tại'}
    :stat
      ?{value:fmtNumber(summary.reported),unit:`/ ${fmtNumber(summary.total)} chỉ tiêu`,note:'Đã có số liệu'}
      :{value:summary.progress===null?'—':`${summary.progress}%`,unit:'tiến độ bình quân',note:`${fmtNumber(summary.total)} chỉ tiêu`};
  const basis=[framework.issuingLevelLabel,framework.legalBasis].filter(Boolean).join(' · ');
  const parts=STATUS_ORDER.filter(key=>(counts[key]??0)>0);

  return <article className="fw-card">
    <header>
      <div>
        <h3>{framework.name}</h3>
        <p className="legal" title={basis}>{basis}</p>
      </div>
      <Badge tone={KIND_TONE[framework.kind]}>{framework.kindLabel}</Badge>
    </header>
    <div className="big">
      <strong>{big.value}</strong>
      <span>{big.unit}<small>{big.note}</small></span>
    </div>
    <div>
      <div className="ioc-dist" role="img" aria-label={parts.map(key=>`${label(key)}: ${counts[key]}`).join(', ')||'Chưa có chỉ tiêu'}>
        {parts.map(key=><i key={key} className={key} style={{width:`${(counts[key]??0)*100/(total||1)}%`}}/>)}
      </div>
      <div className="ioc-legend" aria-hidden="true">
        {parts.map(key=><span key={key} className={key}>{label(key)} {counts[key]}</span>)}
      </div>
    </div>
    <footer>
      {framework.missingReports>0
        ?<span className="ioc-warn">{fmtNumber(framework.missingReports)} thiếu báo cáo kỳ</span>
        :<span className="ioc-ok">Đủ báo cáo các kỳ</span>}
      {!stat&&<span>{summary.withDirective}/{summary.total} có chỉ đạo</span>}
      <Link to={to} aria-label={`Xem chỉ tiêu của bộ ${framework.name}`}>Xem chỉ tiêu<ArrowRight aria-hidden="true"/></Link>
    </footer>
  </article>;
}

/** Ô số trong ma trận: tô cảnh báo khi vượt ngưỡng, bấm được tới danh sách lọc sẵn. */
function Cell({value,tone,to,label}:{value:number;tone:'bad'|'warn'|'';to?:string;label:string}){
  if(!value)return <span className="cell-alert zero">0</span>;
  const className=`cell-alert${tone?` ${tone}`:''}`;
  return to?<Link className={className} to={to} aria-label={`${label}: ${value}`}>{fmtNumber(value)}</Link>:<span className={className}>{fmtNumber(value)}</span>;
}

function DepartmentMatrix({departments,departmentScope,targetsLink,canApprove,canSupervise}:{
  departments:OverviewDepartment[];departmentScope:boolean;targetsLink:(query:string)=>string;canApprove:boolean;canSupervise:boolean;
}){
  if(!departments.length)return null;
  const half=(department:OverviewDepartment,value:number)=>value>0&&value*2>=department.total+department.statTotal;
  return <section className="panel flush ops-section" aria-labelledby="ops-matrix-title">
    <div className="panel-head">
      <div>
        <h3 id="ops-matrix-title">{departmentScope?'Tình hình của đơn vị':'Tình hình theo đơn vị'}</h3>
        <p>Ô tô đỏ/vàng là điểm nghẽn. Bấm tên đơn vị hoặc con số để mở danh sách chỉ tiêu tương ứng.</p>
      </div>
    </div>
    <div className="table-wrap">
      <table className="ops-matrix">
        <thead>
          <tr>
            <th scope="col">Đơn vị</th>
            <th scope="col" className="ioc-num">Tổng</th>
            <th scope="col" className="ioc-num">Hoàn thành</th>
            <th scope="col" className="ioc-num"><abbr title="Đúng tiến độ">Đúng TĐ</abbr></th>
            <th scope="col" className="ioc-num"><abbr title="Cần theo dõi">Cần TD</abbr></th>
            <th scope="col" className="ioc-num">Quá hạn</th>
            <th scope="col" className="ioc-num"><abbr title="Chỉ tiêu thiếu báo cáo kỳ">Thiếu BC</abbr></th>
            <th scope="col" className="ioc-num">Chưa giao</th>
            <th scope="col" className="ioc-num">Chờ duyệt</th>
            <th scope="col" className="ioc-num"><abbr title="Yêu cầu giải trình chưa trả lời">Giải trình</abbr></th>
            <th scope="col" className="ioc-num"><abbr title="Chỉ tiêu thống kê đã có số liệu / tổng số">Thống kê</abbr></th>
            <th scope="col">Tiến độ</th>
          </tr>
        </thead>
        <tbody>
          {departments.map(department=>{
            const by=(query:string)=>targetsLink(`departmentId=${encodeURIComponent(department.id)}${query?`&${query}`:''}`);
            const label=(text:string)=>`${text} — ${department.name}`;
            return <tr key={department.id}>
              <th scope="row" className="name">
                <Link className="dept" to={by('')}><i className="ioc-dept-dot" style={deptStyle(department.color)}/><span>{department.name}</span></Link>
                <Managers managers={department.managers}/>
              </th>
              <td className="ioc-num">{fmtNumber(department.total)}</td>
              <td className="ioc-num"><Cell label={label('Hoàn thành')} value={department.completed} tone="" to={by('status=COMPLETED')}/></td>
              <td className="ioc-num"><Cell label={label('Đúng tiến độ')} value={department.onTrack} tone="" to={by('status=ON_TRACK')}/></td>
              <td className="ioc-num"><Cell label={label('Cần theo dõi')} value={department.atRisk} tone="warn" to={by('status=AT_RISK')}/></td>
              <td className="ioc-num"><Cell label={label('Quá hạn')} value={department.overdue} tone="bad" to={by('status=OVERDUE')}/></td>
              <td className="ioc-num"><Cell label={label('Thiếu báo cáo')} value={department.missingReports} tone={half(department,department.missingReports)?'bad':'warn'}/></td>
              <td className="ioc-num"><Cell label={label('Chưa giao người')} value={department.unassigned} tone={half(department,department.unassigned)?'bad':'warn'} to={by('assignee=none')}/></td>
              <td className="ioc-num">
                <Cell label={label('Báo cáo chờ duyệt')} value={department.pendingReports} tone={department.oldestPendingDays>=3?'bad':'warn'} to={canApprove?'/admin/approvals':undefined}/>
                {department.pendingReports>0&&department.oldestPendingDays>0&&<span className="since">lâu nhất {department.oldestPendingDays} ngày</span>}
              </td>
              <td className="ioc-num"><Cell label={label('Giải trình đang mở')} value={department.openExplanations} tone="warn" to={canSupervise?'/admin/trach-nhiem':undefined}/></td>
              <td className="ioc-num ioc-muted">{department.statTotal?`${department.statReported}/${department.statTotal}`:'—'}</td>
              <td>
                <div className="prog">
                  <div className="progress" role="progressbar" aria-label={`Tiến độ ${department.name}`} aria-valuenow={department.progress} aria-valuemin={0} aria-valuemax={100}>
                    <i style={{width:`${Math.min(100,Math.max(0,department.progress))}%`}}/>
                  </div>
                  <b>{department.progress}%</b>
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </section>;
}

function Managers({managers}:{managers:OverviewDepartment['managers']}){
  if(!managers.length)return <span className="mgr stale">Chưa có trưởng phòng trên hệ thống</span>;
  return <span className="mgr">
    {managers.map((manager,index)=><span key={manager.id}>
      {index>0&&'; '}{manager.fullName} · {manager.lastLoginAt
        ?<time dateTime={manager.lastLoginAt} title={fmtDateTime(manager.lastLoginAt)}>đăng nhập {relativeTime(manager.lastLoginAt)}</time>
        :<span className="stale">chưa đăng nhập</span>}
    </span>)}
  </span>;
}

function alertLink(alert:AlertItem,departmentIds:Map<string,string>,targetsLink:(query:string)=>string){
  if(alert.targetId)return `/admin/targets/${alert.targetId}${ALERT_HASH[alert.kind]??''}`;
  if(alert.candidateId)return `/admin/proposals?status=SUBMITTED&id=${encodeURIComponent(alert.candidateId)}`;
  if(alert.kind==='UNASSIGNED'){
    const id=alert.departmentName?departmentIds.get(alert.departmentName):undefined;
    return targetsLink(`assignee=none${id?`&departmentId=${encodeURIComponent(id)}`:''}`);
  }
  return null;
}

function alertWhen(alert:AlertItem){
  if(!alert.at)return null;
  const prefix=alert.kind==='AT_RISK'?'Báo cáo ':alert.kind==='PROPOSAL_PENDING'?'Trình ':'';
  if(alert.kind==='OVERDUE'||alert.kind==='EXPLANATION_OVERDUE')return <time dateTime={alert.at} title={fmtDateTime(alert.at)}>Hạn {fmtDate(alert.at)}</time>;
  return <time dateTime={alert.at} title={fmtDateTime(alert.at)}>{prefix}{relativeTime(alert.at)}</time>;
}

const SEVERITY_LABEL:Record<AlertItem['severity'],string>={critical:'Nghiêm trọng',warning:'Cảnh báo',info:'Thông tin'};

function AlertStream({sectionRef,alerts,departments,totals,kind,setKind,showAll,setShowAll,targetsLink}:{
  sectionRef:RefObject<HTMLElement|null>;alerts:AlertItem[];departments:OverviewDepartment[];totals:Overview['totals'];
  kind:string;setKind:(value:string)=>void;showAll:boolean;setShowAll:(value:boolean)=>void;targetsLink:(query:string)=>string;
}){
  const departmentIds=useMemo(()=>new Map(departments.map(item=>[item.name,item.id])),[departments]);
  const colors=useMemo(()=>new Map(departments.map(item=>[item.name,item.color])),[departments]);
  const kinds=useMemo(()=>{
    const map=new Map<string,number>();
    for(const item of alerts)map.set(item.kind,(map.get(item.kind)??0)+1);
    return [...map.entries()];
  },[alerts]);
  const filtered=kind==='ALL'?alerts:alerts.filter(item=>item.kind===kind);
  const visible=showAll?filtered:filtered.slice(0,ALERT_PREVIEW);
  const critical=alerts.filter(item=>item.severity==='critical').length;
  // Máy chủ chỉ trả 40 cảnh báo đầu theo mức độ — nói rõ khi danh sách bị cắt.
  const missingShown=alerts.filter(item=>item.kind==='MISSING_REPORT').length;
  const truncatedMissing=kind==='MISSING_REPORT'&&totals.missingReports>missingShown;

  return <section className="panel" id="canh-bao" ref={sectionRef} tabIndex={-1} aria-labelledby="ops-alerts-title">
    <h3 className="ioc-section-title" id="ops-alerts-title"><Siren aria-hidden="true"/>Luồng cảnh báo
      <span className="count">{critical>0?`${critical} nghiêm trọng · `:''}{alerts.length}{alerts.length>=ALERT_CAP?'+':''} mục</span>
    </h3>
    {!alerts.length?<p className="ops-ok-line"><CheckCircle2 aria-hidden="true"/>Không có cảnh báo nào. Các chỉ tiêu đang được cập nhật đúng hạn.</p>:<>
      {(kinds.length>1||kind!=='ALL')&&<div className="ops-chips" role="group" aria-label="Lọc cảnh báo theo loại">
        <button type="button" className={`chip${kind==='ALL'?' active':''}`} aria-pressed={kind==='ALL'} onClick={()=>setKind('ALL')}>Tất cả <b>{alerts.length}</b></button>
        {kinds.map(([key,count])=><button key={key} type="button" className={`chip${kind===key?' active':''}`} aria-pressed={kind===key} onClick={()=>setKind(key)}>
          {ALERT_KINDS[key]??key} <b>{count}</b>
        </button>)}
      </div>}
      {!filtered.length?<p className="ops-hint">Không có cảnh báo loại này.</p>:<ul className={`ioc-list${showAll?' ioc-scroll':''}`}>
        {visible.map((alert,index)=>{
          const to=alertLink(alert,departmentIds,targetsLink);
          const when=alertWhen(alert);
          return <li key={`${alert.kind}-${alert.targetId??alert.candidateId??alert.departmentName}-${index}`}>
            <span className={`ioc-sev ${alert.severity}`} role="img" aria-label={SEVERITY_LABEL[alert.severity]}/>
            <div className="grow">
              {to?<Link className="title" to={to}>{alert.title}</Link>:<span className="title">{alert.title}</span>}
              <span className="sub">
                {alert.departmentName&&<><i className="ioc-dept-dot" style={deptStyle(colors.get(alert.departmentName))}/>{alert.departmentName} · </>}
                {readableDetail(alert)}
              </span>
            </div>
            <div className="side">
              <Badge tone={alert.severity==='critical'?'bad':alert.severity==='warning'?'warn':'info'}>{ALERT_KINDS[alert.kind]??alert.kind}</Badge>
              {when}
            </div>
          </li>;
        })}
      </ul>}
      {truncatedMissing&&<p className="ops-hint">Đang hiện {missingShown}/{fmtNumber(totals.missingReports)} chỉ tiêu thiếu báo cáo (cảnh báo nghiêm trọng được ưu tiên). Xem đủ theo từng đơn vị ở cột “Thiếu BC” phía trên.</p>}
      {filtered.length>ALERT_PREVIEW&&<div className="ops-more">
        <button type="button" className="btn ghost sm" aria-expanded={showAll} onClick={()=>setShowAll(!showAll)}>
          {showAll?'Thu gọn':`Xem tất cả ${filtered.length} cảnh báo`}
        </button>
      </div>}
    </>}
  </section>;
}

function StalledList({sectionRef,stalled,showAll,setShowAll}:{
  sectionRef:RefObject<HTMLElement|null>;stalled:Overview['stalled'];showAll:boolean;setShowAll:(value:boolean)=>void;
}){
  // Việc bị đẩy qua lại xếp trước, rồi tới việc để lâu chưa giao.
  const sorted=useMemo(()=>[...stalled].sort((a,b)=>b.bounceCount-a.bounceCount||a.code.localeCompare(b.code,'vi')),[stalled]);
  const visible=showAll?sorted:sorted.slice(0,STALLED_PREVIEW);
  return <section className="panel" id="viec-bi-treo" ref={sectionRef} tabIndex={-1} aria-labelledby="ops-stalled-title">
    <h3 className="ioc-section-title" id="ops-stalled-title"><Hourglass aria-hidden="true"/>Việc bị treo<span className="count">{stalled.length} việc</span></h3>
    {!stalled.length?<p className="ops-ok-line"><CheckCircle2 aria-hidden="true"/>Không có việc nào bị treo.</p>:<>
      <ul className={`ioc-list${showAll?' ioc-scroll':''}`}>
        {visible.map(item=><li key={item.id}>
          <span className={`ioc-sev ${item.bounceCount>=3?'critical':'warning'}`} role="img" aria-label={item.bounceCount>=3?'Nghiêm trọng':'Cảnh báo'}/>
          <div className="grow">
            <Link className="title" to={`/admin/targets/${item.id}`}><span className="ioc-code">{item.code}</span> {item.title}</Link>
            <span className="sub">
              <i className="ioc-dept-dot" style={deptStyle(item.departmentColor)}/>{item.departmentName} · {item.reason}
              {item.assigneeName?` · đang ở ${item.assigneeName}`:''}
            </span>
          </div>
          {item.bounceCount>0&&<div className="side">
            <Badge tone={item.bounceCount>=3?'bad':'warn'}><span className="ops-bounce" title="Số lần bị chuyển, trả qua lại"><ArrowRightLeft aria-hidden="true"/>{item.bounceCount} lần</span></Badge>
          </div>}
        </li>)}
      </ul>
      {sorted.length>STALLED_PREVIEW&&<div className="ops-more">
        <button type="button" className="btn ghost sm" aria-expanded={showAll} onClick={()=>setShowAll(!showAll)}>{showAll?'Thu gọn':`Xem tất cả ${sorted.length} việc`}</button>
      </div>}
    </>}
  </section>;
}

function RecentActivity({recent}:{recent:Overview['recent']}){
  return <section className="panel" aria-labelledby="ops-recent-title">
    <h3 className="ioc-section-title" id="ops-recent-title"><Activity aria-hidden="true"/>Hoạt động gần đây</h3>
    {!recent.length?<p className="ops-hint">Chưa có hoạt động nào được ghi nhận.</p>:<ol className="ops-timeline ioc-scroll">
      {recent.map(event=>{
        const to=event.target?`/admin/targets/${event.target.id}`:event.candidate?`/admin/proposals?id=${encodeURIComponent(event.candidate.id)}`:null;
        const subject=event.target?event.target.code:event.candidate?.name;
        return <li key={event.id}>
          <span className="what"><b>{event.actorName}</b> {lowerFirst(event.label)}{subject&&<>{' '}{to?<Link to={to} title={event.target?.title}>{subject}</Link>:subject}</>}</span>
          {event.note&&<span className="note">{event.note}</span>}
          <time className="when" dateTime={event.createdAt} title={fmtDateTime(event.createdAt)}>{relativeTime(event.createdAt)}</time>
        </li>;
      })}
    </ol>}
  </section>;
}

function OpsSkeleton(){
  return <div role="status" aria-label="Đang tải trung tâm điều hành">
    <div className="ops-skel-head">
      <div>
        <Skeleton className="skeleton-text" style={{width:140}}/>
        <Skeleton className="skeleton-title" style={{width:'min(360px, 80%)'}}/>
        <Skeleton className="skeleton-text" style={{width:'min(520px, 95%)'}}/>
      </div>
      <Skeleton style={{width:'min(420px, 100%)',height:40}}/>
    </div>
    <div className="ops-skel-kpis">{Array.from({length:12},(_,index)=><Skeleton key={index} style={{height:84}}/>)}</div>
    <div className="ops-frameworks">{[0,1,2].map(index=><Skeleton key={index} style={{height:220}}/>)}</div>
    <SkeletonTable rows={5}/>
  </div>;
}
