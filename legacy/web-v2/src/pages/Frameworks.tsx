import { AlertTriangle, ArrowRight, Calculator, CheckCircle2, ChevronDown, Database, Layers, Library, Monitor, MonitorOff, PackagePlus, Pencil, Plus, RefreshCw, Sigma, UserCheck } from 'lucide-react';
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, auth } from '../api';
import { FRAMEWORK_EDITOR_ROLES, hasAnyRole, isGlobal, LEADERSHIP_ROLES } from '../authz';
import { toast } from '../components/Toast';
import { Badge, Empty, Modal, PageHead, SkeletonCards } from '../components/UI';
import { fmtNumber } from '../ioc-format';
import { type Framework, type FrameworkKind, type FrameworkTemplate, frameworkKindLabels, type IssuingLevel, issuingLevelLabels, type TargetStatusKey } from '../ioc-types';
import { type PublicLocality, useLocality } from '../locality';
import { statusMeta } from '../types';
import '../styles/ioc-frameworks.css';

// Bộ chỉ tiêu (CT-01): các bộ chạy song song theo năm và thư viện mẫu — địa phương mới chỉ cần nạp mẫu (VH-01).

/** GET /frameworks trả thêm các trường này mà kiểu dùng chung chưa khai báo. */
type FrameworkRow=Framework&{sortOrder:number;createdAt:string;updatedAt:string};
type ApplyResult={frameworkId:string;code:string;name:string;createdTargets:number;createdDatasets:string[];computedTargets:number;needsPlanValue:number;alreadyExisted:boolean};
type RecomputeOutcome={targetId:string;code:string;title:string;previousValue:number;value:number|null;changed:boolean;warnings:string[]};
type Tone='ok'|'warn'|'bad'|'info'|'accent'|'ai'|'neutral';

const STATUS_ORDER:TargetStatusKey[]=['COMPLETED','ON_TRACK','AT_RISK','OVERDUE','NOT_STARTED'];
const KINDS:FrameworkKind[]=['PLAN','SCORE','STAT','TASK'];
const LEVELS:IssuingLevel[]=['CENTRAL','PROVINCE','LOCAL'];
const KIND_TONE:Record<FrameworkKind,Tone>={PLAN:'info',SCORE:'accent',STAT:'neutral',TASK:'ai'};
const KIND_HINT:Record<FrameworkKind,string>={
  PLAN:'So số thực hiện với mục tiêu được giao, tính tiến độ.',
  SCORE:'Cộng điểm theo thang chấm; chỉ tiêu cha tự cộng điểm con.',
  STAT:'Không có mục tiêu; theo dõi đã cập nhật số liệu từng kỳ chưa.',
  TASK:'Việc địa phương tự đặt, theo dõi đến khi hoàn thành.',
};
const CODE_PREFIX:Record<FrameworkKind,string>={PLAN:'KH',SCORE:'CD',STAT:'TK',TASK:'NV'};
const LOCALITY_KIND_LABELS:Record<string,string>={XA:'Xã',PHUONG:'Phường',DAC_KHU:'Đặc khu',TRUONG_HOC:'Trường học',CO_QUAN_KHAC:'Cơ quan, đơn vị khác'};
const CURRENT_YEAR=Number(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric'}).format(new Date()));
const INTRO_KEY='ioc_fw_intro';

const messageOf=(reason:unknown)=>reason instanceof Error?reason.message:'Có lỗi xảy ra, vui lòng thử lại';
const fold=(value:string)=>value.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[đĐ]/g,'d').toLowerCase().trim();
const targetsLink=(frameworkId:string,status?:TargetStatusKey)=>`/admin/targets?frameworkId=${encodeURIComponent(frameworkId)}${status?`&status=${status}`:''}`;

/** Bộ thống kê không có mục tiêu: "đúng tiến độ" nghĩa là đã có số liệu. */
function statusLabel(kind:FrameworkKind,status:TargetStatusKey){
  if(kind==='STAT'&&status==='ON_TRACK')return 'Đã có số liệu';
  if(kind==='STAT'&&status==='NOT_STARTED')return 'Chưa có số liệu';
  return statusMeta[status]?.label??status;
}

/** Tên bộ khi nạp cho một năm khác năm mẫu (máy chủ đặt tên theo mẫu "… năm {năm} …"). */
function nameForYear(template:FrameworkTemplate,year:number){
  return template.effectiveYear?template.sampleName.replace(`năm ${template.effectiveYear}`,`năm ${year}`):template.sampleName;
}

/** Mẫu có đúng loại đơn vị và tỉnh của địa phương không; null khi địa phương chưa thiết lập. */
function scopeFit(template:FrameworkTemplate,locality:PublicLocality){
  if(!locality.configured)return null;
  const kindOk=template.scope.localityKinds.includes(locality.kind);
  const provinceOk=!template.scope.province||!locality.provinceName||fold(template.scope.province)===fold(locality.provinceName);
  return {kindOk,provinceOk};
}

function scopeText(template:FrameworkTemplate){
  const kinds=template.scope.localityKinds.map(kind=>LOCALITY_KIND_LABELS[kind]??kind).join(', ');
  return template.scope.province?`${kinds} thuộc ${template.scope.province}`:`${kinds} trên cả nước`;
}

