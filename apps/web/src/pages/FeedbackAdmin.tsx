import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  History,
  Inbox,
  LockKeyhole,
  MessageCircleMore,
  MessagesSquare,
  Paperclip,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Star,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, auth, downloadApi } from '../api';
import { toast } from '../components/Toast';
import { Empty, PageHead, Skeleton, SkeletonCards } from '../components/UI';
import type {
  Department,
  Feedback,
  FeedbackAttachment,
  FeedbackCategory,
  FeedbackListResponse,
  FeedbackMessageVisibility,
  FeedbackPriority,
  FeedbackStats,
  FeedbackStatus,
  User,
} from '../types';
import '../styles/feedback-admin.css';

const statuses:Array<{value:FeedbackStatus;label:string}>=[
  {value:'RECEIVED',label:'Đã tiếp nhận'},{value:'ASSIGNED',label:'Đã phân công'},
  {value:'IN_PROGRESS',label:'Đang xử lý'},{value:'WAITING_CITIZEN',label:'Chờ người dân bổ sung'},
  {value:'PENDING_REVIEW',label:'Chờ duyệt kết quả'},{value:'RESOLVED',label:'Đã có kết quả'},
  {value:'CLOSED',label:'Đã đóng'},{value:'REJECTED',label:'Không tiếp nhận'},{value:'REOPENED',label:'Xem xét lại'},
];
const statusLabel=Object.fromEntries(statuses.map(item=>[item.value,item.label])) as Record<FeedbackStatus,string>;
const priorities:Array<{value:FeedbackPriority;label:string}>=[
  {value:'URGENT',label:'Khẩn'},{value:'HIGH',label:'Cao'},{value:'NORMAL',label:'Bình thường'},{value:'LOW',label:'Thấp'},
];
const priorityLabel=Object.fromEntries(priorities.map(item=>[item.value,item.label])) as Record<FeedbackPriority,string>;
const categories:Array<{value:FeedbackCategory;label:string}>=[
  {value:'INFRASTRUCTURE',label:'Hạ tầng, giao thông'},{value:'ENVIRONMENT',label:'Môi trường, vệ sinh'},
  {value:'ADMINISTRATIVE_PROCEDURE',label:'Thủ tục hành chính'},{value:'SECURITY_ORDER',label:'An ninh, trật tự'},
  {value:'SOCIAL_WELFARE',label:'An sinh xã hội'},{value:'CULTURE_EDUCATION',label:'Văn hóa, giáo dục'},
  {value:'OTHER',label:'Nội dung khác'},
];
const categoryLabel=Object.fromEntries(categories.map(item=>[item.value,item.label])) as Record<FeedbackCategory,string>;

const eventLabels:Record<string,string>={
  CREATED:'Tiếp nhận phản ánh',FEEDBACK_ASSIGNED:'Phân công xử lý',FEEDBACK_STARTED:'Bắt đầu xử lý',
  INFORMATION_REQUESTED:'Yêu cầu người dân bổ sung',CITIZEN_MESSAGE_ADDED:'Người dân bổ sung thông tin',
  PUBLIC_MESSAGE_ADDED:'Gửi phản hồi công khai',INTERNAL_NOTE_ADDED:'Thêm ghi chú nội bộ',
  FEEDBACK_SUBMITTED_FOR_REVIEW:'Trình duyệt kết quả',RESOLUTION_APPROVED:'Duyệt kết quả xử lý',
  RESOLUTION_RETURNED:'Trả lại kết quả',FEEDBACK_CLOSED:'Đóng hồ sơ',FEEDBACK_CLOSED_NO_RESPONSE:'Đóng do quá hạn bổ sung',FEEDBACK_REJECTED:'Từ chối tiếp nhận',
  FEEDBACK_REOPENED:'Mở lại hồ sơ',CITIZEN_REOPEN_REQUESTED:'Người dân gửi đề nghị xem xét lại',
  CITIZEN_REOPEN_REQUEST_APPROVED:'Chấp nhận đề nghị xem xét lại',CITIZEN_REOPEN_REQUEST_REJECTED:'Từ chối đề nghị xem xét lại',
  CITIZEN_RATED:'Người dân đánh giá',FEEDBACK_PUBLISHED:'Công khai kết quả',FEEDBACK_UNPUBLISHED:'Gỡ kết quả công khai',
  CONTACT_ATTEMPT_LOGGED:'Ghi nhận lần liên hệ người dân',
};

type ActionKind='triage'|'assign'|'start'|'request'|'contact'|'message'|'submit'|'approve'|'return'|'close'|'closeNoResponse'|'reject'|'reopen'|'rejectReopen'|'publish'|'unpublish';

type Assignee=Pick<User,'id'|'username'|'fullName'|'role'|'departmentId'>;

type PublicationPreview={
  title:string;
  content:string;
  resolutionSummary:string|null;
  messages:Array<{body:string;authorName:string;createdAt:string}>;
};

const actionTitles:Record<ActionKind,string>={
  triage:'Phân loại phản ánh',assign:'Phân công xử lý',start:'Bắt đầu xử lý',request:'Yêu cầu bổ sung thông tin',contact:'Ghi nhận lần liên hệ',message:'Thêm trao đổi',
  submit:'Trình duyệt kết quả',approve:'Duyệt kết quả',return:'Trả lại để hoàn thiện',close:'Đóng hồ sơ',closeNoResponse:'Kết thúc do quá hạn bổ sung',
  reject:'Không tiếp nhận phản ánh',reopen:'Chấp nhận và mở lại hồ sơ',rejectReopen:'Từ chối đề nghị xem xét lại',publish:'Công khai kết quả đã ẩn danh',unpublish:'Gỡ khỏi trang công khai',
};

const emptyFilters={status:'',priority:'',category:'',departmentId:'',assignedToMe:false,reopenRequested:false,waitingCitizenExpired:false,search:''};

const emptyAction={departmentId:'',assignedToId:'',category:'OTHER' as FeedbackCategory,priority:'NORMAL' as FeedbackPriority,dueAt:'',note:'',message:'',visibility:'PUBLIC' as FeedbackMessageVisibility,summary:'',reason:'',confirmAnonymized:false,contactChannel:'PHONE' as 'PHONE'|'EMAIL',contactOutcome:'REACHED' as 'REACHED'|'NO_ANSWER'|'MESSAGE_SENT'|'INVALID_CONTACT'};

