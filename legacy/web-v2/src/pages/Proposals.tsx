import { Bot, Check, CheckCircle2, Clock3, FileText, Pencil, Plus, RefreshCw, Search, Send, Sparkles, Target, UserRound, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, auth } from '../api';
import { hasAnyRole, WORKING_ROLES } from '../authz';
import { toast } from '../components/Toast';
import { Badge, Empty, Modal, PageHead, SkeletonCards } from '../components/UI';
import { fmtDate, fmtDateTime, fmtNumber, untilText } from '../ioc-format';
import { frameworkKindLabels, frequencyLabels, issuingLevelLabels, type Framework, type FrameworkKind, type Frequency, type IssuingLevel, type Proposal } from '../ioc-types';
import type { Department } from '../types';
import '../styles/ioc-proposals.css';

type Status=Proposal['status'];
type Tab=Status|'ALL';
const TABS:{key:Tab;label:string}[]=[
  {key:'SUBMITTED',label:'Đã trình, chờ quyết định'},
  {key:'PROPOSED',label:'Chờ rà soát'},
  {key:'APPROVED',label:'Đã thành chỉ tiêu'},
  {key:'REJECTED',label:'Đã từ chối'},
  {key:'ALL',label:'Tất cả'},
];
const statusMeta:Record<Status,{label:string;tone:'warn'|'info'|'ok'|'bad'}>={
  PROPOSED:{label:'Chờ rà soát',tone:'info'},
  SUBMITTED:{label:'Đã trình',tone:'warn'},
  APPROVED:{label:'Đã thành chỉ tiêu',tone:'ok'},
  REJECTED:{label:'Đã từ chối',tone:'bad'},
};
const DAY=86_400_000;

type FormState={
  name:string;description:string;unit:string;targetValue:string;targetText:string;targetYear:string;frequency:Frequency|'';
  deadline:string;direction:'HIGHER_IS_BETTER'|'LOWER_IS_BETTER';responsibleDepartmentId:string;frameworkId:string;
  targetKind:FrameworkKind;issuingLevel:IssuingLevel|'';standardCode:string;legalBasis:string;sourceQuote:string;
};

function emptyForm(year:number,departmentId?:string|null):FormState{
  return {name:'',description:'',unit:'',targetValue:'',targetText:'',targetYear:String(year),frequency:'QUARTERLY',
    deadline:`${year}-12-31`,direction:'HIGHER_IS_BETTER',responsibleDepartmentId:departmentId??'',frameworkId:'',
    targetKind:'PLAN',issuingLevel:'LOCAL',standardCode:'',legalBasis:'',sourceQuote:''};
}

function formFromProposal(item:Proposal):FormState{
  return {
    name:item.name,description:item.description??'',unit:item.unit??'',targetValue:item.targetValue===null||item.targetValue===undefined?'':String(item.targetValue),
    targetText:item.targetText??'',targetYear:item.targetYear?String(item.targetYear):'',frequency:item.frequency??'',
    deadline:item.deadline?item.deadline.slice(0,10):'',direction:item.direction??'HIGHER_IS_BETTER',
    responsibleDepartmentId:item.responsibleDepartmentId??'',frameworkId:item.frameworkId??'',
    targetKind:(item as Proposal&{targetKind?:FrameworkKind}).targetKind??'PLAN',
    issuingLevel:(item as Proposal&{issuingLevel?:IssuingLevel|null}).issuingLevel??'',
    standardCode:(item as Proposal&{standardCode?:string|null}).standardCode??'',legalBasis:item.legalBasis??'',sourceQuote:item.sourceQuote??'',
  };
}