export default function Frameworks(){
  const user=auth.user;
  const canEdit=hasAnyRole(user,FRAMEWORK_EDITOR_ROLES);
  const canApply=hasAnyRole(user,LEADERSHIP_ROLES);
  const locality=useLocality();
  const [params,setParams]=useSearchParams();
  const yearParam=Number(params.get('year'));
  const year=Number.isInteger(yearParam)&&yearParam>=2000&&yearParam<=2100?yearParam:CURRENT_YEAR;
  const [frameworks,setFrameworks]=useState<FrameworkRow[]>([]);
  const [templates,setTemplates]=useState<FrameworkTemplate[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [editing,setEditing]=useState<FrameworkRow|null>(null);
  const [creating,setCreating]=useState(false);
  const [applying,setApplying]=useState<{template:FrameworkTemplate;year:number}|null>(null);
  const [recomputed,setRecomputed]=useState<{framework:FrameworkRow;outcomes:RecomputeOutcome[]}|null>(null);
  const [recomputingId,setRecomputingId]=useState('');
  const libraryRef=useRef<HTMLElement>(null);
  const loadId=useRef(0);

  async function load(){
    const id=++loadId.current;
    setLoading(true);
    setError('');
    try{
      // Lấy cả bộ đã ngừng: cần để biết mẫu đã nạp cho năm nào (mã bộ là duy nhất, kể cả khi ngừng).
      const [rows,library]=await Promise.all([
        api<FrameworkRow[]>('/frameworks?includeInactive=true'),
        api<FrameworkTemplate[]>('/frameworks/templates'),
      ]);
      if(id!==loadId.current)return;
      setFrameworks(rows);
      setTemplates(library);
    }catch(reason){
      if(id===loadId.current)setError(messageOf(reason));
    }finally{
      if(id===loadId.current)setLoading(false);
    }
  }

  useEffect(()=>{void load()},[]);

  function selectYear(next:number){
    setParams(previous=>{const query=new URLSearchParams(previous);query.set('year',String(next));return query},{replace:true});
  }

  async function recompute(framework:FrameworkRow){
    setRecomputingId(framework.id);
    try{
      const result=await api<{recomputed:RecomputeOutcome[]}>(`/frameworks/${framework.id}/recompute`,{method:'POST'});
      const changed=result.recomputed.filter(outcome=>outcome.changed).length;
      if(result.recomputed.length)toast.ok(`Đã tính lại ${result.recomputed.length} chỉ tiêu tự tính`,`${changed} chỉ tiêu có số liệu mới.`);
      else toast.info('Bộ này chưa có chỉ tiêu tự tính');
      setRecomputed({framework,outcomes:result.recomputed});
      void load();
    }catch(reason){
      toast.error('Không tính lại được số liệu',messageOf(reason));
    }finally{
      setRecomputingId('');
    }
  }

  const years=useMemo(()=>{
    const known=frameworks.map(framework=>framework.year).filter((value):value is number=>typeof value==='number');
    return [...new Set([CURRENT_YEAR+1,CURRENT_YEAR,CURRENT_YEAR-1,year,...known])].sort((a,b)=>b-a);
  },[frameworks,year]);
  const applyYears=useMemo(()=>[...new Set([CURRENT_YEAR-1,CURRENT_YEAR,CURRENT_YEAR+1,year])].sort((a,b)=>a-b),[year]);
  const byTemplate=useMemo(()=>{
    const map=new Map<string,FrameworkRow[]>();
    for(const framework of frameworks)if(framework.templateKey)map.set(framework.templateKey,[...(map.get(framework.templateKey)??[]),framework]);
    return map;
  },[frameworks]);

  // Bộ không gắn năm (tự đặt dùng chung) hiện ở mọi năm.
  const ofYear=frameworks.filter(framework=>framework.year==null||framework.year===year);
  const active=ofYear.filter(framework=>framework.isActive);
  const inactive=canEdit?ofYear.filter(framework=>!framework.isActive):[];
  const totals=active.reduce((sum,framework)=>({
    targets:sum.targets+framework.summary.total,
    reported:sum.reported+framework.summary.reported,
    risk:sum.risk+framework.summary.counts.AT_RISK,
    overdue:sum.overdue+framework.summary.counts.OVERDUE,
  }),{targets:0,reported:0,risk:0,overdue:0});
  const firstLoad=loading&&!frameworks.length&&!templates.length;
  const applyingExisting=applying?frameworks.find(framework=>framework.templateKey===applying.template.key&&framework.year===applying.year):undefined;

  const scopeNote=isGlobal(user)?'':` Số liệu tổng hợp trong phạm vi ${user?.department?.name||'phòng của bạn'}.`;
  const roleNote=canEdit?'':' Bạn có quyền xem; sửa bộ và nạp mẫu do lãnh đạo UBND, văn thư thực hiện.';

  const card=(framework:FrameworkRow)=><FrameworkCard
    key={framework.id}
    framework={framework}
    canEdit={canEdit}
    scoped={!isGlobal(user)}
    busy={recomputingId===framework.id}
    onEdit={()=>setEditing(framework)}
    onRecompute={()=>void recompute(framework)}
  />;

  return <div className="fw-page">
    <PageHead
      eyebrow="CHỈ TIÊU"
      title="Bộ chỉ tiêu"
      description={`Mỗi văn bản giao chỉ tiêu là một bộ; các bộ chạy song song trong năm.${scopeNote}${roleNote}`}
      actions={<>
        <label className="fw-year">Năm
          <select value={year} onChange={event=>selectYear(Number(event.target.value))}>
            {years.map(value=><option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="button" className="btn secondary" disabled={loading} onClick={()=>void load()}><RefreshCw className={loading?'spin':undefined} aria-hidden="true"/>{loading?'Đang tải…':'Làm mới'}</button>
        {canEdit&&<button type="button" className="btn primary" onClick={()=>setCreating(true)}><Plus aria-hidden="true"/>Tạo bộ tự đặt</button>}
      </>}
    />

    <Intro/>

    {error&&<div className="form-error fw-error" role="alert">
      <AlertTriangle aria-hidden="true"/>
      <span>Không tải được bộ chỉ tiêu: {error}</span>
      <button type="button" className="btn sm secondary" disabled={loading} onClick={()=>void load()}>{loading?'Đang tải…':'Thử lại'}</button>
    </div>}

    {firstLoad?<SkeletonCards count={3}/>:(!error||frameworks.length>0||templates.length>0)&&<>
      {active.length>0&&<div className="ioc-kpis" aria-label={`Tổng hợp năm ${year}`}>
        <div className="ioc-kpi info"><span>Bộ đang theo dõi</span><strong>{active.length}</strong><small>năm {year}</small></div>
        <div className="ioc-kpi"><span>Chỉ tiêu</span><strong>{fmtNumber(totals.targets)}</strong><small>không tính chỉ tiêu tổng hợp</small></div>
        <div className="ioc-kpi ok"><span>Đã có số liệu</span><strong>{fmtNumber(totals.reported)}</strong><small>{totals.targets?Math.round(totals.reported/totals.targets*100):0}% số chỉ tiêu</small></div>
        <div className={`ioc-kpi${totals.risk?' warn':''}`}><span>Có rủi ro</span><strong>{fmtNumber(totals.risk)}</strong><small>tiến độ dưới ngưỡng</small></div>
        <div className={`ioc-kpi${totals.overdue?' bad':''}`}><span>Quá hạn</span><strong>{fmtNumber(totals.overdue)}</strong><small>đã quá hạn chưa đạt</small></div>
      </div>}

      <section aria-labelledby="fw-list-title">
        <h3 className="ioc-section-title" id="fw-list-title"><Layers aria-hidden="true"/>Bộ chỉ tiêu năm {year}<span className="count">{active.length} bộ</span></h3>
        {active.length?<div className="fw-grid">{active.map(card)}</div>:<Empty
          title={`Năm ${year} chưa có bộ chỉ tiêu nào`}
          description={canApply
            ?'Chọn một bộ trong thư viện mẫu bên dưới rồi bấm "Nạp vào năm", hoặc tạo bộ nhiệm vụ do địa phương tự đặt.'
            :canEdit?'Lãnh đạo UBND nạp bộ từ thư viện mẫu; bạn có thể tạo bộ nhiệm vụ do địa phương tự đặt.'
            :'Lãnh đạo UBND sẽ nạp bộ chỉ tiêu từ thư viện mẫu. Bạn có thể chọn năm khác để xem.'}
          action={(canApply||canEdit)&&<div className="fw-empty-actions">
            {canApply&&<button type="button" className="btn secondary" onClick={()=>libraryRef.current?.scrollIntoView({behavior:'smooth',block:'start'})}><Library aria-hidden="true"/>Xem thư viện mẫu</button>}
            {canEdit&&<button type="button" className="btn primary" onClick={()=>setCreating(true)}><Plus aria-hidden="true"/>Tạo bộ tự đặt</button>}
          </div>}
        />}
        {inactive.length>0&&<details className="fw-inactive">
          <summary>Đã ngừng sử dụng ({inactive.length}) — ẩn khỏi trung tâm điều hành và trình chiếu</summary>
          <div className="fw-grid">{inactive.map(card)}</div>
        </details>}
      </section>

      <section className="panel fw-library-panel" id="thu-vien-mau" ref={libraryRef} aria-labelledby="fw-library-title">
        <div className="panel-head">
          <div>
            <h3 id="fw-library-title">Thư viện bộ chỉ tiêu mẫu</h3>
            <p>Mẫu dùng chung cho mọi địa phương, chỉ chứa định nghĩa từ văn bản công khai. {canApply
              ?'Nạp một mẫu cho một năm để tạo bộ chỉ tiêu, phòng chủ trì được gán tự động theo chức năng.'
              :'Việc nạp mẫu do lãnh đạo UBND hoặc quản trị hệ thống thực hiện.'}</p>
          </div>
        </div>
        {templates.length?<div className="fw-library">
          {templates.map(template=><TemplateCard
            key={template.key}
            template={template}
            applied={byTemplate.get(template.key)??[]}
            canApply={canApply}
            defaultYear={year}
            yearOptions={applyYears}
            locality={locality}
            onApply={applyYear=>setApplying({template,year:applyYear})}
          />)}
        </div>:<Empty title="Thư viện chưa có mẫu nào" description="Mẫu bộ chỉ tiêu được đăng ký trong mã nguồn máy chủ. Liên hệ quản trị hệ thống để bổ sung mẫu của tỉnh."/>}
      </section>
    </>}

    {editing&&<EditDialog key={editing.id} framework={editing} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);void load()}}/>}
    {creating&&<CreateDialog
      defaultYear={year}
      existingCodes={frameworks.map(framework=>framework.code)}
      onClose={()=>setCreating(false)}
      onCreated={createdYear=>{setCreating(false);selectYear(createdYear);void load()}}
    />}
    {applying&&<ApplyDialog
      template={applying.template}
      year={applying.year}
      existing={applyingExisting}
      locality={locality}
      onClose={()=>setApplying(null)}
      onChanged={appliedYear=>{selectYear(appliedYear);void load()}}
    />}
    {recomputed&&<RecomputeDialog framework={recomputed.framework} outcomes={recomputed.outcomes} onClose={()=>setRecomputed(null)}/>}
  </div>;
}