function formatDate(value?:string|null){
  return value?new Date(value).toLocaleString('vi-VN',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}):'—';
}

function toLocalDateTimeInput(value:string|Date=new Date()){
  const date=value instanceof Date?value:new Date(value);
  return new Date(date.getTime()+7*60*60_000).toISOString().slice(0,16);
}

function vietnamDateTimeInputToIso(value:string){
  return new Date(`${value}:00+07:00`).toISOString();
}

function getError(reason:unknown,fallback:string){return reason instanceof Error?reason.message:fallback}

function formatFileSize(value?:number){
  if(value==null||!Number.isFinite(value))return '';
  if(value<1024)return `${value} B`;
  if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;
  return `${(value/(1024*1024)).toFixed(1)} MB`;
}

function activeDeadline(item:Feedback){return item.status==='WAITING_CITIZEN'?(item.citizenResponseDueAt||item.dueAt):(item.firstResponseAt?item.dueAt:(item.firstResponseDueAt||item.dueAt))}
function isOverdue(item:Feedback){const deadline=activeDeadline(item);return Boolean(deadline&&new Date(deadline)<new Date()&&!['RESOLVED','CLOSED','REJECTED'].includes(item.status))}
function deadlineLabel(item:Feedback){return item.status==='WAITING_CITIZEN'?'Hạn bổ sung':item.firstResponseAt?'Hạn xử lý':'Hạn phản hồi'}

