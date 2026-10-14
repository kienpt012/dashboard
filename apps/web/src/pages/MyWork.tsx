import { AlertTriangle, ArrowRight, Check, FilePlus2, RefreshCw, UserPlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, auth } from '../api';
import { ADMIN_ROLES, APPROVAL_ROLES, FRAMEWORK_EDITOR_ROLES, hasAnyRole, SUPERVISOR_ROLES } from '../authz';
import { DensityToggle, Hint, useDensity } from '../components/Detail';
import { Badge, Empty, Modal, PageHead, Skeleton, SkeletonTable, StateCard } from '../components/UI';
import { toast } from '../components/Toast';
import type { MyWork as MyWorkData, TargetBrief } from '../ioc-types';
import { fmtDate, fmtDateTime, fmtNumber, relativeTime, statusTone, untilText, valueWithUnit } from '../ioc-format';
import { statusMeta } from '../types';
import '../styles/ioc-mywork.css';

// Việc của tôi (DH-02): hộp việc gom mọi thứ người đăng nhập phải xử lý, chia theo nhóm, việc gấp tô đỏ.

const DAY=86_400_000;
const PERIODS_SHOWN=6;

type Tone='ok'|'warn'|'bad'|'info'|'neutral';
/** Số ngày tự thông qua. GET /my-work chưa trả về; quản trị viên đọc được từ /settings. */
type Rules={reportAutoApproveDays?:number|null;proposalAutoApproveDays?:number|null};
type Work=MyWorkData&{rules?:Rules};
type ReviewItem=MyWorkData['toReview'][number];
type RejectedItem=MyWorkData['rejectedReports'][number];
/** Một dòng của GET /targets/pending-updates: bổ sung giá trị, kỳ, người gửi cho "Chờ tôi duyệt". */
type PendingUpdate={
  id:string;value:number;valueText?:string|null;periodKey?:string|null;note?:string|null;explanation?:string|null;dataSource?:string|null;
  baseVersion:number;user:{fullName:string};target:{version:number;unit:string};
};
type TabKey='bao-cao'|'tra-lai'|'cho-duyet'|'de-xuat'|'giai-trinh'|'chua-giao'|'chi-tieu'|'de-xuat-cua-toi';
type Tab={key:TabKey;label:string;count:number;hot:boolean;work:boolean};

const proposalStatus:Record<string,{label:string;tone:Tone}>={
  PROPOSED:{label:'Chưa trình',tone:'neutral'},
  SUBMITTED:{label:'Đã trình, chờ duyệt',tone:'warn'},
  APPROVED:{label:'Đã duyệt',tone:'ok'},
  REJECTED:{label:'Bị từ chối',tone:'bad'},
};
const statusOrder:Record<string,number>={OVERDUE:0,AT_RISK:1,NOT_STARTED:2,ON_TRACK:3,COMPLETED:4};

/** Nhãn kỳ báo cáo từ khoá kỳ (2026-M09, 2026-Q3, 2026-H1, 2026) — giống periodLabel phía máy chủ. */
function periodName(key?:string|null){
  const match=key?/^(\d{4})(?:-([MQH])(\d{1,2}))?$/.exec(key):null;
  if(!match)return key??'';
  const [,year,kind,raw]=match;
  const index=Number(raw);
  if(!kind)return `Năm ${year}`;
  if(kind==='M')return `Tháng ${index}/${year}`;
  if(kind==='Q')return `Quý ${['I','II','III','IV'][index-1]??index}/${year}`;
  return index===1?`6 tháng đầu năm ${year}`:`6 tháng cuối năm ${year}`;
}

function msUntil(at?:string|null){return at?new Date(at).getTime()-Date.now():Number.POSITIVE_INFINITY}
/** "Còn 18 giờ sẽ tự thông qua" hoặc "Đã đến hạn tự thông qua". */
function autoText(at:string){
  const text=untilText(at);
  return msUntil(at)>0?`Tự thông qua ${text}`:'Đến hạn tự thông qua';
}
function urgency(ms:number):Tone{return ms<=DAY?'bad':ms<=2*DAY?'warn':'neutral'}
function sev(tone:Tone){return tone==='bad'?'critical':tone==='warn'?'warning':'info'}
function valueLine(target:TargetBrief){
  if(target.kind==='STAT')return `Số liệu: ${valueWithUnit(target.currentValue,target.unit)}`;
  return `${valueWithUnit(target.currentValue,target.unit)} / ${target.targetText||valueWithUnit(target.targetValue,target.unit)}`;
}
function errorText(reason:unknown,fallback:string){return reason instanceof Error&&reason.message?reason.message:fallback}