/** Giải thích ngắn (VH-01); người dùng đóng lại thì lần sau giữ trạng thái đóng. */
function Intro(){
  const [open,setOpen]=useState(()=>{try{return localStorage.getItem(INTRO_KEY)!=='closed'}catch{return true}});
  return <details className="panel fw-intro" open={open} onToggle={event=>{
    const next=event.currentTarget.open;
    setOpen(next);
    try{localStorage.setItem(INTRO_KEY,next?'open':'closed')}catch{/* bỏ qua khi bị chặn lưu trữ */}
  }}>
    <summary><Layers aria-hidden="true"/>Bộ chỉ tiêu là gì, vì sao mang sang địa phương khác chỉ cần nạp mẫu?<ChevronDown className="chev" aria-hidden="true"/></summary>
    <div className="fw-intro-grid">
      <div>
        <span className="ic" aria-hidden="true"><Layers/></span>
        <div>
          <strong>Mỗi văn bản giao là một bộ</strong>
          <p>Kế hoạch kinh tế – xã hội cấp trên giao, bộ chấm điểm chuyển đổi số 100 điểm, chỉ tiêu thống kê theo Thông tư 148, nhiệm vụ địa phương tự đặt… Các bộ chạy song song; mỗi chỉ tiêu thuộc một bộ, có phòng chủ trì và hồ sơ ba phần.</p>
        </div>
      </div>
      <div>
        <span className="ic" aria-hidden="true"><Sigma/></span>
        <div>
          <strong>Bốn loại bộ, bốn cách tính</strong>
          <p>{KINDS.map(kind=>`${frameworkKindLabels[kind]}: ${KIND_HINT[kind].charAt(0).toLowerCase()}${KIND_HINT[kind].slice(1)}`).join(' ')}</p>
        </div>
      </div>
      <div>
        <span className="ic" aria-hidden="true"><Library/></span>
        <div>
          <strong>Địa phương khác chỉ cần nạp mẫu</strong>
          <p>Mẫu chỉ chứa định nghĩa lấy từ văn bản công khai — tên, mã, đơn vị tính, kỳ báo cáo, cách chấm điểm, công thức tự tính — không chứa số liệu của nơi nào. Khi nạp, hệ thống tự gán phòng chủ trì theo chức năng phòng ban, tạo bảng dữ liệu còn thiếu và tính ngay chỉ tiêu tự tính.</p>
        </div>
      </div>
    </div>
  </details>;
}