export default function FeedbackAdmin(){
  const user=auth.user!;
  const isAdmin=user.role==='ADMIN';
  const canReview=['ADMIN','MANAGER'].includes(user.role);
  const [rows,setRows]=useState<Feedback[]>([]);
  const [stats,setStats]=useState<FeedbackStats|null>(null);
  const [departments,setDepartments]=useState<Department[]>([]);
  const [assignees,setAssignees]=useState<Assignee[]>([]);
  const [loading,setLoading]=useState(true);
  const [pageError,setPageError]=useState('');
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const pageSize=20;
  const [filters,setFilters]=useState(emptyFilters);
  const [appliedSearch,setAppliedSearch]=useState('');
  const [detail,setDetail]=useState<Feedback|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [actionKind,setActionKind]=useState<ActionKind|null>(null);
  const [actionForm,setActionForm]=useState(emptyAction);
  const [actionError,setActionError]=useState('');
  const [saving,setSaving]=useState(false);
  const [downloadingAttachmentId,setDownloadingAttachmentId]=useState('');
  const [attachmentError,setAttachmentError]=useState('');
  const [publicationPreview,setPublicationPreview]=useState<PublicationPreview|null>(null);
  const [publicationPreviewLoading,setPublicationPreviewLoading]=useState(false);
  const [publicationPreviewError,setPublicationPreviewError]=useState('');
  const listRequestId=useRef(0);
  const detailRequestId=useRef(0);
  const publicationPreviewRequestId=useRef(0);
  const detailPanelRef=useRef<HTMLElement>(null);
  const detailReturnFocusRef=useRef<HTMLElement|null>(null);

  async function loadReferenceData(){
    try{
      const departmentRows=await api<Department[]>('/departments');
      setDepartments(departmentRows);
    }catch(reason){setPageError(getError(reason,'Không thể tải dữ liệu phân công'))}
  }

  async function load(){
    const requestId=++listRequestId.current;
    setLoading(true);setPageError('');
    const params=new URLSearchParams({page:String(page),pageSize:String(pageSize)});
    if(filters.status)params.set('status',filters.status);
    if(filters.priority)params.set('priority',filters.priority);
    if(filters.category)params.set('category',filters.category);
    if(filters.departmentId)params.set('departmentId',filters.departmentId);
    if(filters.assignedToMe)params.set('assignedToMe','true');
    if(filters.reopenRequested)params.set('reopenRequested','true');
    if(filters.waitingCitizenExpired)params.set('waitingCitizenExpired','true');
    if(appliedSearch)params.set('search',appliedSearch);
    const statsParams=new URLSearchParams();
    if(filters.departmentId)statsParams.set('departmentId',filters.departmentId);
    try{
      const [list,summary]=await Promise.all([
        api<FeedbackListResponse>(`/feedbacks?${params}`),
        api<FeedbackStats>(`/feedbacks/stats${statsParams.size?`?${statsParams}`:''}`),
      ]);
      if(requestId!==listRequestId.current)return;
      setRows(list.items);setTotal(list.total);setStats(summary);
    }catch(reason){if(requestId===listRequestId.current)setPageError(getError(reason,'Không thể tải danh sách phản ánh'))}
    finally{if(requestId===listRequestId.current)setLoading(false)}
  }

  useEffect(()=>{void loadReferenceData()},[]);
  useEffect(()=>{void load()},[page,filters.status,filters.priority,filters.category,filters.departmentId,filters.assignedToMe,filters.reopenRequested,filters.waitingCitizenExpired,appliedSearch]);

  async function openDetail(id:string){
    const requestId=++detailRequestId.current;
    detailReturnFocusRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
    clearPublicationPreview();
    setDetailLoading(true);setActionKind(null);setActionError('');setAttachmentError('');
    try{
      const result=await api<Feedback>(`/feedbacks/${id}`);
      if(requestId===detailRequestId.current)setDetail(result);
    }
    catch(reason){if(requestId===detailRequestId.current)setPageError(getError(reason,'Không thể mở hồ sơ'))}
    finally{if(requestId===detailRequestId.current)setDetailLoading(false)}
  }

  function closeDetail(){
    if(saving)return;
    detailRequestId.current+=1;
    clearPublicationPreview();
    setDetailLoading(false);setDetail(null);setActionKind(null);setActionError('');setAttachmentError('');
  }

  const detailOpen=Boolean(detail||detailLoading);

  useEffect(()=>{
    if(!detailOpen)return;
    const returnFocus=detailReturnFocusRef.current;
    const frame=window.requestAnimationFrame(()=>{
      const closeButton=detailPanelRef.current?.querySelector<HTMLElement>('header button:not([disabled])');
      (closeButton||detailPanelRef.current)?.focus();
    });
    document.body.classList.add('feedback-modal-open');
    return()=>{
      window.cancelAnimationFrame(frame);
      document.body.classList.remove('feedback-modal-open');
      returnFocus?.focus();
    };
  },[detailOpen]);

  useEffect(()=>{
    if(!detail&&!detailLoading)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!saving)closeDetail()};
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[detail,detailLoading,saving]);

  function keepDetailFocus(event:ReactKeyboardEvent<HTMLElement>){
    if(event.key!=='Tab')return;
    const items=[...(detailPanelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')||[])];
    if(!items.length){event.preventDefault();detailPanelRef.current?.focus();return}
    const first=items[0];const last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }

  function canHandle(item:Feedback){
    if(user.role==='ADMIN')return true;
    if(user.role==='MANAGER')return item.departmentId===user.departmentId;
    return user.role==='STAFF'&&item.departmentId===user.departmentId&&item.assignedToId===user.id;
  }

  function clearPublicationPreview(){
    publicationPreviewRequestId.current+=1;
    setPublicationPreview(null);
    setPublicationPreviewLoading(false);
    setPublicationPreviewError('');
  }

  function closeAction(){
    clearPublicationPreview();
    setActionKind(null);
    setActionError('');
  }

  async function loadPublicationPreview(feedbackId:string){
    const requestId=++publicationPreviewRequestId.current;
    setPublicationPreview(null);
    setPublicationPreviewError('');
    setPublicationPreviewLoading(true);
    setActionForm(current=>({...current,confirmAnonymized:false}));
    try{
      const preview=await api<PublicationPreview>(`/feedbacks/${feedbackId}/publication-preview`);
      if(requestId===publicationPreviewRequestId.current)setPublicationPreview(preview);
    }catch(reason){
      if(requestId===publicationPreviewRequestId.current)setPublicationPreviewError(getError(reason,'Không thể tạo bản xem trước đã ẩn danh'));
    }finally{
      if(requestId===publicationPreviewRequestId.current)setPublicationPreviewLoading(false);
    }
  }

  function startAction(kind:ActionKind){
    if(!detail)return;
    clearPublicationPreview();
    setActionKind(kind);setActionError('');
    setActionForm({
      ...emptyAction,
      departmentId:detail.departmentId||user.departmentId||'',
      assignedToId:detail.assignedToId||'',
      category:detail.category,
      priority:detail.priority,
      dueAt:detail.dueAt?toLocalDateTimeInput(detail.dueAt):'',
      visibility:kind==='message'&&!['IN_PROGRESS','WAITING_CITIZEN','REOPENED'].includes(detail.status)?'INTERNAL':'PUBLIC',
    });
    if(kind==='publish')void loadPublicationPreview(detail.id);
  }

  useEffect(()=>{
    if(actionKind!=='assign'||!actionForm.departmentId||!canReview){setAssignees([]);return}
    let active=true;
    api<Assignee[]>(`/feedbacks/assignees?departmentId=${encodeURIComponent(actionForm.departmentId)}`)
      .then(result=>{if(active)setAssignees(result)})
      .catch(reason=>{if(active)setActionError(getError(reason,'Không thể tải danh sách cán bộ xử lý'))});
    return()=>{active=false};
  },[actionKind,actionForm.departmentId,canReview]);

  async function submitAction(event:FormEvent){
    event.preventDefault();if(!detail||!actionKind)return;
    if(actionKind==='publish'&&(!publicationPreview||publicationPreviewLoading||publicationPreviewError)){
      setActionError('Cần tải thành công bản xem trước đã ẩn danh trước khi công khai.');
      return;
    }
    setSaving(true);setActionError('');
    const expectedVersion=detail.version;
    let path='';let body:Record<string,unknown>={expectedVersion};
    switch(actionKind){
      case'triage':path='triage';body={...body,category:actionForm.category,priority:actionForm.priority,note:actionForm.note};break;
      case'assign':{const originalDueAt=detail.dueAt?toLocalDateTimeInput(detail.dueAt):'';path='assign';body={...body,departmentId:actionForm.departmentId,assignedToId:actionForm.assignedToId||undefined,priority:actionForm.priority,dueAt:actionForm.dueAt&&actionForm.dueAt!==originalDueAt?vietnamDateTimeInputToIso(actionForm.dueAt):undefined,note:actionForm.note};break;}
      case'start':path='start';break;
      case'request':path='request-information';body={...body,message:actionForm.message};break;
      case'contact':path='contact-attempt';body={...body,channel:actionForm.contactChannel,outcome:actionForm.contactOutcome,note:actionForm.note};break;
      case'message':path='messages';body={...body,body:actionForm.message,visibility:actionForm.visibility};break;
      case'submit':path='submit-resolution';body={...body,summary:actionForm.summary};break;
      case'approve':path='review';body={...body,decision:'APPROVE',note:actionForm.note||undefined};break;
      case'return':path='review';body={...body,decision:'RETURN',note:actionForm.note};break;
      case'close':path='close';body={...body,note:actionForm.note||undefined};break;
      case'closeNoResponse':path='close-no-response';body={...body,note:actionForm.note||undefined};break;
      case'reject':path='reject';body={...body,reason:actionForm.reason};break;
      case'reopen':path='reopen';body={...body,reason:actionForm.reason};break;
      case'rejectReopen':path='reopen-request/reject';body={...body,reason:actionForm.reason};break;
      case'publish':path='publish';body={...body,publish:true,confirmAnonymized:actionForm.confirmAnonymized};break;
      case'unpublish':path='publish';body={...body,publish:false};break;
    }
    try{
      await api(`/feedbacks/${detail.id}/${path}`,{method:'POST',body:JSON.stringify(body)});
      toast.ok(`${actionTitles[actionKind]} thành công.`);closeAction();
      await Promise.all([openDetail(detail.id),load()]);
    }catch(reason){
      const message=getError(reason,'Không thể cập nhật hồ sơ');
      setActionError(message);
      toast.error(`${actionTitles[actionKind]} không thành công.`,message);
    }
    finally{setSaving(false)}
  }

  function applySearch(event:FormEvent){event.preventDefault();setPage(1);setAppliedSearch(filters.search.trim())}

  function clearFilters(){
    setPage(1);
    setFilters(emptyFilters);
    setAppliedSearch('');
  }

  async function downloadAttachment(attachment:FeedbackAttachment){
    if(!detail)return;
    setDownloadingAttachmentId(attachment.id);setAttachmentError('');
    try{
      const blob=await downloadApi(`/feedbacks/${detail.id}/attachments/${attachment.id}/download`);
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;
      link.download=attachment.originalName||'minh-chung';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
      toast.ok('Đã tải file minh chứng.',attachment.originalName||undefined);
    }catch(reason){
      const message=getError(reason,'Không thể tải file minh chứng');
      setAttachmentError(message);
      toast.error('Không tải được file minh chứng.',message);
    }
    finally{setDownloadingAttachmentId('')}
  }

  const eligibleUsers=useMemo(()=>assignees.filter(item=>item.departmentId===actionForm.departmentId),[actionForm.departmentId,assignees]);
  const detailAttachments=detail?.attachments||[];

  const pages=Math.max(1,Math.ceil(total/pageSize));
  const hasFilters=Boolean(filters.status||filters.priority||filters.category||filters.departmentId||filters.assignedToMe||filters.reopenRequested||filters.waitingCitizenExpired||filters.search||appliedSearch);

  return <>
    <PageHead eyebrow="QUẢN LÝ PHẢN ÁNH" title="Tiếp nhận & xử lý phản ánh" description={isAdmin?'Theo dõi toàn bộ vòng đời phản ánh, phân công đúng đơn vị và kiểm soát thời hạn xử lý.':`Dữ liệu được giới hạn trong ${user.department?.name||'đơn vị của bạn'} theo quyền được giao.`} actions={<button type="button" className="btn secondary" disabled={loading} onClick={()=>void load()}><RefreshCw className={loading?'spin':undefined}/>Làm mới</button>}/>

    {pageError&&<div className="form-error fb-page-error" role="alert"><AlertCircle/><span>{pageError}</span><button type="button" className="btn secondary sm" onClick={()=>void load()}>Thử lại</button></div>}

    {/* ---- Dải thống kê: sáu chỉ số điều hành, hai chỉ số cần hành động được nhấn mạnh ---- */}
    {loading&&!stats
      ?<div className="fb-stats" style={{marginBottom:'var(--sp-5)'}}><SkeletonCards count={6}/></div>
      :<div className="stat-grid fb-stats">
        <article className="stat-card"><div className="stat-icon brand" aria-hidden="true"><Inbox/></div><span>Tổng hồ sơ</span><strong>{stats?.total??'—'}</strong><p>{stats?.received??0} mới tiếp nhận</p></article>
        <article className="stat-card"><div className="stat-icon accent" aria-hidden="true"><Clock3/></div><span>Đang xử lý</span><strong>{stats?.inProgress??'—'}</strong><p>{stats?.dueSoon??0} sắp đến hạn · {stats?.awaitingCitizen??0} chờ dân</p></article>
        <article className="stat-card"><div className="stat-icon ai" aria-hidden="true"><ShieldCheck/></div><span>Chờ duyệt</span><strong>{stats?.pendingReview??'—'}</strong><p>Cần kiểm tra kết quả</p></article>
        <article className={`stat-card${stats?.reopenRequested?' is-alert':''}`}><div className="stat-icon warn" aria-hidden="true"><RotateCcw/></div><span>Xem xét lại</span><strong>{stats?.reopenRequested??'—'}</strong><p>Đề nghị của người dân</p></article>
        <article className={`stat-card${stats?.overdue?' is-alert':''}`}><div className="stat-icon bad" aria-hidden="true"><AlertCircle/></div><span>Quá hạn xử lý</span><strong>{stats?.overdue??'—'}</strong><p>{stats?.waitingCitizenExpired??0} hồ sơ quá hạn bổ sung được theo dõi riêng</p></article>
        <article className="stat-card"><div className="stat-icon ok" aria-hidden="true"><Star/></div><span>Hài lòng</span><strong>{stats?.averageRating?`${stats.averageRating.toFixed(1)}/5`:'—'}</strong><p>{stats?.ratingCount??0} lượt đánh giá</p></article>
      </div>}

    {/* ---- Bộ lọc: tìm kiếm · thu hẹp theo thuộc tính · phạm vi công việc ---- */}
    <section className="panel fb-filters" aria-label="Bộ lọc danh sách phản ánh">
      <div className="toolbar">
        <form className="fb-search" onSubmit={applySearch}>
          <div className="search"><Search/><input aria-label="Tìm phản ánh" value={filters.search} onChange={event=>setFilters({...filters,search:event.target.value})} placeholder={user.role==='VIEWER'?'Tìm theo mã phản ánh':'Tìm theo mã, tiêu đề, nội dung'}/></div>
          <button type="submit" className="btn secondary">Tìm</button>
        </form>
        <div className="spacer"/>
        {hasFilters&&<button type="button" className="btn ghost sm" onClick={clearFilters}><X/>Xóa bộ lọc</button>}
      </div>

      <div className="fb-filter-block">
        <span className="fb-filter-label"><Filter/>Thu hẹp danh sách</span>
        <div className="toolbar">
          <select aria-label="Lọc theo trạng thái" value={filters.status} onChange={event=>{setPage(1);setFilters({...filters,status:event.target.value})}}><option value="">Tất cả trạng thái</option>{statuses.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select aria-label="Lọc theo mức ưu tiên" value={filters.priority} onChange={event=>{setPage(1);setFilters({...filters,priority:event.target.value})}}><option value="">Mọi mức ưu tiên</option>{priorities.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select aria-label="Lọc theo nhóm phản ánh" value={filters.category} onChange={event=>{setPage(1);setFilters({...filters,category:event.target.value})}}><option value="">Mọi nhóm vấn đề</option>{categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
          {isAdmin&&<select aria-label="Lọc theo đơn vị" value={filters.departmentId} onChange={event=>{setPage(1);setFilters({...filters,departmentId:event.target.value})}}><option value="">Tất cả đơn vị</option>{departments.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        </div>
      </div>

      {(user.role!=='VIEWER'||canReview)&&<div className="fb-filter-block">
        <span className="fb-filter-label"><UserCheck/>Phạm vi công việc</span>
        <div className="fb-toggles">
          {user.role!=='VIEWER'&&<label className="fb-toggle"><input type="checkbox" checked={filters.assignedToMe} onChange={event=>{setPage(1);setFilters({...filters,assignedToMe:event.target.checked})}}/>Việc giao cho tôi</label>}
          {canReview&&<label className="fb-toggle"><input type="checkbox" checked={filters.reopenRequested} onChange={event=>{setPage(1);setFilters({...filters,reopenRequested:event.target.checked})}}/>Chờ xem xét lại</label>}
          {canReview&&<label className="fb-toggle"><input type="checkbox" checked={filters.waitingCitizenExpired} onChange={event=>{setPage(1);setFilters({...filters,waitingCitizenExpired:event.target.checked})}}/>Quá hạn bổ sung</label>}
        </div>
      </div>}
    </section>

    {/* ---- Danh sách phản ánh ---- */}
    <section className="panel flush fb-panel">
      <div className="panel-head">
        <div><h3>Danh sách phản ánh</h3><p>Chọn một hồ sơ để xem chi tiết và xử lý</p></div>
        <span className="fb-panel-count"><b>{total}</b> hồ sơ phù hợp</span>
      </div>

      {loading
        ?<div className="fb-list" role="status" aria-label="Đang tải danh sách phản ánh">{Array.from({length:6},(_,index)=><Skeleton key={index} className="fb-row-skeleton"/>)}</div>
        :rows.length
          ?<div className="fb-list">{rows.map(item=>{
            const overdue=isOverdue(item);
            const reopen=Boolean(item.reopenRequestedAt);
            return <button type="button" key={item.id} className={`fb-row${overdue?' is-overdue':''}${reopen?' is-reopen':''}`} onClick={()=>void openDetail(item.id)}>
              <div className="fb-row-main">
                <div className="fb-row-flags">
                  <span className="code">{item.code}</span>
                  <span className={`feedback-priority ${item.priority.toLowerCase()}`} title={`Mức ưu tiên: ${priorityLabel[item.priority]}`}>{priorityLabel[item.priority]}</span>
                  {overdue&&<span className="badge fb-overdue"><AlertCircle/>{item.status==='WAITING_CITIZEN'?'Quá hạn bổ sung':'Quá hạn xử lý'}</span>}
                  {reopen&&<span className="badge warn"><RotateCcw/>Chờ duyệt xem xét lại</span>}
                </div>
                <strong className="fb-row-title">{item.title}</strong>
                <small className="fb-row-meta">{categoryLabel[item.category]} · Tiếp nhận {formatDate(item.createdAt)}</small>
              </div>
              <div className="fb-row-cell fb-row-unit">
                <small>Đơn vị xử lý</small>
                <b>{item.department?.name||'Chưa phân công'}</b>
                <span>{item.assignedTo?.fullName||'Chưa giao cán bộ'}</span>
              </div>
              <div className="fb-row-cell fb-row-status">
                <span className={`feedback-status ${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span>
                <small className={`fb-row-deadline${overdue?' is-late':''}`}>{deadlineLabel(item)}: {formatDate(activeDeadline(item))}</small>
              </div>
              <ArrowRight className="fb-row-go" aria-hidden="true"/>
            </button>;
          })}</div>
          :<Empty title="Không có phản ánh phù hợp" description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." action={hasFilters?<button type="button" className="btn secondary" onClick={clearFilters}><X/>Xóa bộ lọc</button>:undefined}/>}

      {pages>1&&<div className="pagination">
        <span>Trang {page}/{pages}</span>
        <div className="pagination-controls">
          <button type="button" className="btn secondary sm" disabled={page===1} onClick={()=>setPage(value=>value-1)}><ArrowLeft/>Trang trước</button>
          <button type="button" className="btn secondary sm" disabled={page===pages} onClick={()=>setPage(value=>value+1)}>Trang sau<ArrowRight/></button>
        </div>
      </div>}
    </section>

    {/* ---- Ngăn kéo chi tiết hồ sơ ---- */}
    {(detail||detailLoading)&&<div className="fb-drawer-backdrop" onMouseDown={closeDetail}>
      <aside ref={detailPanelRef} className="fb-drawer" role="dialog" aria-modal="true" aria-labelledby={detail?'feedback-detail-heading':undefined} aria-label={detail?undefined:'Đang tải hồ sơ phản ánh'} tabIndex={-1} onKeyDown={keepDetailFocus} onMouseDown={event=>event.stopPropagation()}>
        {detailLoading&&!detail
          ?<div className="fb-drawer-loading" role="status" aria-label="Đang tải hồ sơ phản ánh">
            <Skeleton className="skeleton-title"/>
            <Skeleton style={{height:96}}/>
            <Skeleton style={{height:180}}/>
            <Skeleton style={{height:180}}/>
          </div>
          :detail&&<>
          <header>
            <div>
              <div className="fb-drawer-eyebrow">
                <span className="code">{detail.code}</span>
                <span className={`feedback-status ${detail.status.toLowerCase()}`}>{statusLabel[detail.status]}</span>
              </div>
              <h2 id="feedback-detail-heading">{detail.title}</h2>
            </div>
            <button type="button" className="btn secondary icon" disabled={saving} aria-label="Đóng hồ sơ" onClick={closeDetail}><X/></button>
          </header>

          <div className="fb-drawer-body">
            <div className="fb-badges">
              <span className={`feedback-priority ${detail.priority.toLowerCase()}`} title={`Mức ưu tiên: ${priorityLabel[detail.priority]}`}>{priorityLabel[detail.priority]}</span>
              <span className="badge neutral">{categoryLabel[detail.category]}</span>
              {isOverdue(detail)&&<span className="badge fb-overdue"><AlertCircle/>{detail.status==='WAITING_CITIZEN'?'Quá hạn bổ sung':'Quá hạn xử lý'}</span>}
              {detail.isPublic&&<span className="badge accent"><Eye/>Đang công khai</span>}
            </div>

            <div className="fb-facts">
              <div className="fb-fact">
                <small>Người gửi</small>
                {user.role==='VIEWER'
                  ?<><b>Thông tin đã ẩn</b><span>Chỉ cán bộ xử lý được xem dữ liệu liên hệ</span></>
                  :<><b>{detail.submitterName}</b><span>{detail.submitterPhone}</span>{detail.submitterEmail&&<span>{detail.submitterEmail}</span>}<span>Ưu tiên liên hệ thủ công: {detail.preferredContact==='EMAIL'?'Email':'Điện thoại'}</span></>}
              </div>
              <div className="fb-fact">
                <small>Đơn vị xử lý</small>
                <b>{detail.department?.name||'Chưa phân công'}</b>
                <span>{detail.assignedTo?.fullName||'Chưa giao cán bộ'}</span>
              </div>
              <div className={`fb-fact${isOverdue(detail)?' is-late':''}`}>
                <small>{detail.status==='WAITING_CITIZEN'?'Hạn người dân bổ sung':detail.firstResponseAt?'Hạn xử lý':'Hạn phản hồi đầu tiên'}</small>
                <b className={isOverdue(detail)?'danger-text':''}>{formatDate(activeDeadline(detail))}</b>
                <span>Tiếp nhận {formatDate(detail.createdAt)}</span>
              </div>
            </div>

            <section className="panel fb-section">
              <h3><FileText aria-hidden="true"/>Nội dung phản ánh</h3>
              <p className="fb-text">{detail.content}</p>
              {detail.address&&<p className="fb-address"><b>Địa điểm:</b> {detail.address}</p>}
            </section>

            {detail.resolutionSummary&&<section className="alert ok fb-callout"><CheckCircle2 aria-hidden="true"/><div><h3>Kết quả đề xuất</h3><p>{detail.resolutionSummary}</p></div></section>}
            {detail.rejectionReason&&<section className="alert bad fb-callout"><XCircle aria-hidden="true"/><div><h3>Lý do không tiếp nhận</h3><p>{detail.rejectionReason}</p></div></section>}
            {detail.reopenRequestedAt&&<section className="alert warn fb-callout"><RotateCcw aria-hidden="true"/><div><h3>Người dân đề nghị xem xét lại</h3><p>{detail.reopenRequestReason}</p><small>Gửi lúc {formatDate(detail.reopenRequestedAt)} · Lần {detail.reopenRequestCount}/3</small></div></section>}

            <section className="panel fb-section">
              <h3><MessagesSquare aria-hidden="true"/>Trao đổi & ghi chú</h3>
              {detail.messages?.length
                ?<div className="fb-msg-list">{detail.messages.map(message=>{
                  const internal=message.visibility==='INTERNAL';
                  return <article key={message.id} className={`fb-msg ${internal?'is-internal':'is-public'}`}>
                    <div className="fb-msg-head">
                      <b>{message.authorName}</b>
                      <span className={`fb-msg-scope ${internal?'internal':'public'}`}>{internal?<><LockKeyhole aria-hidden="true"/>Nội bộ</>:<><Eye aria-hidden="true"/>Người dân thấy</>}</span>
                      <time>{formatDate(message.createdAt)}</time>
                    </div>
                    <p>{message.body}</p>
                  </article>;
                })}</div>
                :<p className="fb-muted">Chưa có trao đổi nào.</p>}
            </section>

            <section className="panel fb-section">
              <h3><Paperclip aria-hidden="true"/>File ảnh &amp; minh chứng</h3>
              {attachmentError&&<div className="form-error" role="alert"><AlertCircle/>{attachmentError}</div>}
              {detailAttachments.length
                ?<div className="fb-files">{detailAttachments.map(attachment=><div key={attachment.id} className="fb-file">
                  <div>
                    <b>{attachment.originalName||'File minh chứng'}</b>
                    <span>{[attachment.mimeType,formatFileSize(attachment.size)].filter(Boolean).join(' · ')}</span>
                    {attachment.createdAt&&<time>{formatDate(attachment.createdAt)}</time>}
                  </div>
                  <button className="btn secondary sm" type="button" disabled={downloadingAttachmentId===attachment.id} onClick={()=>void downloadAttachment(attachment)}>{downloadingAttachmentId===attachment.id?<RefreshCw className="spin"/>:<Download/>}{downloadingAttachmentId===attachment.id?'Đang tải':'Tải file'}</button>
                </div>)}</div>
                :<p className="fb-muted">Phản ánh này không có file đính kèm.</p>}
            </section>

            <section className="panel fb-section">
              <h3><History aria-hidden="true"/>Lịch sử xử lý</h3>
              {detail.events?.length
                ?<ol className="fb-timeline">{detail.events.map(event=><li key={event.id}>
                  <i aria-hidden="true"/>
                  <div className="fb-timeline-body">
                    <b>{eventLabels[event.action]||event.action}</b>
                    <span>{event.actorName||'Hệ thống'} · {formatDate(event.createdAt)}</span>
                    {event.note&&<p>{event.note}</p>}
                  </div>
                </li>)}</ol>
                :<p className="fb-muted">Chưa ghi nhận bước xử lý nào.</p>}
            </section>

            {detail.rating&&<div className="fb-rating"><Star aria-hidden="true"/><span><b>{detail.rating}/5 điểm</b>{detail.ratingComment&&<small>{detail.ratingComment}</small>}</span></div>}
          </div>

          <footer className="fb-drawer-foot">
            {canReview&&['RECEIVED','ASSIGNED'].includes(detail.status)&&<button type="button" className="btn secondary sm" onClick={()=>startAction('triage')}><Filter/>Phân loại</button>}
            {canReview&&['RECEIVED','ASSIGNED','REOPENED','IN_PROGRESS','WAITING_CITIZEN'].includes(detail.status)&&<button type="button" className="btn secondary sm" onClick={()=>startAction('assign')}><UserCheck/>Phân công</button>}
            {canHandle(detail)&&['ASSIGNED','REOPENED'].includes(detail.status)&&<button type="button" className="btn secondary sm" onClick={()=>startAction('start')}><Clock3/>Bắt đầu xử lý</button>}
            {canHandle(detail)&&['IN_PROGRESS','REOPENED'].includes(detail.status)&&<button type="button" className="btn secondary sm" onClick={()=>startAction('request')}><MessageCircleMore/>Yêu cầu bổ sung</button>}
            {canHandle(detail)&&!['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&<button type="button" className="btn secondary sm" onClick={()=>startAction('contact')}><MessageCircleMore/>Ghi nhận liên hệ</button>}
            {canHandle(detail)&&!['CLOSED','REJECTED'].includes(detail.status)&&<button type="button" className="btn secondary sm" onClick={()=>startAction('message')}><Send/>Thêm trao đổi</button>}
            {canHandle(detail)&&['IN_PROGRESS','REOPENED'].includes(detail.status)&&<button type="button" className="btn primary sm" onClick={()=>startAction('submit')}><ShieldCheck/>Trình duyệt</button>}
            {canReview&&detail.status==='PENDING_REVIEW'&&detail.submittedForReviewBy!==user.id&&<><button type="button" className="btn danger-soft sm" onClick={()=>startAction('return')}><RotateCcw/>Trả lại</button><button type="button" className="btn primary sm" onClick={()=>startAction('approve')}><Check/>Duyệt kết quả</button></>}
            {canReview&&detail.status==='PENDING_REVIEW'&&detail.submittedForReviewBy===user.id&&<span className="fb-readonly"><LockKeyhole/>Bạn đã trình hồ sơ này; cần người khác duyệt kết quả.</span>}
            {canReview&&detail.status==='RESOLVED'&&<button type="button" className="btn secondary sm" onClick={()=>startAction('close')}><CheckCircle2/>Đóng hồ sơ</button>}
            {canReview&&detail.status==='WAITING_CITIZEN'&&detail.citizenResponseDueAt&&new Date(detail.citizenResponseDueAt)<=new Date()&&<button type="button" className="btn danger-soft sm" onClick={()=>startAction('closeNoResponse')}><XCircle/>Kết thúc do quá hạn bổ sung</button>}
            {isAdmin&&['RECEIVED','ASSIGNED'].includes(detail.status)&&<button type="button" className="btn danger-soft sm" onClick={()=>startAction('reject')}><XCircle/>Không tiếp nhận</button>}
            {canReview&&['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&detail.reopenRequestedAt&&<><button type="button" className="btn danger-soft sm" onClick={()=>startAction('rejectReopen')}><XCircle/>Từ chối đề nghị</button><button type="button" className="btn primary sm" onClick={()=>startAction('reopen')}><RotateCcw/>Chấp nhận mở lại</button></>}
            {canReview&&['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&!detail.reopenRequestedAt&&<button type="button" className="btn secondary sm" onClick={()=>startAction('reopen')}><RotateCcw/>{detail.status==='REJECTED'?'Khôi phục hồ sơ':'Mở lại nội bộ'}</button>}
            {isAdmin&&['RESOLVED','CLOSED'].includes(detail.status)&&(detail.isPublic||!detail.reopenRequestedAt)&&<button type="button" className="btn secondary sm" onClick={()=>startAction(detail.isPublic?'unpublish':'publish')}><Eye/>{detail.isPublic?'Gỡ công khai':'Công khai'}</button>}
            {!canHandle(detail)&&!canReview&&<span className="fb-readonly"><Eye/>Bạn đang xem hồ sơ ở chế độ chỉ đọc.</span>}
          </footer>

          {actionKind&&<form className="fb-sheet" onSubmit={submitAction}>
            <div className="fb-sheet-head">
              <div><span className="eyebrow">THAO TÁC HỒ SƠ</span><h3>{actionTitles[actionKind]}</h3></div>
              <button type="button" className="btn secondary icon" disabled={saving} aria-label="Đóng thao tác" onClick={closeAction}><X/></button>
            </div>
            {actionKind==='triage'&&<><label>Nhóm vấn đề<select value={actionForm.category} onChange={event=>setActionForm({...actionForm,category:event.target.value as FeedbackCategory})}>{categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Mức ưu tiên<select value={actionForm.priority} onChange={event=>setActionForm({...actionForm,priority:event.target.value as FeedbackPriority})}>{priorities.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="full">Căn cứ phân loại<textarea required minLength={3} maxLength={1000} rows={3} value={actionForm.note} onChange={event=>setActionForm({...actionForm,note:event.target.value})}/></label></>}
            {actionKind==='assign'&&<>
              <label>Đơn vị xử lý<select required value={actionForm.departmentId} disabled={!isAdmin} onChange={event=>setActionForm({...actionForm,departmentId:event.target.value,assignedToId:''})}><option value="">Chọn đơn vị</option>{departments.filter(item=>item.isActive).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Cán bộ phụ trách<select value={actionForm.assignedToId} onChange={event=>setActionForm({...actionForm,assignedToId:event.target.value})}><option value="">Chưa giao cá nhân</option>{eligibleUsers.map(item=><option key={item.id} value={item.id}>{item.fullName} ({item.role==='MANAGER'?'Lãnh đạo':'Cán bộ'})</option>)}</select></label>
              <label>Mức ưu tiên<select value={actionForm.priority} onChange={event=>setActionForm({...actionForm,priority:event.target.value as FeedbackPriority})}>{priorities.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label>Hạn xử lý<input type="datetime-local" min={toLocalDateTimeInput()} value={actionForm.dueAt} onChange={event=>setActionForm({...actionForm,dueAt:event.target.value})}/></label>
              <label className="full">Lý do phân công<textarea required minLength={3} maxLength={1000} rows={3} value={actionForm.note} onChange={event=>setActionForm({...actionForm,note:event.target.value})}/></label>
            </>}
            {actionKind==='request'&&<label className="full">Nội dung cần bổ sung<textarea required minLength={5} maxLength={3000} rows={4} value={actionForm.message} onChange={event=>setActionForm({...actionForm,message:event.target.value})}/><small>Nội dung này sẽ hiển thị khi người dân tra cứu.</small></label>}
            {actionKind==='contact'&&<><label>Kênh liên hệ<select value={actionForm.contactChannel} onChange={event=>setActionForm({...actionForm,contactChannel:event.target.value as 'PHONE'|'EMAIL'})}><option value="PHONE">Điện thoại</option><option value="EMAIL">Email</option></select></label><label>Kết quả<select value={actionForm.contactOutcome} onChange={event=>setActionForm({...actionForm,contactOutcome:event.target.value as typeof actionForm.contactOutcome})}><option value="REACHED">Đã liên hệ được</option><option value="MESSAGE_SENT">Đã gửi tin/ thư</option><option value="NO_ANSWER">Không nghe máy/ chưa phản hồi</option><option value="INVALID_CONTACT">Thông tin liên hệ không hợp lệ</option></select></label><label className="full">Ghi chú liên hệ<textarea required minLength={3} maxLength={1000} rows={3} value={actionForm.note} onChange={event=>setActionForm({...actionForm,note:event.target.value})}/></label></>}
            {actionKind==='message'&&<><label>Phạm vi hiển thị<select value={actionForm.visibility} onChange={event=>setActionForm({...actionForm,visibility:event.target.value as FeedbackMessageVisibility})}>{['IN_PROGRESS','WAITING_CITIZEN','REOPENED'].includes(detail.status)&&<option value="PUBLIC">Phản hồi cho người dân</option>}<option value="INTERNAL">Ghi chú nội bộ</option></select><small>{actionForm.visibility==='INTERNAL'?'Chỉ cán bộ trong hệ thống đọc được nội dung này.':'Người dân sẽ đọc được nội dung này khi tra cứu hồ sơ.'}</small></label><label className="full">Nội dung<textarea required minLength={2} maxLength={3000} rows={4} value={actionForm.message} onChange={event=>setActionForm({...actionForm,message:event.target.value})}/></label></>}
            {actionKind==='submit'&&<label className="full">Kết quả xử lý đề xuất<textarea required minLength={10} maxLength={5000} rows={6} value={actionForm.summary} onChange={event=>setActionForm({...actionForm,summary:event.target.value})}/><small>Sau khi duyệt, nội dung này sẽ được gửi cho người dân.</small></label>}
            {['approve','close','closeNoResponse'].includes(actionKind)&&<label className="full">Ghi chú (không bắt buộc)<textarea maxLength={actionKind==='approve'?2000:1000} rows={3} value={actionForm.note} onChange={event=>setActionForm({...actionForm,note:event.target.value})}/></label>}
            {actionKind==='return'&&<label className="full">Lý do trả lại<textarea required minLength={3} maxLength={2000} rows={4} value={actionForm.note} onChange={event=>setActionForm({...actionForm,note:event.target.value})}/></label>}
            {['reject','reopen','rejectReopen'].includes(actionKind)&&<label className="full">{actionKind==='reject'?'Lý do không tiếp nhận':actionKind==='rejectReopen'?'Lý do chưa chấp nhận đề nghị':'Căn cứ mở lại hồ sơ'}<textarea required minLength={10} maxLength={2000} rows={4} value={actionForm.reason} onChange={event=>setActionForm({...actionForm,reason:event.target.value})}/></label>}
            {actionKind==='publish'&&<>
              <div className="notice full"><ShieldCheck/>Đây là chính xác nội dung đã được hệ thống tự động ẩn danh và sẽ hiển thị cho người dân. Bạn không cần nhập lại tiêu đề hoặc nội dung.</div>
              {publicationPreviewLoading&&<div className="notice full" role="status"><RefreshCw className="spin"/>Đang tạo bản xem trước đã ẩn danh...</div>}
              {publicationPreviewError&&<div className="form-error full" role="alert"><AlertCircle/><span>{publicationPreviewError}</span><button className="btn secondary sm" type="button" onClick={()=>void loadPublicationPreview(detail.id)}>Tải lại</button></div>}
              {publicationPreview&&<section className="fb-preview full" aria-label="Xem trước nội dung công khai">
                <h3>Bản xem trước sẽ công khai</h3>
                <small>Tiêu đề phản ánh</small><p><b>{publicationPreview.title}</b></p>
                <small>Nội dung phản ánh</small><p>{publicationPreview.content}</p>
                <small>Kết quả xử lý</small><p>{publicationPreview.resolutionSummary||'Không có nội dung kết quả xử lý.'}</p>
                <small>Trao đổi đã đánh dấu người dân thấy</small>
                {publicationPreview.messages.length?<div className="fb-msg-list">{publicationPreview.messages.map((message,index)=><article key={`${message.createdAt}:${index}`} className="fb-msg is-public"><div className="fb-msg-head"><b>{message.authorName}</b><time>{formatDate(message.createdAt)}</time></div><p>{message.body}</p></article>)}</div>:<p className="fb-muted">Không có trao đổi công khai bổ sung.</p>}
              </section>}
              <label className="fb-confirm full"><input required disabled={!publicationPreview||publicationPreviewLoading||Boolean(publicationPreviewError)} type="checkbox" checked={actionForm.confirmAnonymized} onChange={event=>setActionForm({...actionForm,confirmAnonymized:event.target.checked})}/>Tôi đã kiểm tra bản xem trước đã ẩn danh và đồng ý công khai</label>
            </>}
            {['start','approve','close','closeNoResponse','unpublish'].includes(actionKind)&&<div className="notice full"><AlertCircle/>Hệ thống sẽ ghi nhận người thực hiện và thời điểm cập nhật trong nhật ký hồ sơ.</div>}
            {actionError&&<div className="form-error full" role="alert"><AlertCircle/>{actionError}</div>}
            <div className="fb-sheet-actions full">
              <button type="button" className="btn secondary" onClick={closeAction}>Hủy</button>
              <button className={`btn ${['return','reject','rejectReopen'].includes(actionKind)?'danger':'primary'}`} disabled={saving||(actionKind==='publish'&&(!publicationPreview||publicationPreviewLoading||Boolean(publicationPreviewError)))}>{saving?<><RefreshCw className="spin"/>Đang xử lý...</>:actionTitles[actionKind]}</button>
            </div>
          </form>}
        </>}
      </aside>
    </div>}
  </>;
}