/** Đề xuất chỉ tiêu (CT-03): AI trích xuất hoặc cán bộ đề xuất → trình → duyệt/từ chối, quá hạn thì tự thông qua. */
export default function Proposals(){
  const me=auth.user;
  const [params,setParams]=useSearchParams();
  const tab=(TABS.some(item=>item.key===params.get('status'))?params.get('status'):'SUBMITTED') as Tab;
  const focusId=params.get('id');
  const [items,setItems]=useState<Proposal[]|null>(null);
  const [error,setError]=useState('');
  const [origin,setOrigin]=useState<''|'AI'|'HUMAN'>('');
  const [query,setQuery]=useState('');
  const [departments,setDepartments]=useState<Department[]>([]);
  const [frameworks,setFrameworks]=useState<Framework[]>([]);
  const [editing,setEditing]=useState<{item?:Proposal}|null>(null);
  const [deciding,setDeciding]=useState<{item:Proposal;mode:'approve'|'reject'}|null>(null);
  const [busyId,setBusyId]=useState('');
  const year=new Date().getFullYear();
  const canPropose=hasAnyRole(me,WORKING_ROLES);

  const load=useCallback(async()=>{
    setError('');
    try{setItems(await api<Proposal[]>('/candidates'))}
    catch(caught){setError(caught instanceof Error?caught.message:'Không tải được danh sách đề xuất')}
  },[]);

  useEffect(()=>{
    void load();
    api<Department[]>('/departments').then(list=>setDepartments(list.filter(item=>item.isActive))).catch(()=>undefined);
    api<Framework[]>(`/frameworks?year=${year}`).then(setFrameworks).catch(()=>undefined);
  },[load,year]);

  // Mở thẳng một đề xuất từ liên kết (?id=): chuyển sang đúng tab và cuộn tới thẻ.
  useEffect(()=>{
    if(!focusId||!items)return;
    const found=items.find(item=>item.id===focusId);
    if(found&&tab!=='ALL'&&found.status!==tab){setParams(next=>{next.set('status',found.status);return next},{replace:true});return}
    window.requestAnimationFrame(()=>document.getElementById(`pp-${focusId}`)?.scrollIntoView({block:'center',behavior:'smooth'}));
  },[focusId,items,tab,setParams]);

  const counts=useMemo(()=>{
    const result:Record<Tab,number>={PROPOSED:0,SUBMITTED:0,APPROVED:0,REJECTED:0,ALL:items?.length??0};
    for(const item of items??[])result[item.status]+=1;
    return result;
  },[items]);

  const visible=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('vi');
    return (items??[])
      .filter(item=>tab==='ALL'||item.status===tab)
      .filter(item=>!origin||item.origin===origin)
      .filter(item=>!needle||[item.name,item.description,item.responsibleDepartment?.name,item.document?.title,item.proposedByName].some(value=>value?.toLocaleLowerCase('vi').includes(needle)))
      .sort((a,b)=>tab==='SUBMITTED'?new Date(a.autoApproveAt??0).getTime()-new Date(b.autoApproveAt??0).getTime():0);
  },[items,tab,origin,query]);

  const urgent=(items??[]).filter(item=>item.status==='SUBMITTED'&&item.autoApproveAt&&new Date(item.autoApproveAt).getTime()-Date.now()<DAY).length;

  function setTab(key:Tab){
    setParams(next=>{next.set('status',key);next.delete('id');return next},{replace:true});
  }

  async function submit(item:Proposal){
    setBusyId(item.id);
    try{
      await api(`/candidates/${item.id}/submit`,{method:'POST',body:JSON.stringify({expectedVersion:item.version})});
      toast.ok('Đã trình đề xuất','Bắt đầu đếm ngược thời hạn xử lý; quá hạn hệ thống sẽ tự thông qua.');
      await load();
    }catch(caught){
      if(caught instanceof ApiError&&caught.status===400&&item.canEdit){toast.warn('Đề xuất còn thiếu thông tin',caught.message);setEditing({item})}
      else handleError(caught,'Không trình được đề xuất');
    }finally{setBusyId('')}
  }

  function handleError(caught:unknown,title:string){
    if(caught instanceof ApiError&&caught.status===409){toast.warn('Đề xuất vừa thay đổi','Danh sách đã được tải lại.');void load();return}
    toast.error(title,caught instanceof Error?caught.message:undefined);
  }

  if(!me)return null;
  return <div className="proposals">
    <PageHead
      eyebrow="Chỉ tiêu"
      title="Đề xuất chỉ tiêu"
      description="Mọi cán bộ đều có thể đề xuất chỉ tiêu mới; AI đọc văn bản và gợi ý. Đề xuất đã trình mà không ai xử lý trong thời hạn sẽ tự thành chỉ tiêu, có ghi trách nhiệm."
      actions={<>
        <button type="button" className="btn secondary" onClick={()=>void load()}><RefreshCw aria-hidden="true"/>Làm mới</button>
        {canPropose&&<button type="button" className="btn primary" onClick={()=>setEditing({})}><Plus aria-hidden="true"/>Đề xuất chỉ tiêu</button>}
      </>}
    />

    <ol className="pp-flow" aria-label="Quy trình đề xuất">
      <li className="ai"><strong>AI hoặc cán bộ đề xuất</strong><small>AI đọc văn bản trong kho; cán bộ đề xuất kèm căn cứ.</small></li>
      <li><strong>Rà soát và trình</strong><small>Văn thư hoặc cán bộ kiểm tra, bổ sung rồi bấm Trình. Kết quả AI không tự đi tiếp.</small></li>
      <li><strong>Lãnh đạo, trưởng phòng quyết định</strong><small>Duyệt thành chỉ tiêu hoặc từ chối kèm lý do.</small></li>
      <li className="auto"><strong>Quá hạn thì tự thông qua</strong><small>Đề xuất đã trình không ai xử lý sẽ tự thành chỉ tiêu và ghi trách nhiệm người duyệt.</small></li>
    </ol>

    <div className="pp-tabs" role="tablist" aria-label="Lọc theo trạng thái">
      {TABS.map(item=><button key={item.key} type="button" role="tab" aria-selected={tab===item.key}
        className={`chip ${tab===item.key?'active':''} ${item.key==='SUBMITTED'&&urgent?'hot':''}`} onClick={()=>setTab(item.key)}>
        {item.label} <b>{counts[item.key]}</b>
      </button>)}
    </div>

    <div className="ioc-filters pp-filters">
      <label className="search"><Search aria-hidden="true"/><input type="search" aria-label="Tìm đề xuất" placeholder="Tìm theo tên, phòng, văn bản, người đề xuất" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <select aria-label="Lọc theo nguồn" value={origin} onChange={event=>setOrigin(event.target.value as typeof origin)}>
        <option value="">Mọi nguồn</option>
        <option value="AI">AI trích xuất</option>
        <option value="HUMAN">Cán bộ đề xuất</option>
      </select>
      {urgent>0&&<span className="pp-countdown urgent"><Clock3 aria-hidden="true"/>{urgent} đề xuất sẽ tự thông qua trong 24 giờ</span>}
    </div>

    {error?<div className="pp-error form-error" role="alert">{error}<button type="button" className="btn secondary sm" onClick={()=>void load()}>Thử lại</button></div>
      :!items?<SkeletonCards count={3}/>
      :!visible.length?<Empty
        title={tab==='SUBMITTED'?'Không có đề xuất nào chờ quyết định':tab==='PROPOSED'?'Không có đề xuất chờ rà soát':'Không có đề xuất phù hợp'}
        description={tab==='SUBMITTED'?'Mọi đề xuất đã trình đều đã được xử lý.':'Thử đổi bộ lọc, hoặc tạo đề xuất mới khi phát hiện chỉ tiêu chưa có trên hệ thống.'}
        action={canPropose?<button type="button" className="btn secondary sm" onClick={()=>setEditing({})}><Plus aria-hidden="true"/>Đề xuất chỉ tiêu</button>:undefined}/>
      :<div className="pp-list">
        {visible.map(item=><ProposalCard key={item.id} item={item} focused={item.id===focusId} busy={busyId===item.id}
          onEdit={()=>setEditing({item})} onSubmit={()=>void submit(item)}
          onApprove={()=>setDeciding({item,mode:'approve'})} onReject={()=>setDeciding({item,mode:'reject'})}/>)}
      </div>}

    {editing&&<ProposalForm item={editing.item} year={year} departments={departments} frameworks={frameworks} me={me}
      onClose={()=>setEditing(null)} onSaved={async()=>{setEditing(null);await load()}} onError={handleError}/>}
    {deciding&&<DecisionModal item={deciding.item} mode={deciding.mode} onClose={()=>setDeciding(null)}
      onDone={async()=>{setDeciding(null);await load()}}
      onMissing={item=>{setDeciding(null);if(item.canEdit)setEditing({item})}} onError={handleError}/>}
  </div>;
}