function FrameworkCard({framework,canEdit,scoped,busy,onEdit,onRecompute}:{
  framework:FrameworkRow;canEdit:boolean;scoped:boolean;busy:boolean;onEdit:()=>void;onRecompute:()=>void;
}){
  const summary=framework.summary;
  const titleId=useId();
  const counted=STATUS_ORDER.reduce((sum,status)=>sum+(summary.counts[status]??0),0);
  const headline=framework.kind==='SCORE'
    ?{value:fmtNumber(summary.score),unit:`/ ${fmtNumber(summary.maxScore)} điểm tạm tính`,ratio:summary.maxScore?(summary.score??0)/summary.maxScore*100:0}
    :framework.kind==='STAT'
      ?{value:fmtNumber(summary.reported),unit:`/ ${fmtNumber(summary.total)} chỉ tiêu đã có số liệu`,ratio:summary.total?summary.reported/summary.total*100:0}
      :{value:`${fmtNumber(summary.progress??0)}%`,unit:'tiến độ bình quân có trọng số',ratio:summary.progress??0};
  const distribution=STATUS_ORDER.filter(status=>summary.counts[status]>0);

  return <article className={`fw-card${framework.isActive?'':' inactive'}`} aria-labelledby={titleId}>
    <header>
      <div className="fw-head">
        <div className="fw-badges">
          <Badge tone={KIND_TONE[framework.kind]}>{framework.kindLabel||frameworkKindLabels[framework.kind]}</Badge>
          <Badge tone="neutral">{framework.issuingLevelLabel||issuingLevelLabels[framework.issuingLevel]}</Badge>
          {!framework.isActive&&<Badge tone="warn">Ngừng sử dụng</Badge>}
        </div>
        <h3 id={titleId}><Link to={targetsLink(framework.id)}>{framework.name}</Link></h3>
        <p className="fw-meta">
          <span className="ioc-code">{framework.code}</span>
          {framework.year?` · Năm ${framework.year}`:' · Dùng chung các năm'}
          {framework.templateKey?' · Nạp từ thư viện mẫu':' · Địa phương tự tạo'}
        </p>
      </div>
      {framework.showOnWallboard
        ?<span className="fw-wall on" title="Đang hiện trên màn hình trình chiếu"><Monitor aria-hidden="true"/>Trình chiếu</span>
        :<span className="fw-wall" title="Không hiện trên màn hình trình chiếu"><MonitorOff aria-hidden="true"/>Không chiếu</span>}
    </header>

    {framework.legalBasis&&<p className="fw-legal"><b>Căn cứ:</b> {framework.legalBasis}</p>}
    {framework.description&&<p className="fw-desc" title={framework.description}>{framework.description}</p>}

    {summary.total?<>
      <div>
        <div className="big"><strong>{headline.value}</strong><span>{headline.unit}</span></div>
        <div className="progress fw-meter" role="progressbar" aria-label={`${headline.value} ${headline.unit}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100,headline.ratio))}>
          <i style={{width:`${Math.min(100,Math.max(0,headline.ratio))}%`}}/>
        </div>
      </div>
      <ul className="fw-facts">
        <li>Chỉ tiêu <b>{fmtNumber(summary.total)}</b></li>
        {framework.kind!=='STAT'&&<li>Đã có số liệu <b>{fmtNumber(summary.reported)}/{fmtNumber(summary.total)}</b></li>}
        {framework.kind!=='STAT'&&<li>Có văn bản chỉ đạo <b>{fmtNumber(summary.withDirective)}</b></li>}
        {framework.kind!=='STAT'&&<li>Đã đánh giá <b>{fmtNumber(summary.withEvaluation)}</b></li>}
      </ul>
      <div>
        <div className="ioc-dist" role="img" aria-label={`Phân bố trạng thái: ${distribution.map(status=>`${statusLabel(framework.kind,status)} ${summary.counts[status]}`).join(', ')}`}>
          {distribution.map(status=><i key={status} className={status} style={{width:`${summary.counts[status]/(counted||1)*100}%`}}/>)}
        </div>
        <div className="ioc-legend">
          {distribution.map(status=><span key={status} className={status}>
            <Link to={targetsLink(framework.id,status)} aria-label={`Xem ${summary.counts[status]} chỉ tiêu ${statusLabel(framework.kind,status).toLowerCase()} của bộ ${framework.code}`}>{statusLabel(framework.kind,status)} {summary.counts[status]}</Link>
          </span>)}
        </div>
      </div>
    </>:<p className="fw-none">{scoped?'Phòng của bạn chưa có chỉ tiêu nào trong bộ này.':'Bộ chưa có chỉ tiêu nào. Thêm chỉ tiêu trong Danh mục chỉ tiêu.'}</p>}

    <footer>
      {canEdit&&<>
        <button type="button" className="btn ghost sm" onClick={onEdit} aria-label={`Sửa bộ ${framework.code}`}><Pencil aria-hidden="true"/>Sửa</button>
        <button type="button" className="btn ghost sm" disabled={busy} onClick={onRecompute} title="Tính lại các chỉ tiêu lấy số liệu từ kho dữ liệu theo công thức">
          <Calculator aria-hidden="true"/>{busy?'Đang tính…':'Tính lại số liệu tự tính'}
        </button>
      </>}
      <Link className="btn secondary sm" to={targetsLink(framework.id)}>Xem chỉ tiêu<ArrowRight aria-hidden="true"/></Link>
    </footer>
  </article>;
}

function TemplateCard({template,applied,canApply,defaultYear,yearOptions,locality,onApply}:{
  template:FrameworkTemplate;applied:FrameworkRow[];canApply:boolean;defaultYear:number;yearOptions:number[];locality:PublicLocality;onApply:(year:number)=>void;
}){
  const [year,setYear]=useState(defaultYear);
  const titleId=useId();
  useEffect(()=>setYear(defaultYear),[defaultYear]);
  const appliedRows=[...applied].filter(row=>row.year!=null).sort((a,b)=>(a.year??0)-(b.year??0));
  const existing=appliedRows.find(row=>row.year===year);
  const fit=scopeFit(template,locality);

  return <article className="fw-template" aria-labelledby={titleId}>
    <div className="facts">
      <Badge tone={KIND_TONE[template.kind]}>{frameworkKindLabels[template.kind]}</Badge>
      <Badge tone="neutral">{issuingLevelLabels[template.issuingLevel]}</Badge>
      {template.maxScore!=null&&<Badge tone="neutral">{fmtNumber(template.maxScore)} điểm</Badge>}
      {fit&&(fit.kindOk&&fit.provinceOk
        ?<Badge tone="ok" dot>Phù hợp đơn vị</Badge>
        :<Badge tone="warn" dot>{fit.kindOk?'Mẫu của tỉnh khác':'Khác loại đơn vị'}</Badge>)}
    </div>
    <h4 id={titleId}>{template.sampleName}</h4>
    <p><b>Căn cứ:</b> {template.legalBasis}</p>
    <p>{template.description}</p>
    <dl className="fw-tpl-meta">
      <div><dt>Áp dụng cho</dt><dd>{scopeText(template)}</dd></div>
      <div><dt>Nội dung mẫu</dt><dd>{fmtNumber(template.targetCount)} chỉ tiêu · {fmtNumber(template.computedCount)} tự tính · {fmtNumber(template.datasetCount)} bảng dữ liệu</dd></div>
      {template.effectiveYear!=null&&<div><dt>Hiệu lực từ</dt><dd>năm {template.effectiveYear}</dd></div>}
      <div><dt>Đã nạp</dt><dd>{appliedRows.length
        ?appliedRows.map((row,index)=><span key={row.id}>{index>0&&', '}<Link to={targetsLink(row.id)} title={`Xem chỉ tiêu bộ ${row.code}`}>năm {row.year}</Link>{!row.isActive&&' (đã ngừng)'}</span>)
        :'Chưa nạp năm nào'}</dd></div>
    </dl>
    {canApply&&<div className="row">
      <select aria-label={`Năm nạp mẫu ${template.sampleName}`} value={year} onChange={event=>setYear(Number(event.target.value))}>
        {yearOptions.map(value=><option key={value} value={value}>Năm {value}</option>)}
      </select>
      <button type="button" className={`btn sm ${existing?'secondary':'primary'}`} onClick={()=>onApply(year)}><PackagePlus aria-hidden="true"/>Nạp vào năm {year}</button>
    </div>}
    {canApply&&existing&&<small className="fw-dup"><AlertTriangle aria-hidden="true"/>Năm {year} đã nạp (mã {existing.code}) — hệ thống không nạp trùng.</small>}
  </article>;
}

function ApplyDialog({template,year,existing,locality,onClose,onChanged}:{
  template:FrameworkTemplate;year:number;existing?:FrameworkRow;locality:PublicLocality;onClose:()=>void;onChanged:(year:number)=>void;
}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<ApplyResult|null>(null);
  const fit=scopeFit(template,locality);
  const name=nameForYear(template,year);

  async function apply(){
    setBusy(true);
    setError('');
    try{
      const applied=await api<ApplyResult>(`/frameworks/templates/${encodeURIComponent(template.key)}/apply`,{method:'POST',body:JSON.stringify({year})});
      setResult(applied);
      toast.ok(`Đã nạp ${applied.name}`,`Tạo ${applied.createdTargets} chỉ tiêu${applied.createdDatasets.length?`, ${applied.createdDatasets.length} bảng dữ liệu`:''}.`);
      onChanged(year);
    }catch(reason){
      setError(messageOf(reason));
      // 409: có người vừa nạp cùng năm — tải lại để hộp thoại chuyển sang cảnh báo trùng.
      if(reason instanceof ApiError&&reason.status===409){toast.warn('Bộ này đã có cho năm đã chọn',messageOf(reason));onChanged(year)}
      else toast.error('Không nạp được bộ mẫu',messageOf(reason));
    }finally{
      setBusy(false);
    }
  }

  if(result)return <Modal key="result" title="Đã nạp bộ chỉ tiêu" description={result.name} onClose={onClose}>
    <div className="modal-body">
      <div className="form-success" role="status"><CheckCircle2 aria-hidden="true"/><p>Bộ <b>{result.code}</b> đã sẵn sàng. Trưởng phòng chủ trì có thể giao chuyên viên ngay trong danh mục chỉ tiêu.</p></div>
      <ul className="fw-plan">
        <li><Layers aria-hidden="true"/><span>Đã tạo <b>{fmtNumber(result.createdTargets)}</b> chỉ tiêu, hạn 31/12/{year}.</span></li>
        <li><Database aria-hidden="true"/><span>{result.createdDatasets.length?<>Đã tạo <b>{result.createdDatasets.length}</b> bảng dữ liệu mới: {result.createdDatasets.join(', ')}.</>:'Không cần tạo thêm bảng dữ liệu (các bảng đã có sẵn).'}</span></li>
        <li><Calculator aria-hidden="true"/><span><b>{fmtNumber(result.computedTargets)}</b> chỉ tiêu tự tính đã có số liệu từ kho dữ liệu.</span></li>
      </ul>
      {result.needsPlanValue>0&&<div className="notice warn"><AlertTriangle aria-hidden="true"/><p><b>{result.needsPlanValue}</b> chỉ tiêu cần địa phương nhập giá trị kế hoạch (văn bản giao ghi "theo kế hoạch của xã/phường"). Mở từng chỉ tiêu để cập nhật mục tiêu.</p></div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onClose}>Đóng</button>
        <Link className="btn primary" to={targetsLink(result.frameworkId)} data-modal-initial-focus>Mở danh mục chỉ tiêu<ArrowRight aria-hidden="true"/></Link>
      </div>
    </div>
  </Modal>;

  if(existing)return <Modal key="existing" title={`Năm ${year} đã có bộ này`} description={existing.name} onClose={onClose}>
    <div className="modal-body">
      <div className="notice warn" role="alert"><AlertTriangle aria-hidden="true"/><p>
        Mẫu này đã được nạp cho năm {year} (mã <b>{existing.code}</b>{existing.isActive?'':', đang ngừng sử dụng'}). Hệ thống không nạp trùng và không ghi đè:
        chỉ tiêu, giao việc, báo cáo và minh chứng của bộ hiện có được giữ nguyên.
      </p></div>
      <p className="field-hint">{existing.isActive
        ?'Muốn bổ sung chỉ tiêu, thêm trực tiếp trong danh mục chỉ tiêu. Muốn nạp cho năm khác, đóng hộp thoại và chọn năm khác.'
        :'Muốn dùng lại bộ này, bấm "Sửa" trên thẻ bộ ở mục "Đã ngừng sử dụng" và bật lại.'}</p>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onClose} data-modal-initial-focus>Đóng</button>
        <Link className="btn primary" to={targetsLink(existing.id)}>Xem chỉ tiêu của bộ<ArrowRight aria-hidden="true"/></Link>
      </div>
    </div>
  </Modal>;

  return <Modal key="confirm" title={`Nạp mẫu vào năm ${year}`} description={name} onClose={()=>{if(!busy)onClose()}}>
    <div className="modal-body">
      <p className="fw-lead">Hệ thống sẽ tạo trong một lần (lỗi giữa chừng thì không có gì được tạo):</p>
      <ul className="fw-plan">
        <li><Layers aria-hidden="true"/><span>Bộ chỉ tiêu <b>{name}</b> — {frameworkKindLabels[template.kind].toLowerCase()}, {issuingLevelLabels[template.issuingLevel].toLowerCase()}{template.maxScore!=null?`, thang ${fmtNumber(template.maxScore)} điểm`:''}.</span></li>
        <li><ArrowRight aria-hidden="true"/><span><b>{fmtNumber(template.targetCount)}</b> chỉ tiêu (kể cả chỉ tiêu cha – con), hạn hoàn thành 31/12/{year}, căn cứ: {template.legalBasis}.</span></li>
        <li><UserCheck aria-hidden="true"/><span>Phòng chủ trì, phòng phối hợp gán tự động theo chức năng phòng ban hiện có; chưa có phòng phù hợp thì giao Văn phòng. Chưa giao chuyên viên nào.</span></li>
        <li><Database aria-hidden="true"/><span>{template.datasetCount?<>Tối đa <b>{template.datasetCount}</b> bảng dữ liệu còn thiếu; bảng đã có được giữ nguyên.</>:'Không tạo bảng dữ liệu.'}</span></li>
        <li><Calculator aria-hidden="true"/><span>{template.computedCount?<><b>{template.computedCount}</b> chỉ tiêu tự tính được tính ngay từ kho dữ liệu.</>:'Không có chỉ tiêu tự tính; số liệu do phòng chủ trì báo cáo.'}</span></li>
      </ul>
      {fit&&!fit.kindOk&&<div className="notice warn"><AlertTriangle aria-hidden="true"/><p>Mẫu dành cho {scopeText(template)}; đơn vị của bạn là {locality.kindLabel.toLowerCase()}. Chỉ nạp khi chắc chắn văn bản áp dụng cho đơn vị.</p></div>}
      {fit&&fit.kindOk&&!fit.provinceOk&&<div className="notice warn"><AlertTriangle aria-hidden="true"/><p>Mẫu riêng của {template.scope.province}; đơn vị của bạn thuộc {locality.provinceName}. Chỉ nạp khi tỉnh của bạn dùng cùng văn bản.</p></div>}
      {template.effectiveYear!=null&&year<template.effectiveYear&&<div className="notice warn"><AlertTriangle aria-hidden="true"/><p>Văn bản căn cứ có hiệu lực từ năm {template.effectiveYear}; nạp cho năm {year} có thể không đúng căn cứ.</p></div>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={busy} onClick={onClose} data-modal-initial-focus>Huỷ</button>
        <button type="button" className="btn primary" disabled={busy} onClick={()=>void apply()}>
          <PackagePlus aria-hidden="true"/>{busy?'Đang nạp…':`Nạp vào năm ${year}`}
        </button>
      </div>
    </div>
  </Modal>;
}

/** Công tắc bật/tắt có chú thích. */
function Toggle({checked,onChange,label,hint}:{checked:boolean;onChange:(value:boolean)=>void;label:string;hint?:string}){
  const hintId=useId();
  return <div className="fw-toggle">
    <button type="button" role="switch" aria-checked={checked} aria-describedby={hint?hintId:undefined} className={`switch${checked?' on':''}`} onClick={()=>onChange(!checked)}>
      <span><i/></span>{label}
    </button>
    {hint&&<small className="field-hint" id={hintId}>{hint}</small>}
  </div>;
}

function EditDialog({framework,onClose,onSaved}:{framework:FrameworkRow;onClose:()=>void;onSaved:()=>void}){
  const [form,setForm]=useState({
    name:framework.name,
    legalBasis:framework.legalBasis??'',
    description:framework.description??'',
    issuingLevel:framework.issuingLevel,
    sortOrder:String(framework.sortOrder??0),
    showOnWallboard:framework.showOnWallboard,
    isActive:framework.isActive,
  });
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const set=<K extends keyof typeof form>(key:K,value:(typeof form)[K])=>setForm(current=>({...current,[key]:value}));

  async function submit(event:FormEvent){
    event.preventDefault();
    const name=form.name.trim();
    const sortOrder=Number(form.sortOrder);
    if(name.length<3){setError('Tên bộ chỉ tiêu cần ít nhất 3 ký tự.');return}
    if(!Number.isInteger(sortOrder)||sortOrder<0){setError('Thứ tự hiển thị phải là số nguyên từ 0 trở lên.');return}
    // Chỉ gửi trường thay đổi, kèm phiên bản để máy chủ chặn ghi đè khi hai người cùng sửa.
    const changes:Record<string,unknown>={};
    if(name!==framework.name)changes.name=name;
    if(form.legalBasis.trim()!==(framework.legalBasis??''))changes.legalBasis=form.legalBasis.trim();
    if(form.description.trim()!==(framework.description??''))changes.description=form.description.trim();
    if(form.issuingLevel!==framework.issuingLevel)changes.issuingLevel=form.issuingLevel;
    if(sortOrder!==framework.sortOrder)changes.sortOrder=sortOrder;
    if(form.showOnWallboard!==framework.showOnWallboard)changes.showOnWallboard=form.showOnWallboard;
    if(form.isActive!==framework.isActive)changes.isActive=form.isActive;
    if(!Object.keys(changes).length){onClose();return}
    setSaving(true);
    setError('');
    try{
      await api(`/frameworks/${framework.id}`,{method:'PATCH',body:JSON.stringify({expectedVersion:framework.version,...changes})});
      toast.ok('Đã lưu bộ chỉ tiêu',changes.isActive===false?`${framework.code} đã ngừng sử dụng.`:changes.isActive===true?`${framework.code} đã được dùng lại.`:framework.code);
      onSaved();
    }catch(reason){
      if(reason instanceof ApiError&&reason.status===409){
        toast.error('Dữ liệu đã thay đổi, tải lại','Người khác vừa cập nhật bộ chỉ tiêu này. Trang đã tải bản mới nhất, vui lòng sửa lại.');
        onSaved();
        return;
      }
      setError(messageOf(reason));
    }finally{
      setSaving(false);
    }
  }

  return <Modal title="Sửa bộ chỉ tiêu" description={`${framework.code}${framework.year?` · năm ${framework.year}`:''} · ${framework.kindLabel}`} onClose={()=>{if(!saving)onClose()}}>
    <form onSubmit={submit} noValidate>
      <label>Tên bộ chỉ tiêu
        <input value={form.name} onChange={event=>set('name',event.target.value)} maxLength={200} required/>
      </label>
      <label>Căn cứ pháp lý
        <input value={form.legalBasis} onChange={event=>set('legalBasis',event.target.value)} maxLength={300} placeholder="Số, ngày, cơ quan ban hành văn bản giao"/>
      </label>
      <label>Mô tả
        <textarea rows={3} value={form.description} onChange={event=>set('description',event.target.value)} maxLength={2000}/>
      </label>
      <div className="form-grid two">
        <label>Cấp giao
          <select value={form.issuingLevel} onChange={event=>set('issuingLevel',event.target.value as IssuingLevel)}>
            {LEVELS.map(level=><option key={level} value={level}>{issuingLevelLabels[level]}</option>)}
          </select>
        </label>
        <label>Thứ tự hiển thị
          <input type="number" min={0} step={1} inputMode="numeric" value={form.sortOrder} onChange={event=>set('sortOrder',event.target.value)}/>
          <small>Số nhỏ đứng trước trên trang này, trung tâm điều hành và trình chiếu.</small>
        </label>
      </div>
      <Toggle checked={form.showOnWallboard} onChange={value=>set('showOnWallboard',value)} label="Hiện trên màn hình trình chiếu" hint="Màn hình phòng họp tự chuyển qua các bộ đang bật."/>
      <Toggle checked={form.isActive} onChange={value=>set('isActive',value)} label="Đang sử dụng" hint="Tắt để ngừng theo dõi bộ này; có thể bật lại bất cứ lúc nào."/>
      {!form.isActive&&framework.isActive&&<div className="notice warn"><AlertTriangle aria-hidden="true"/><p>Bộ ngừng sử dụng sẽ ẩn khỏi trung tâm điều hành, trình chiếu và danh sách bộ. Chỉ tiêu, báo cáo, minh chứng vẫn được giữ nguyên.</p></div>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>Huỷ</button>
        <button type="submit" className="btn primary" disabled={saving}>{saving?'Đang lưu…':'Lưu thay đổi'}</button>
      </div>
    </form>
  </Modal>;
}

function CreateDialog({defaultYear,existingCodes,onClose,onCreated}:{defaultYear:number;existingCodes:string[];onClose:()=>void;onCreated:(year:number)=>void}){
  const [form,setForm]=useState({
    name:'',kind:'TASK' as FrameworkKind,issuingLevel:'LOCAL' as IssuingLevel,year:String(defaultYear),
    legalBasis:'',description:'',maxScore:'100',showOnWallboard:true,
  });
  const [code,setCode]=useState('');
  const [codeTouched,setCodeTouched]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const set=<K extends keyof typeof form>(key:K,value:(typeof form)[K])=>setForm(current=>({...current,[key]:value}));

  // Gợi ý mã chưa trùng theo loại và năm (vd NV-2026, NV-2026-2) cho tới khi người dùng tự nhập.
  const suggested=useMemo(()=>{
    const base=`${CODE_PREFIX[form.kind]}-${form.year||defaultYear}`;
    const taken=new Set(existingCodes);
    let candidate=base;
    for(let index=2;taken.has(candidate);index+=1)candidate=`${base}-${index}`;
    return candidate;
  },[form.kind,form.year,existingCodes,defaultYear]);
  const finalCode=codeTouched?code:suggested;

  async function submit(event:FormEvent){
    event.preventDefault();
    const name=form.name.trim();
    const year=Number(form.year);
    const maxScore=Number(form.maxScore);
    if(name.length<3){setError('Tên bộ chỉ tiêu cần ít nhất 3 ký tự.');return}
    if(!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(finalCode)){setError('Mã bộ gồm chữ in hoa không dấu, số, gạch ngang; 2–40 ký tự.');return}
    if(existingCodes.includes(finalCode)){setError(`Mã ${finalCode} đã được dùng cho bộ khác.`);return}
    if(!Number.isInteger(year)||year<2000||year>2100){setError('Năm áp dụng không hợp lệ.');return}
    if(form.kind==='SCORE'&&(!Number.isFinite(maxScore)||maxScore<1||maxScore>1000)){setError('Điểm tối đa từ 1 đến 1000.');return}
    setSaving(true);
    setError('');
    try{
      await api('/frameworks',{method:'POST',body:JSON.stringify({
        code:finalCode,name,kind:form.kind,issuingLevel:form.issuingLevel,year,
        legalBasis:form.legalBasis.trim()||undefined,
        description:form.description.trim()||undefined,
        maxScore:form.kind==='SCORE'?maxScore:undefined,
        showOnWallboard:form.showOnWallboard,
      })});
      toast.ok('Đã tạo bộ chỉ tiêu',`${finalCode} — thêm chỉ tiêu vào bộ trong Danh mục chỉ tiêu.`);
      onCreated(year);
    }catch(reason){
      setError(messageOf(reason));
    }finally{
      setSaving(false);
    }
  }

  return <Modal title="Tạo bộ chỉ tiêu tự đặt" description="Dùng cho nhiệm vụ, chỉ tiêu do địa phương tự đặt hoặc văn bản giao chưa có trong thư viện mẫu." onClose={()=>{if(!saving)onClose()}}>
    <form onSubmit={submit} noValidate>
      <label>Tên bộ chỉ tiêu
        <input value={form.name} onChange={event=>set('name',event.target.value)} maxLength={200} required placeholder="Vd: Nhiệm vụ trọng tâm năm của UBND"/>
      </label>
      <div className="form-grid two">
        <label>Loại bộ
          <select value={form.kind} onChange={event=>set('kind',event.target.value as FrameworkKind)}>
            {KINDS.map(kind=><option key={kind} value={kind}>{frameworkKindLabels[kind]}</option>)}
          </select>
          <small>{KIND_HINT[form.kind]}</small>
        </label>
        <label>Cấp giao
          <select value={form.issuingLevel} onChange={event=>set('issuingLevel',event.target.value as IssuingLevel)}>
            {LEVELS.map(level=><option key={level} value={level}>{issuingLevelLabels[level]}</option>)}
          </select>
        </label>
        <label>Mã bộ
          <input value={finalCode} onChange={event=>{setCodeTouched(true);setCode(event.target.value.toUpperCase().replace(/\s+/g,'-'))}} maxLength={40} required spellCheck={false} className="fw-code-input"/>
          <small>Chữ in hoa không dấu, số, gạch ngang; không đổi được sau khi tạo.</small>
        </label>
        <label>Năm áp dụng
          <input type="number" min={2000} max={2100} step={1} inputMode="numeric" value={form.year} onChange={event=>set('year',event.target.value)}/>
        </label>
        {form.kind==='SCORE'&&<label>Điểm tối đa
          <input type="number" min={1} max={1000} step="any" inputMode="decimal" value={form.maxScore} onChange={event=>set('maxScore',event.target.value)}/>
        </label>}
      </div>
      <label>Căn cứ pháp lý
        <input value={form.legalBasis} onChange={event=>set('legalBasis',event.target.value)} maxLength={300} placeholder="Số, ngày, cơ quan ban hành (nếu có)"/>
      </label>
      <label>Mô tả
        <textarea rows={3} value={form.description} onChange={event=>set('description',event.target.value)} maxLength={2000}/>
      </label>
      <Toggle checked={form.showOnWallboard} onChange={value=>set('showOnWallboard',value)} label="Hiện trên màn hình trình chiếu"/>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={saving} onClick={onClose}>Huỷ</button>
        <button type="submit" className="btn primary" disabled={saving}><Plus aria-hidden="true"/>{saving?'Đang tạo…':'Tạo bộ chỉ tiêu'}</button>
      </div>
    </form>
  </Modal>;
}

function RecomputeDialog({framework,outcomes,onClose}:{framework:FrameworkRow;outcomes:RecomputeOutcome[];onClose:()=>void}){
  const changed=outcomes.filter(outcome=>outcome.changed).length;
  const failed=outcomes.filter(outcome=>outcome.value===null).length;
  return <Modal title="Kết quả tính lại số liệu tự tính" description={`${framework.code} · ${framework.name}`} wide onClose={onClose}>
    <div className="modal-body">
      {outcomes.length?<>
        <p className="fw-lead">Đã tính {outcomes.length} chỉ tiêu: <b>{changed}</b> có số liệu mới, {outcomes.length-changed-failed} không đổi{failed?<>, <b className="ioc-warn">{failed}</b> chưa tính được (xem ghi chú)</>:''}.</p>
        <div className="table-wrap fw-recompute">
          <table>
            <caption className="sr-only">Kết quả tính lại từng chỉ tiêu tự tính</caption>
            <thead><tr><th scope="col">Chỉ tiêu</th><th scope="col" className="ioc-num">Trước</th><th scope="col" className="ioc-num">Sau</th><th scope="col">Kết quả</th></tr></thead>
            <tbody>{outcomes.map(outcome=><tr key={outcome.targetId}>
              <th scope="row"><Link to={`/admin/targets/${outcome.targetId}`}><span className="ioc-code">{outcome.code}</span> {outcome.title}</Link></th>
              <td className="ioc-num">{fmtNumber(outcome.previousValue)}</td>
              <td className="ioc-num">{fmtNumber(outcome.value)}</td>
              <td>
                {outcome.value===null?<Badge tone="warn">Chưa tính được</Badge>:outcome.changed?<Badge tone="ok">Đã cập nhật</Badge>:<Badge tone="neutral">Không đổi</Badge>}
                {outcome.warnings.map((warning,index)=><small key={index} className="field-hint">{warning}</small>)}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      </>:<Empty title="Bộ này chưa có chỉ tiêu tự tính" description="Chỉ tiêu tự tính lấy số liệu từ kho dữ liệu theo công thức. Các chỉ tiêu khác do phòng chủ trì báo cáo kèm minh chứng."/>}
      <div className="modal-actions">
        <button type="button" className="btn primary" onClick={onClose} data-modal-initial-focus>Đóng</button>
      </div>
    </div>
  </Modal>;
}