export default function MyWork(){
  const user=auth.user;
  const role=user?.role;
  const reviewer=hasAnyRole(user,APPROVAL_ROLES);
  const isAdmin=hasAnyRole(user,ADMIN_ROLES);
  const [data,setData]=useState<Work|null>(null);
  const [pending,setPending]=useState<Map<string,PendingUpdate>>(new Map());
  const [settingRules,setSettingRules]=useState<Rules|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState('');
  const [params,setParams]=useSearchParams();
  const [confirmId,setConfirmId]=useState('');
  const [busyId,setBusyId]=useState('');
  const [rejecting,setRejecting]=useState<ReviewItem|null>(null);
  const [reason,setReason]=useState('');
  const [rejectError,setRejectError]=useState('');
  const [,setTick]=useState(0);
  const [density,setDensity]=useDensity('my-work');
  const detailed=density==='detailed';
  const requestRef=useRef(0);
  const tabRefs=useRef<Partial<Record<TabKey,HTMLButtonElement|null>>>({});

  const load=useCallback(async(quiet=false)=>{
    const id=++requestRef.current;
    if(quiet)setRefreshing(true);else setLoading(true);
    setError('');
    try{
      // Hai lời gọi phụ chỉ làm giàu dữ liệu: hỏng thì bỏ qua, không làm hỏng trang.
      const [work,updates,settings]=await Promise.all([
        api<Work>('/my-work'),
        reviewer?api<PendingUpdate[]>('/targets/pending-updates').catch(()=>null):Promise.resolve(null),
        isAdmin?api<Rules>('/settings').catch(()=>null):Promise.resolve(null),
      ]);
      if(id!==requestRef.current)return;
      setData(work);
      setPending(new Map((updates??[]).map(update=>[update.id,update])));
      if(settings)setSettingRules(settings);
    }catch(reason){
      if(id!==requestRef.current)return;
      const message=errorText(reason,'Không tải được danh sách việc');
      if(quiet)toast.error('Không làm mới được',message);else setError(message);
    }finally{
      if(id===requestRef.current){setLoading(false);setRefreshing(false)}
    }
  },[reviewer,isAdmin]);

  useEffect(()=>{void load()},[load]);
  // Đếm ngược tự thông qua và hạn giải trình cần cập nhật theo thời gian thực.
  useEffect(()=>{
    const timer=window.setInterval(()=>setTick(value=>value+1),60_000);
    return()=>window.clearInterval(timer);
  },[]);

  async function review(item:ReviewItem,decision:'APPROVE'|'REJECT',note?:string){
    setBusyId(item.id);
    setRejectError('');
    try{
      await api(`/targets/updates/${item.id}/review`,{method:'PATCH',body:JSON.stringify(decision==='REJECT'?{decision,reviewNote:note}:{decision})});
      toast.ok(decision==='APPROVE'?'Đã duyệt số liệu':'Đã trả lại báo cáo',
        decision==='APPROVE'?`${item.target.code} đã cập nhật số liệu chính thức.`:'Người báo cáo đã được thông báo kèm lý do.');
      setConfirmId('');
      setRejecting(null);
      await load(true);
    }catch(reason){
      const message=errorText(reason,'Thao tác không thành công');
      if(reason instanceof ApiError&&(reason.status===409||reason.status===404)){
        toast.warn('Dữ liệu đã thay đổi, tải lại',message);
        setConfirmId('');
        setRejecting(null);
        await load(true);
      }else if(decision==='REJECT')setRejectError(message);
      else toast.error('Không duyệt được số liệu',message);
    }finally{
      setBusyId('');
    }
  }

  function openReject(item:ReviewItem){
    setConfirmId('');
    setReason('');
    setRejectError('');
    setRejecting(item);
  }

  function submitReject(event:FormEvent){
    event.preventDefault();
    if(!rejecting)return;
    if(!reason.trim()){setRejectError('Vui lòng nhập lý do.');return}
    void review(rejecting,'REJECT',reason.trim());
  }

  const head=(actions?:boolean)=><PageHead
    title="Việc của tôi"
    actions={actions?<>
      <DensityToggle value={density} onChange={setDensity}/>
      <button type="button" className="btn secondary icon" disabled={loading||refreshing} onClick={()=>void load(true)} aria-label="Làm mới" title="Làm mới">
        <RefreshCw className={refreshing?'spin':undefined} aria-hidden="true"/>
      </button>
    </>:undefined}
  />;

  if(loading&&!data)return <div className="mw" aria-busy="true">
    {head()}
    <div className="mw-skel-tabs" aria-hidden="true">{Array.from({length:5},(_,index)=><Skeleton key={index}/>)}</div>
    <SkeletonTable rows={5}/>
  </div>;

  if(!data)return <div className="mw">
    {head()}
    <StateCard icon={<AlertTriangle/>} title="Không tải được danh sách việc" description={error||'Máy chủ không phản hồi.'}
      action={<button type="button" className="btn primary" onClick={()=>void load()}>Thử lại</button>}/>
  </div>;

  // ---- Suy ra nhóm việc, mức gấp và tab mặc định từ dữ liệu ----
  const rules:Rules={
    reportAutoApproveDays:data.rules?.reportAutoApproveDays??settingRules?.reportAutoApproveDays??null,
    proposalAutoApproveDays:data.rules?.proposalAutoApproveDays??settingRules?.proposalAutoApproveDays??null,
  };
  const reportDays=rules.reportAutoApproveDays;
  const reviewAutoAt=(item:ReviewItem)=>reportDays?new Date(new Date(item.createdAt).getTime()+reportDays*DAY).toISOString():null;
  const reviewTone=(item:ReviewItem):Tone=>{
    const at=reviewAutoAt(item);
    if(at)return urgency(msUntil(at));
    return item.days>=5?'bad':item.days>=3?'warn':'neutral';
  };
  // Báo cáo bị trả lại coi như đã xử lý nếu chỉ tiêu có báo cáo mới (đang chờ duyệt hoặc được ghi nhận) sau lúc trả lại.
  const known=new Map<string,TargetBrief&{pendingReport?:boolean}>();
  data.myTargets.forEach(target=>known.set(target.id,target));
  data.needReport.forEach(target=>known.set(target.id,target));
  const resolved=(report:RejectedItem)=>{
    const target=known.get(report.target.id);
    if(!target)return false;
    if(target.pendingReport)return true;
    return Boolean(target.lastReportedAt&&report.reviewedAt&&new Date(target.lastReportedAt)>new Date(report.reviewedAt));
  };
  const openRejected=data.rejectedReports.filter(report=>!resolved(report)).length;
  const lateReports=data.needReport.filter(target=>target.missingPeriods.length>0&&!target.pendingReport).length;
  const urgentReviews=data.toReview.filter(item=>reviewTone(item)!=='neutral').length;
  const urgentProposals=data.proposals.filter(proposal=>proposal.autoApproveAt&&msUntil(proposal.autoApproveAt)<=2*DAY).length;

  const reporter=role==='STAFF'||role==='MANAGER';
  const allTabs:(Tab&{show:boolean})[]=[
    {key:'bao-cao',label:'Cần báo cáo',count:data.needReport.length,hot:lateReports>0,work:true,show:reporter},
    {key:'tra-lai',label:'Bị trả lại',count:openRejected,hot:openRejected>0,work:true,show:reporter||data.rejectedReports.length>0},
    {key:'cho-duyet',label:'Chờ duyệt',count:data.toReview.length,hot:urgentReviews>0,work:true,show:reviewer},
    {key:'de-xuat',label:'Đề xuất',count:data.proposals.length,hot:urgentProposals>0,work:true,show:hasAnyRole(user,FRAMEWORK_EDITOR_ROLES)||role==='MANAGER'},
    {key:'giai-trinh',label:'Giải trình',count:data.explanations.length,hot:data.explanations.length>0,work:true,show:reporter},
    {key:'chua-giao',label:'Chưa giao người',count:data.unassigned.length,hot:false,work:true,show:hasAnyRole(user,SUPERVISOR_ROLES)},
    {key:'chi-tieu',label:'Chỉ tiêu của tôi',count:data.myTargets.length,hot:false,work:false,show:reporter},
    {key:'de-xuat-cua-toi',label:'Đề xuất của tôi',count:data.myProposals.length,hot:false,work:false,show:reporter||role==='CLERK'},
  ];
  const workTotal=allTabs.filter(tab=>tab.work).reduce((sum,tab)=>sum+tab.count,0);
  // Hết việc: chỉ giữ các tab tra cứu còn nội dung, phần còn lại thay bằng trạng thái "đã xử lý hết".
  const tabs:Tab[]=allTabs.filter(tab=>workTotal===0?!tab.work&&tab.count>0:detailed?tab.show||tab.count>0:tab.count>0||(!tab.work&&tab.show));
  const requested=params.get('tab');
  const active=tabs.find(tab=>tab.key===requested)??tabs.find(tab=>tab.work&&tab.count>0)??tabs.find(tab=>tab.count>0)??tabs[0];

  function selectTab(key:TabKey){
    setConfirmId('');
    setParams(previous=>{const next=new URLSearchParams(previous);next.set('tab',key);return next},{replace:true});
  }
  function onTabKey(event:KeyboardEvent<HTMLDivElement>){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!active)return;
    event.preventDefault();
    const index=tabs.findIndex(tab=>tab.key===active.key);
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    selectTab(tabs[next].key);
    tabRefs.current[tabs[next].key]?.focus();
  }

  const unitOf=(targetId:string)=>known.get(targetId)?.unit??'';

  // ---- Nội dung từng nhóm việc ----
  function needReportPanel(){
    const items=[...data!.needReport].sort((a,b)=>Number(a.pendingReport)-Number(b.pendingReport)||b.missingPeriods.length-a.missingPeriods.length);
    return <>
      <PanelHead title="Cần báo cáo" link={{to:'/admin/targets?assignee=me',label:'Danh mục'}}/>
      {items.length?<ul className="ioc-list mw-list">{items.map(target=>{
        const late=target.missingPeriods.length>0&&!target.pendingReport;
        const extra=target.missingPeriods.length-PERIODS_SHOWN;
        return <li key={target.id}>
          <span className={`ioc-sev ${late?'critical':target.pendingReport?'info':'warning'}`} aria-hidden="true"/>
          <div className="grow">
            <Hint title={target.title} rows={[
              {label:'Mã',value:target.code},
              {label:'Phòng',value:target.departmentName},
              {label:'Kỳ hiện tại',value:target.currentPeriod},
              {label:'Còn thiếu',value:target.missingPeriods.join(', ')},
              {label:'Số liệu',value:valueLine(target)},
            ]}>
              <Link className="title" to={`/admin/targets/${target.id}#thuc-hien`}>{target.title}</Link>
            </Hint>
            <span className="sub"><span className="ioc-code">{target.code}</span> · {target.currentPeriod}</span>
            {detailed&&target.missingPeriods.length>0&&<div className="mw-periods">
              {target.missingPeriods.slice(0,PERIODS_SHOWN).map(period=><Badge key={period} tone="bad">{period}</Badge>)}
              {extra>0&&<Badge tone="neutral">+{extra} kỳ</Badge>}
            </div>}
          </div>
          <div className="side">
            <span className={`mw-state ${late?'bad':''}`}>{target.pendingReport?'Đang chờ duyệt':target.missingPeriods.length?`Thiếu ${target.missingPeriods.length} kỳ`:!target.hasReport?'Chưa báo cáo':''}</span>
            <Link className={`btn sm ${target.pendingReport?'secondary':'primary'}`} to={`/admin/targets/${target.id}#thuc-hien`}><FilePlus2 aria-hidden="true"/>Báo cáo</Link>
          </div>
        </li>;
      })}</ul>:<Empty showIcon={false} title="Không có chỉ tiêu cần báo cáo" description=""/>}
    </>;
  }

  function rejectedPanel(){
    return <>
      <PanelHead title="Bị trả lại"/>
      {data!.rejectedReports.length?<ul className="ioc-list mw-list">{data!.rejectedReports.map(report=>{
        const done=resolved(report);
        return <li key={report.id}>
          <span className={`ioc-sev ${done?'info':'critical'}`} aria-hidden="true"/>
          <div className="grow">
            <Link className="title" to={`/admin/targets/${report.target.id}#thuc-hien`}>{report.target.title}</Link>
            <span className="sub"><span className="ioc-code">{report.target.code}</span> · Số liệu đã gửi: {valueWithUnit(report.value,unitOf(report.target.id))}
              {report.reviewedAt&&<> · Trả lại {relativeTime(report.reviewedAt)}</>}</span>
            <p className="mw-quote bad">{report.reviewNote||'—'}</p>
            {done&&<span className="sub">Đã báo cáo lại</span>}
          </div>
          <div className="side">
            <Link className={`btn sm ${done?'secondary':'primary'}`} to={`/admin/targets/${report.target.id}#thuc-hien`}>{done?'Mở hồ sơ':'Báo cáo lại'}</Link>
          </div>
        </li>;
      })}</ul>:<Empty showIcon={false} title="Không có báo cáo bị trả lại" description=""/>}
    </>;
  }

  function reviewPanel(){
    const items=[...data!.toReview].sort((a,b)=>b.days-a.days);
    return <>
      <PanelHead title="Chờ tôi duyệt" link={{to:'/admin/approvals',label:'Trang duyệt'}}/>
      {items.length?<ul className="ioc-list mw-list">{items.map(item=>{
        const update=pending.get(item.id);
        const unit=update?.target.unit??item.target.unit;
        const stale=Boolean(update&&update.baseVersion!==update.target.version);
        const autoAt=reviewAutoAt(item);
        const tone=reviewTone(item);
        const busy=busyId===item.id;
        return <li key={item.id}>
          <span className={`ioc-sev ${sev(tone)}`} aria-hidden="true"/>
          <div className="grow">
            <Hint title={item.target.title} rows={[
              {label:'Người gửi',value:update?.user.fullName},
              {label:'Kỳ',value:update?.periodKey?periodName(update.periodKey):null},
              {label:'Số đề nghị',value:update?(update.valueText||valueWithUnit(update.value,unit)):null},
              {label:'Số hiện tại',value:valueWithUnit(item.target.currentValue,unit)},
              {label:'Nguồn',value:update?.dataSource},
              {label:'Gửi lúc',value:fmtDateTime(item.createdAt)},
            ]}>
              <Link className="title" to={`/admin/targets/${item.target.id}#thuc-hien`}>{item.target.title}</Link>
            </Hint>
            <span className="sub">
              <span className="ioc-code">{item.target.code}</span>
              {update&&<> · {update.user.fullName}{update.periodKey?` · ${periodName(update.periodKey)}`:''}: <b>{update.valueText||valueWithUnit(update.value,unit)}</b></>}
            </span>
            {detailed&&update?.dataSource&&<span className="sub">Nguồn: {update.dataSource}</span>}
            {detailed&&(update?.explanation||update?.note)&&<p className="mw-quote">{update.explanation||update.note}</p>}
            {stale&&<span className="sub mw-warn">Chỉ tiêu đã có số liệu mới sau lúc gửi</span>}
          </div>
          <div className="side">
            <span className={`mw-state ${tone==='bad'?'bad':tone==='warn'?'warn':''}`}>{autoAt?autoText(autoAt):`Chờ ${item.days} ngày`}</span>
            {reviewer&&update&&(confirmId===item.id?<>
              <button type="button" className="btn primary sm" disabled={busy} onClick={()=>void review(item,'APPROVE')}><Check aria-hidden="true"/>{busy?'Đang duyệt…':'Xác nhận'}</button>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={()=>setConfirmId('')}>Huỷ</button>
            </>:<>
              <button type="button" className="btn primary sm" disabled={stale||Boolean(busyId)} title={stale?'Chỉ tiêu đã có số liệu mới sau lúc gửi':undefined}
                onClick={()=>setConfirmId(item.id)}><Check aria-hidden="true"/>Duyệt</button>
              <button type="button" className="btn secondary sm danger-text" disabled={Boolean(busyId)} onClick={()=>openReject(item)}><X aria-hidden="true"/>Từ chối</button>
            </>)}
            {!update&&<Link className="btn secondary sm" to={`/admin/targets/${item.target.id}#thuc-hien`}>Mở hồ sơ</Link>}
          </div>
        </li>;
      })}</ul>:<Empty showIcon={false} title="Không có báo cáo chờ duyệt" description=""/>}
    </>;
  }

  function proposalsPanel(){
    return <>
      <PanelHead title="Đề xuất chờ xử lý" link={{to:'/admin/proposals?status=SUBMITTED',label:'Trang đề xuất'}}/>
      {data!.proposals.length?<ul className="ioc-list mw-list">{data!.proposals.map(proposal=>{
        const left=msUntil(proposal.autoApproveAt);
        const tone=proposal.autoApproveAt?urgency(left):'neutral';
        const screening=proposal.status==='PROPOSED';
        return <li key={proposal.id}>
          <span className={`ioc-sev ${sev(tone)}`} aria-hidden="true"/>
          <div className="grow">
            <Link className="title" to={`/admin/proposals?id=${encodeURIComponent(proposal.id)}`}>{proposal.name}</Link>
            <span className="sub">
              {proposal.origin==='AI'?'AI':'Cán bộ'} · {proposal.responsibleDepartment?.name??'Chưa xác định phòng'}
              {detailed&&proposal.document&&<> · <span className="ioc-code">{proposal.document.code}</span></>}
              {detailed&&<> · {proposal.submittedAt?`Trình ${relativeTime(proposal.submittedAt)}`:`Tạo ${relativeTime(proposal.createdAt)}`}</>}
            </span>
          </div>
          <div className="side">
            <span className={`mw-state ${tone==='bad'?'bad':tone==='warn'?'warn':''}`}>{proposal.autoApproveAt?autoText(proposal.autoApproveAt):screening?'Chờ rà soát':'Đã trình'}</span>
            <Link className="btn primary sm" to={`/admin/proposals?id=${encodeURIComponent(proposal.id)}`}>{screening?'Rà soát':'Quyết định'}</Link>
          </div>
        </li>;
      })}</ul>:<Empty showIcon={false} title="Không có đề xuất chờ xử lý" description=""/>}
    </>;
  }

  function explanationsPanel(){
    const items=[...data!.explanations].sort((a,b)=>msUntil(a.request.dueAt)-msUntil(b.request.dueAt));
    return <>
      <PanelHead title="Giải trình"/>
      {items.length?<ul className="ioc-list mw-list">{items.map(target=>{
        const left=msUntil(target.request.dueAt);
        return <li key={target.request.id}>
          <span className={`ioc-sev ${left<=DAY?'critical':'warning'}`} aria-hidden="true"/>
          <div className="grow">
            <Link className="title" to={`/admin/targets/${target.id}`}>{target.title}</Link>
            <span className="sub"><span className="ioc-code">{target.code}</span> · Hạn {fmtDateTime(target.request.dueAt)}</span>
            <p className="mw-quote warn">{target.request.message}</p>
          </div>
          <div className="side">
            <span className={`mw-state ${left<=DAY?'bad':'warn'}`}>{left>0?untilText(target.request.dueAt):`Quá hạn ${untilText(target.request.dueAt).replace(/^quá /,'')}`}</span>
            <Link className="btn primary sm" to={`/admin/targets/${target.id}`}>Giải trình</Link>
          </div>
        </li>;
      })}</ul>:<Empty showIcon={false} title="Không có yêu cầu giải trình" description=""/>}
    </>;
  }

  function unassignedPanel(){
    const groups=new Map<string,{id:string;name:string;color:string;items:TargetBrief[]}>();
    for(const target of data!.unassigned){
      const group=groups.get(target.departmentId)??{id:target.departmentId,name:target.departmentName,color:target.departmentColor,items:[]};
      group.items.push(target);
      groups.set(target.departmentId,group);
    }
    const list=[...groups.values()].sort((a,b)=>b.items.length-a.items.length);
    const limit=detailed?200:list.length>1?5:20;
    return <>
      <PanelHead title="Chưa giao người" link={{to:'/admin/targets?assignee=none',label:'Danh mục'}}/>
      {list.length?list.map(group=><div className="mw-group" key={group.id}>
        {list.length>1&&<h4><span className="ioc-dept-dot" style={{'--dept':group.color} as React.CSSProperties} aria-hidden="true"/>{group.name}<span className="count">{group.items.length}</span></h4>}
        <ul className="ioc-list mw-list">{group.items.slice(0,limit).map(target=><li key={target.id}>
          <span className="ioc-sev" aria-hidden="true"/>
          <div className="grow">
            <Link className="title" to={`/admin/targets/${target.id}`}>{target.title}</Link>
            <span className="sub"><span className="ioc-code">{target.code}</span>{target.groupName?` · ${target.groupName}`:''} · Hạn {fmtDate(target.dueDate)}</span>
          </div>
          <div className="side"><Link className="btn secondary sm" to={`/admin/targets/${target.id}`}><UserPlus aria-hidden="true"/>Giao người</Link></div>
        </li>)}</ul>
        {group.items.length>limit&&<Link className="mw-more" to={`/admin/targets?assignee=none&departmentId=${encodeURIComponent(group.id)}`}>
          Xem cả {group.items.length}<ArrowRight aria-hidden="true"/>
        </Link>}
      </div>):<Empty showIcon={false} title="Không có chỉ tiêu chưa giao" description=""/>}
    </>;
  }

  function myTargetsPanel(){
    const items=[...data!.myTargets].sort((a,b)=>(statusOrder[a.status]??9)-(statusOrder[b.status]??9));
    return <>
      <PanelHead title="Chỉ tiêu của tôi" link={{to:'/admin/targets?assignee=me',label:'Danh mục'}}/>
      {items.length?<ul className="ioc-list mw-list">{items.map(target=>{
        const tone=statusTone[target.status]??'neutral';
        const width=Math.max(0,Math.min(100,target.progress));
        return <li key={target.id}>
          <span className={`ioc-sev ${target.status==='OVERDUE'?'critical':target.status==='AT_RISK'?'warning':''}`} aria-hidden="true"/>
          <div className="grow">
            <Link className="title" to={`/admin/targets/${target.id}`}>{target.title}</Link>
            <span className="sub"><span className="ioc-code">{target.code}</span> · {valueLine(target)}
              {detailed&&<> · {target.lastReportedAt?`Báo cáo ${relativeTime(target.lastReportedAt)}`:'Chưa có báo cáo'}{target.valueSource==='COMPUTED'?' · Tự tính':''}</>}</span>
            {target.kind!=='STAT'&&<div className="mw-progress">
              <div className="progress sm" role="progressbar" aria-label={`Tiến độ ${target.code}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)}>
                <i className={tone==='info'||tone==='neutral'?undefined:tone} style={{width:`${width}%`}}/>
              </div>
              <span>{fmtNumber(target.progress)}%</span>
            </div>}
          </div>
          <div className="side"><Badge tone={tone}>{statusMeta[target.status]?.label??target.status}</Badge></div>
        </li>;
      })}</ul>:<Empty showIcon={false} title="Chưa được giao chỉ tiêu" description=""/>}
    </>;
  }

  function myProposalsPanel(){
    return <>
      <PanelHead title="Đề xuất của tôi" link={{to:'/admin/proposals',label:'Trang đề xuất'}}/>
      {data!.myProposals.length?<ul className="ioc-list mw-list">{data!.myProposals.map(proposal=>{
        const meta=proposalStatus[proposal.status]??{label:proposal.status,tone:'neutral' as Tone};
        return <li key={proposal.id}>
          <span className={`ioc-sev ${proposal.status==='REJECTED'?'critical':proposal.status==='SUBMITTED'?'warning':'info'}`} aria-hidden="true"/>
          <div className="grow">
            <Link className="title" to={`/admin/proposals?id=${encodeURIComponent(proposal.id)}`}>{proposal.name}</Link>
            <span className="sub">Tạo {relativeTime(proposal.createdAt)}
              {proposal.createdTarget&&<> · Đã thành chỉ tiêu <Link to={`/admin/targets/${proposal.createdTarget.id}`}>{proposal.createdTarget.code}</Link></>}
            </span>
            {proposal.status==='REJECTED'&&proposal.reviewNote&&<p className="mw-quote bad">{proposal.reviewNote}</p>}
            {detailed&&proposal.status==='SUBMITTED'&&proposal.autoApproveAt&&<span className="sub">{autoText(proposal.autoApproveAt)}</span>}
          </div>
          <div className="side"><Badge tone={meta.tone}>{meta.label}</Badge></div>
        </li>;
      })}</ul>:<Empty showIcon={false} title="Chưa có đề xuất" description="" action={<Link className="btn secondary sm" to="/admin/proposals">Tạo đề xuất</Link>}/>}
    </>;
  }

  const panels:Record<TabKey,()=>React.ReactNode>={
    'bao-cao':needReportPanel,'tra-lai':rejectedPanel,'cho-duyet':reviewPanel,'de-xuat':proposalsPanel,
    'giai-trinh':explanationsPanel,'chua-giao':unassignedPanel,'chi-tieu':myTargetsPanel,'de-xuat-cua-toi':myProposalsPanel,
  };
  const rejectingUpdate=rejecting?pending.get(rejecting.id):undefined;

  return <div className="mw">
    {head(true)}

    {workTotal===0&&<div className="panel mw-clear"><span>Không có việc đang chờ.</span><Link to="/admin">Trung tâm điều hành</Link></div>}

    {active&&<>
      <div className="mw-tabs" role="tablist" aria-label="Nhóm việc" onKeyDown={onTabKey}>
        {tabs.map(tab=><button key={tab.key} type="button" role="tab" id={`mw-tab-${tab.key}`} aria-controls="mw-panel"
          aria-selected={tab.key===active.key} tabIndex={tab.key===active.key?0:-1}
          ref={node=>{tabRefs.current[tab.key]=node}}
          className={`mw-tab${tab.key===active.key?' active':''}${tab.hot?' hot':''}`} onClick={()=>selectTab(tab.key)}>
          {tab.label}<b aria-hidden="true">{tab.count}</b><span className="sr-only">{`: ${tab.count} mục${tab.hot?', có việc gấp':''}`}</span>
        </button>)}
      </div>
      <section className="panel mw-panel" role="tabpanel" id="mw-panel" aria-labelledby={`mw-tab-${active.key}`}>
        {panels[active.key]()}
      </section>
    </>}

    {rejecting&&<Modal title="Trả lại báo cáo" description={`${rejecting.target.code} · ${rejecting.target.title}`} onClose={()=>{if(!busyId)setRejecting(null)}}>
      <form onSubmit={submitReject}>
        {rejectingUpdate&&<div className="info-box"><p>
          {rejectingUpdate.user.fullName} báo cáo{rejectingUpdate.periodKey?` ${periodName(rejectingUpdate.periodKey)}`:''}: <b>{rejectingUpdate.valueText||valueWithUnit(rejectingUpdate.value,rejectingUpdate.target.unit)}</b>
        </p></div>}
        <label>Lý do
          <textarea rows={4} maxLength={2000} required value={reason} onChange={event=>setReason(event.target.value)}/>
        </label>
        {rejectError&&<div className="form-error" role="alert">{rejectError}</div>}
        <div className="modal-actions">
          <button type="button" className="btn secondary" disabled={Boolean(busyId)} onClick={()=>setRejecting(null)}>Huỷ</button>
          <button type="submit" className="btn danger" disabled={Boolean(busyId)||!reason.trim()}>{busyId?'Đang trả lại…':'Trả lại báo cáo'}</button>
        </div>
      </form>
    </Modal>}
  </div>;
}

/** Đầu khung của một nhóm việc: tiêu đề và đường dẫn sang trang đầy đủ. */
function PanelHead({title,link}:{title:string;link?:{to:string;label:string}}){
  return <div className="panel-head">
    <h3>{title}</h3>
    {link&&<Link to={link.to}>{link.label}<ArrowRight aria-hidden="true"/></Link>}
  </div>;
}