function ProposalCard({item,focused,busy,onEdit,onSubmit,onApprove,onReject}:{item:Proposal;focused:boolean;busy:boolean;onEdit:()=>void;onSubmit:()=>void;onApprove:()=>void;onReject:()=>void}){
  const meta=statusMeta[item.status];
  const remaining=item.autoApproveAt?new Date(item.autoApproveAt).getTime()-Date.now():null;
  const urgent=item.status==='SUBMITTED'&&remaining!==null&&remaining<DAY;
  const value=item.targetText||(item.targetValue!==null&&item.targetValue!==undefined?`${fmtNumber(item.targetValue)} ${item.unit??''}`.trim():'—');
  return <article id={`pp-${item.id}`} className={`pp-card ${item.status} ${urgent?'urgent':''}`} aria-current={focused?'true':undefined}>
    <div className="pp-head">
      <div>
        <h3 className="pp-title">{item.name}</h3>
        <div className="pp-sub">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {item.origin==='AI'?<Badge tone="ai"><Bot aria-hidden="true"/>AI trích xuất</Badge>:<Badge tone="neutral"><UserRound aria-hidden="true"/>Cán bộ đề xuất</Badge>}
          {item.isDuplicateSuspect&&<Badge tone="warn">Nghi trùng chỉ tiêu đã có</Badge>}
          {item.responsibleDepartment&&<span>{item.responsibleDepartment.name}</span>}
        </div>
      </div>
      {item.status==='SUBMITTED'&&item.autoApproveAt&&<span className={`pp-countdown ${urgent?'urgent':''}`} title={`Tự thông qua lúc ${fmtDateTime(item.autoApproveAt)}`}>
        <Clock3 aria-hidden="true"/>{remaining!==null&&remaining>0?`Tự thông qua ${untilText(item.autoApproveAt)}`:'Đến hạn tự thông qua'}
      </span>}
    </div>

    {item.description&&<p className="pp-desc">{item.description}</p>}
    <dl className="pp-facts">
      <div><dt>Mục tiêu</dt><dd><b>{value}</b>{item.targetYear?<small> năm {item.targetYear}</small>:null}</dd></div>
      <div><dt>Kỳ báo cáo</dt><dd>{item.frequency?frequencyLabels[item.frequency]:'—'}</dd></div>
      <div><dt>Hạn</dt><dd>{item.deadline?fmtDate(item.deadline):'—'}</dd></div>
      <div><dt>Bộ chỉ tiêu</dt><dd>{item.framework?.name??'Chưa gắn bộ'}</dd></div>
      {item.legalBasis&&<div className="wide"><dt>Căn cứ</dt><dd>{item.legalBasis}</dd></div>}
    </dl>

    {(item.sourceQuote||item.document)&&<div className="pp-source">
      {item.sourceQuote&&<blockquote className="pp-quote">“{item.sourceQuote}”</blockquote>}
      <div className="pp-source-meta">
        {item.document&&<Link className="pp-doc" to={`/admin/documents/${item.document.id}`}><FileText aria-hidden="true"/><span>{item.document.docNumber||item.document.code} — {item.document.title}</span></Link>}
        {item.origin==='AI'&&<span className="pp-conf" title="Độ tin cậy của AI">
          <Sparkles aria-hidden="true"/>Độ tin cậy <b>{Math.round(item.confidence*100)}%</b>
          <span className="progress sm"><i className={item.confidence>=0.7?'ok':'warn'} style={{width:`${Math.round(item.confidence*100)}%`}}/></span>
        </span>}
      </div>
    </div>}

    {item.status==='APPROVED'&&<div className={`pp-result ${item.autoApproved?'auto':'ok'}`}>
      <CheckCircle2 aria-hidden="true"/>
      <span>{item.autoApproved?'Hệ thống tự thông qua vì quá hạn không có người xử lý':`Duyệt bởi ${item.reviewedBy?.fullName??'người có thẩm quyền'}`}{item.reviewedAt?` · ${fmtDateTime(item.reviewedAt)}`:''}
        {item.createdTarget&&<> · <Link to={`/admin/targets/${item.createdTarget.id}`}><Target aria-hidden="true"/>{item.createdTarget.code}</Link></>}
      </span>
    </div>}
    {item.status==='REJECTED'&&<div className="pp-result bad">
      <XCircle aria-hidden="true"/>
      <span>Từ chối bởi {item.reviewedBy?.fullName??'người có thẩm quyền'}{item.reviewedAt?` · ${fmtDateTime(item.reviewedAt)}`:''}{item.reviewNote?<> — <b>Lý do:</b> {item.reviewNote}</>:null}</span>
    </div>}

    <div className="pp-foot">
      <small className="ioc-muted">
        {item.origin==='AI'?'AI trích xuất':`Đề xuất bởi ${item.proposedByName??'cán bộ'}`} · {fmtDateTime(item.createdAt)}
        {item.submittedAt?` · Trình ${fmtDateTime(item.submittedAt)}`:''}
      </small>
      <div className="pp-actions">
        {item.canEdit&&<button type="button" className="btn ghost sm" disabled={busy} onClick={onEdit}><Pencil aria-hidden="true"/>Sửa</button>}
        {item.canEdit&&item.status==='PROPOSED'&&<button type="button" className="btn secondary sm" disabled={busy} onClick={onSubmit}><Send aria-hidden="true"/>{busy?'Đang trình…':'Trình lãnh đạo'}</button>}
        {item.canDecide&&<button type="button" className="btn secondary sm" disabled={busy} onClick={onReject}><X aria-hidden="true"/>Từ chối</button>}
        {item.canDecide&&<button type="button" className="btn primary sm" disabled={busy} onClick={onApprove}><Check aria-hidden="true"/>Duyệt thành chỉ tiêu</button>}
      </div>
    </div>
  </article>;
}

function ProposalForm({item,year,departments,frameworks,me,onClose,onSaved,onError}:{
  item?:Proposal;year:number;departments:Department[];frameworks:Framework[];me:NonNullable<typeof auth.user>;
  onClose:()=>void;onSaved:()=>Promise<void>;onError:(error:unknown,title:string)=>void;
}){
  const [form,setForm]=useState<FormState>(()=>item?formFromProposal(item):emptyForm(year,me.departmentId));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const set=<K extends keyof FormState>(key:K,value:FormState[K])=>setForm(current=>({...current,[key]:value}));

  function payload(){
    const number=(value:string)=>value.trim()===''?undefined:Number(value.replace(',','.'));
    return {
      name:form.name.trim(),description:form.description.trim()||undefined,unit:form.unit.trim()||undefined,
      targetValue:number(form.targetValue),targetText:form.targetText.trim()||undefined,targetYear:number(form.targetYear),
      frequency:form.frequency||undefined,deadline:form.deadline||undefined,direction:form.direction,
      responsibleDepartmentId:form.responsibleDepartmentId||undefined,frameworkId:form.frameworkId||undefined,
      targetKind:form.targetKind,issuingLevel:form.issuingLevel||undefined,standardCode:form.standardCode.trim()||undefined,
      legalBasis:form.legalBasis.trim()||undefined,
    };
  }

  async function save(event:FormEvent,submit:boolean){
    event.preventDefault();
    if(form.name.trim().length<3){setError('Tên chỉ tiêu phải có ít nhất 3 ký tự.');return}
    const body=payload();
    if(body.targetValue!==undefined&&(!Number.isFinite(body.targetValue)||body.targetValue<0)){setError('Giá trị mục tiêu phải là số không âm.');return}
    setBusy(true);setError('');
    try{
      if(item){
        await api(`/candidates/${item.id}`,{method:'PATCH',body:JSON.stringify({...body,expectedVersion:item.version})});
        if(submit&&item.status==='PROPOSED'){
          const fresh=await api<Proposal>(`/candidates/${item.id}`);
          await api(`/candidates/${item.id}/submit`,{method:'POST',body:JSON.stringify({expectedVersion:fresh.version})});
        }
      }else{
        await api('/candidates',{method:'POST',body:JSON.stringify({...body,sourceQuote:form.sourceQuote.trim()||undefined,submit})});
      }
      toast.ok(submit?'Đã trình đề xuất':'Đã lưu đề xuất',submit?'Lãnh đạo hoặc trưởng phòng sẽ nhận thông báo; quá hạn không xử lý thì tự thông qua.':form.name.trim());
      await onSaved();
    }catch(caught){
      if(caught instanceof ApiError&&caught.status===400){setError(caught.message)}
      else{onError(caught,'Không lưu được đề xuất');setError(caught instanceof Error?caught.message:'')}
    }finally{setBusy(false)}
  }

  const canSubmit=!item||item.status==='PROPOSED';
  return <Modal wide title={item?'Sửa đề xuất chỉ tiêu':'Đề xuất chỉ tiêu mới'} description="Trình ngay cần đủ: tên, đơn vị, mục tiêu, năm, kỳ báo cáo, hạn và phòng chủ trì." onClose={()=>{if(!busy)onClose()}}>
    <form className="modal-body" onSubmit={event=>void save(event,false)} noValidate>
      <div className="pp-form-section">
        <h4>Chỉ tiêu</h4>
        <div className="form-grid two">
          <label className="full">Tên chỉ tiêu <span className="pp-req">*</span><input type="text" value={form.name} maxLength={300} onChange={event=>set('name',event.target.value)} autoFocus/></label>
          <label className="full">Mô tả<textarea rows={2} value={form.description} maxLength={1000} onChange={event=>set('description',event.target.value)}/></label>
          <label>Giá trị mục tiêu<input type="number" min={0} step="any" value={form.targetValue} onChange={event=>set('targetValue',event.target.value)}/></label>
          <label>Đơn vị tính<input type="text" value={form.unit} maxLength={50} placeholder="%, hộ, hồ sơ…" onChange={event=>set('unit',event.target.value)}/></label>
          <label className="full">Mục tiêu nguyên văn (không bắt buộc)<input type="text" value={form.targetText} maxLength={300} placeholder="Ví dụ: ≥ 80% hộ kinh doanh" onChange={event=>set('targetText',event.target.value)}/></label>
          <label>Chiều đánh giá<select value={form.direction} onChange={event=>set('direction',event.target.value as FormState['direction'])}>
            <option value="HIGHER_IS_BETTER">Càng cao càng tốt</option><option value="LOWER_IS_BETTER">Càng thấp càng tốt</option>
          </select></label>
          <label>Loại chỉ tiêu<select value={form.targetKind} onChange={event=>set('targetKind',event.target.value as FrameworkKind)}>
            {(Object.keys(frameworkKindLabels) as FrameworkKind[]).map(key=><option key={key} value={key}>{frameworkKindLabels[key]}</option>)}
          </select></label>
        </div>
      </div>
      <div className="pp-form-section">
        <h4>Thời hạn và trách nhiệm</h4>
        <div className="form-grid two">
          <label>Năm kế hoạch<input type="number" min={2000} max={2100} value={form.targetYear} onChange={event=>set('targetYear',event.target.value)}/></label>
          <label>Kỳ báo cáo<select value={form.frequency} onChange={event=>set('frequency',event.target.value as Frequency)}>
            <option value="">Chọn kỳ</option>
            {(Object.keys(frequencyLabels) as Frequency[]).map(key=><option key={key} value={key}>{frequencyLabels[key]}</option>)}
          </select></label>
          <label>Hạn hoàn thành<input type="date" value={form.deadline} onChange={event=>set('deadline',event.target.value)}/></label>
          <label>Phòng chủ trì<select value={form.responsibleDepartmentId} onChange={event=>set('responsibleDepartmentId',event.target.value)}>
            <option value="">Chọn phòng</option>
            {departments.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}
          </select></label>
          <label>Bộ chỉ tiêu<select value={form.frameworkId} onChange={event=>set('frameworkId',event.target.value)}>
            <option value="">Không gắn bộ</option>
            {frameworks.map(framework=><option key={framework.id} value={framework.id}>{framework.name}</option>)}
          </select></label>
          <label>Cấp giao<select value={form.issuingLevel} onChange={event=>set('issuingLevel',event.target.value as IssuingLevel)}>
            <option value="">Chưa xác định</option>
            {(Object.keys(issuingLevelLabels) as IssuingLevel[]).map(key=><option key={key} value={key}>{issuingLevelLabels[key]}</option>)}
          </select></label>
        </div>
      </div>
      <div className="pp-form-section">
        <h4>Căn cứ</h4>
        <div className="form-grid two">
          <label>Văn bản căn cứ<input type="text" value={form.legalBasis} maxLength={200} placeholder="Ví dụ: Thông báo kết luận giao ban tháng 10" onChange={event=>set('legalBasis',event.target.value)}/></label>
          <label>Mã chuẩn (nếu có)<input type="text" value={form.standardCode} maxLength={40} onChange={event=>set('standardCode',event.target.value)}/></label>
          {!item&&<label className="full">Trích dẫn nội dung giao (không bắt buộc)<textarea rows={2} value={form.sourceQuote} maxLength={2000} onChange={event=>set('sourceQuote',event.target.value)}/></label>}
        </div>
      </div>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Huỷ</button>
        <button type="submit" className="btn secondary" disabled={busy}>{busy?'Đang lưu…':item?'Lưu thay đổi':'Lưu nháp'}</button>
        {canSubmit&&<button type="button" className="btn primary" disabled={busy} onClick={event=>void save(event as unknown as FormEvent,true)}><Send aria-hidden="true"/>{busy?'Đang trình…':'Lưu và trình'}</button>}
      </div>
    </form>
  </Modal>;
}

function DecisionModal({item,mode,onClose,onDone,onMissing,onError}:{
  item:Proposal;mode:'approve'|'reject';onClose:()=>void;onDone:()=>Promise<void>;onMissing:(item:Proposal)=>void;onError:(error:unknown,title:string)=>void;
}){
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function decide(event:FormEvent){
    event.preventDefault();
    if(mode==='reject'&&reason.trim().length<5){setError('Vui lòng ghi rõ lý do từ chối (ít nhất 5 ký tự).');return}
    setBusy(true);setError('');
    try{
      const result=await api<{target?:{id:string;code:string}}>(`/candidates/${item.id}/${mode}`,{method:'POST',body:JSON.stringify(mode==='approve'?{expectedVersion:item.version}:{expectedVersion:item.version,reason:reason.trim()})});
      toast.ok(mode==='approve'?'Đã tạo chỉ tiêu từ đề xuất':'Đã từ chối đề xuất',mode==='approve'?(result?.target?.code??item.name):'Người đề xuất đã nhận thông báo kèm lý do.');
      await onDone();
    }catch(caught){
      if(caught instanceof ApiError&&caught.status===400&&mode==='approve'){
        toast.warn('Đề xuất còn thiếu thông tin',caught.message);
        onMissing(item);
      }else{onError(caught,mode==='approve'?'Không duyệt được đề xuất':'Không từ chối được đề xuất');setError(caught instanceof Error?caught.message:'')}
    }finally{setBusy(false)}
  }

  return <Modal title={mode==='approve'?'Duyệt thành chỉ tiêu?':'Từ chối đề xuất'} description={mode==='approve'
    ?'Hệ thống tạo chỉ tiêu mới cho phòng chủ trì; trưởng phòng sẽ nhận thông báo để giao chuyên viên phụ trách.'
    :'Lý do từ chối được gửi cho người đề xuất và hiện ở màn hình trách nhiệm người đứng đầu.'} onClose={()=>{if(!busy)onClose()}}>
    <form className="modal-body" onSubmit={decide} noValidate>
      <p className="pp-preview"><strong>{item.name}</strong>{item.responsibleDepartment?` — ${item.responsibleDepartment.name}`:''}</p>
      {mode==='reject'&&<label>Lý do từ chối
        <textarea rows={3} value={reason} maxLength={500} onChange={event=>setReason(event.target.value)} autoFocus/>
        <small className="pp-counter">{reason.length}/500</small>
      </label>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" data-modal-initial-focus disabled={busy} onClick={onClose}>Huỷ</button>
        <button type="submit" className={`btn ${mode==='approve'?'primary':'danger'}`} disabled={busy}>{busy?'Đang xử lý…':mode==='approve'?'Duyệt thành chỉ tiêu':'Từ chối'}</button>
      </div>
    </form>
  </Modal>;
}
