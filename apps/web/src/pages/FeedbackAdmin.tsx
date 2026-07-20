import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  Filter,
  Inbox,
  LockKeyhole,
  MessageCircleMore,
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
import { Empty, PageHead, Spinner } from '../components/UI';
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
import '../feedback.css';

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
};

const actionTitles:Record<ActionKind,string>={
  triage:'Phân loại phản ánh',assign:'Phân công xử lý',start:'Bắt đầu xử lý',request:'Yêu cầu bổ sung thông tin',contact:'Ghi nhận lần liên hệ',message:'Thêm trao đổi',
  submit:'Trình duyệt kết quả',approve:'Duyệt kết quả',return:'Trả lại để hoàn thiện',close:'Đóng hồ sơ',closeNoResponse:'Kết thúc do quá hạn bổ sung',
  reject:'Không tiếp nhận phản ánh',reopen:'Chấp nhận và mở lại hồ sơ',rejectReopen:'Từ chối đề nghị xem xét lại',publish:'Công khai kết quả đã ẩn danh',unpublish:'Gỡ khỏi trang công khai',
};

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
  const [notice,setNotice]=useState('');
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const pageSize=20;
  const [filters,setFilters]=useState({status:'',priority:'',category:'',departmentId:'',assignedToMe:false,reopenRequested:false,waitingCitizenExpired:false,search:''});
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
      setNotice(`${actionTitles[actionKind]} thành công.`);closeAction();
      await Promise.all([openDetail(detail.id),load()]);
    }catch(reason){setActionError(getError(reason,'Không thể cập nhật hồ sơ'))}
    finally{setSaving(false)}
  }

  function applySearch(event:FormEvent){event.preventDefault();setPage(1);setAppliedSearch(filters.search.trim())}

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
    }catch(reason){setAttachmentError(getError(reason,'Không thể tải file minh chứng'))}
    finally{setDownloadingAttachmentId('')}
  }

  const eligibleUsers=useMemo(()=>assignees.filter(item=>item.departmentId===actionForm.departmentId),[actionForm.departmentId,assignees]);
  const detailAttachments=detail?.attachments||[];

  const pages=Math.max(1,Math.ceil(total/pageSize));

  return <>
    <PageHead eyebrow="PHỤC VỤ NGƯỜI DÂN" title="Tiếp nhận & xử lý phản ánh" description={isAdmin?'Theo dõi toàn bộ vòng đời phản ánh, phân công đúng đơn vị và kiểm soát thời hạn xử lý.':`Dữ liệu được giới hạn trong ${user.department?.name||'đơn vị của bạn'} theo quyền được giao.`} actions={<button className="btn secondary" disabled={loading} onClick={()=>void load()}><RefreshCw/>Làm mới</button>}/>
    {notice&&<div className="notice success"><CheckCircle2/>{notice}<button aria-label="Đóng thông báo" onClick={()=>setNotice('')}><X/></button></div>}
    {pageError&&<div className="notice error" role="alert"><AlertCircle/>{pageError}<button onClick={()=>void load()}>Thử lại</button></div>}

    <div className="feedback-stat-grid">
      <article><span><Inbox/>Tổng hồ sơ</span><strong>{stats?.total??'—'}</strong><small>{stats?.received??0} mới tiếp nhận</small></article>
      <article><span><Clock3/>Đang xử lý</span><strong>{stats?.inProgress??'—'}</strong><small>{stats?.dueSoon??0} sắp đến hạn · {stats?.awaitingCitizen??0} chờ dân</small></article>
      <article><span><ShieldCheck/>Chờ duyệt</span><strong>{stats?.pendingReview??'—'}</strong><small>Cần kiểm tra kết quả</small></article>
      <article className={stats?.reopenRequested?'danger':''}><span><RotateCcw/>Xem xét lại</span><strong>{stats?.reopenRequested??'—'}</strong><small>Đề nghị của người dân</small></article>
      <article className={stats?.overdue?'danger':''}><span><AlertCircle/>Quá hạn xử lý</span><strong>{stats?.overdue??'—'}</strong><small>{stats?.waitingCitizenExpired??0} hồ sơ quá hạn bổ sung được theo dõi riêng</small></article>
      <article><span><Star/>Hài lòng</span><strong>{stats?.averageRating?`${stats.averageRating.toFixed(1)}/5`:'—'}</strong><small>{stats?.ratingCount??0} lượt đánh giá</small></article>
    </div>

    <section className="feedback-admin-card">
      <div className="feedback-admin-filters">
        <form className="feedback-search" onSubmit={applySearch}><Search/><input value={filters.search} onChange={event=>setFilters({...filters,search:event.target.value})} placeholder={user.role==='VIEWER'?'Tìm theo mã phản ánh':'Tìm theo mã, tiêu đề, nội dung'}/><button type="submit">Tìm</button></form>
        <div className="feedback-filter-row"><Filter/>
          <select aria-label="Lọc theo trạng thái" value={filters.status} onChange={event=>{setPage(1);setFilters({...filters,status:event.target.value})}}><option value="">Tất cả trạng thái</option>{statuses.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select aria-label="Lọc theo mức ưu tiên" value={filters.priority} onChange={event=>{setPage(1);setFilters({...filters,priority:event.target.value})}}><option value="">Mọi mức ưu tiên</option>{priorities.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select aria-label="Lọc theo nhóm phản ánh" value={filters.category} onChange={event=>{setPage(1);setFilters({...filters,category:event.target.value})}}><option value="">Mọi nhóm vấn đề</option>{categories.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select>
          {isAdmin&&<select aria-label="Lọc theo đơn vị" value={filters.departmentId} onChange={event=>{setPage(1);setFilters({...filters,departmentId:event.target.value})}}><option value="">Tất cả đơn vị</option>{departments.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          {user.role!=='VIEWER'&&<label className="feedback-my-work"><input type="checkbox" checked={filters.assignedToMe} onChange={event=>{setPage(1);setFilters({...filters,assignedToMe:event.target.checked})}}/>Việc giao cho tôi</label>}
          {canReview&&<label className="feedback-my-work"><input type="checkbox" checked={filters.reopenRequested} onChange={event=>{setPage(1);setFilters({...filters,reopenRequested:event.target.checked})}}/>Chờ xem xét lại</label>}
          {canReview&&<label className="feedback-my-work"><input type="checkbox" checked={filters.waitingCitizenExpired} onChange={event=>{setPage(1);setFilters({...filters,waitingCitizenExpired:event.target.checked})}}/>Quá hạn bổ sung</label>}
        </div>
      </div>

      <div className="feedback-list-summary"><span><b>{total}</b> hồ sơ phù hợp</span><small>Chọn một hồ sơ để xem chi tiết và xử lý</small></div>
      {loading?<Spinner/>:rows.length?<div className="feedback-admin-list">{rows.map(item=><button className="feedback-admin-row" key={item.id} onClick={()=>void openDetail(item.id)}>
        <div className="feedback-row-main"><div><span className="feedback-code">{item.code}</span><span className={`feedback-priority ${item.priority.toLowerCase()}`}>{priorityLabel[item.priority]}</span>{isOverdue(item)&&<span className="feedback-overdue">{item.status==='WAITING_CITIZEN'?'Quá hạn bổ sung':'Quá hạn xử lý'}</span>}{item.reopenRequestedAt&&<span className="feedback-priority high">Chờ duyệt xem xét lại</span>}</div><strong>{item.title}</strong><small>{categoryLabel[item.category]} · Tiếp nhận {formatDate(item.createdAt)}</small></div>
        <div className="feedback-row-unit"><small>Đơn vị xử lý</small><b>{item.department?.name||'Chưa phân công'}</b><span>{item.assignedTo?.fullName||'Chưa giao cán bộ'}</span></div>
        <div className="feedback-row-status"><span className={`feedback-status ${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span><small>{item.status==='WAITING_CITIZEN'?'Hạn bổ sung':item.firstResponseAt?'Hạn xử lý':'Hạn phản hồi'}: {formatDate(activeDeadline(item))}</small></div><ArrowRight/>
      </button>)}</div>:<Empty title="Không có phản ánh phù hợp" description="Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm."/>}
      {pages>1&&<div className="feedback-pagination"><button disabled={page===1} onClick={()=>setPage(value=>value-1)}><ArrowLeft/>Trang trước</button><span>Trang {page}/{pages}</span><button disabled={page===pages} onClick={()=>setPage(value=>value+1)}>Trang sau<ArrowRight/></button></div>}
    </section>

    {(detail||detailLoading)&&<div className="feedback-detail-backdrop" onMouseDown={closeDetail}>
      <aside ref={detailPanelRef} className="feedback-detail-panel" role="dialog" aria-modal="true" aria-labelledby={detail?'feedback-detail-heading':undefined} aria-label={detail?undefined:'Đang tải hồ sơ phản ánh'} tabIndex={-1} onKeyDown={keepDetailFocus} onMouseDown={event=>event.stopPropagation()}>
        {detailLoading&&!detail?<Spinner/>:detail&&<>
          <header><div><span>{detail.code}</span><h2 id="feedback-detail-heading">{detail.title}</h2></div><button disabled={saving} aria-label="Đóng hồ sơ" onClick={closeDetail}><X/></button></header>
          <div className="feedback-detail-scroll">
            <div className="feedback-detail-badges"><span className={`feedback-status ${detail.status.toLowerCase()}`}>{statusLabel[detail.status]}</span><span className={`feedback-priority ${detail.priority.toLowerCase()}`}>{priorityLabel[detail.priority]}</span>{detail.isPublic&&<span className="feedback-published"><Eye/>Đang công khai</span>}</div>
            <div className="feedback-detail-facts"><div><small>Người gửi</small>{user.role==='VIEWER'?<><b>Thông tin đã ẩn</b><span>Chỉ cán bộ xử lý được xem dữ liệu liên hệ</span></>:<><b>{detail.submitterName}</b><span>{detail.submitterPhone}</span>{detail.submitterEmail&&<span>{detail.submitterEmail}</span>}<span>Ưu tiên liên hệ thủ công: {detail.preferredContact==='EMAIL'?'Email':'Điện thoại'}</span></>}</div><div><small>Đơn vị xử lý</small><b>{detail.department?.name||'Chưa phân công'}</b><span>{detail.assignedTo?.fullName||'Chưa giao cán bộ'}</span></div><div><small>{detail.status==='WAITING_CITIZEN'?'Hạn người dân bổ sung':detail.firstResponseAt?'Hạn xử lý':'Hạn phản hồi đầu tiên'}</small><b className={isOverdue(detail)?'danger-text':''}>{formatDate(activeDeadline(detail))}</b><span>Tiếp nhận {formatDate(detail.createdAt)}</span></div></div>
            <section className="feedback-detail-section"><h3>Nội dung phản ánh</h3><p>{detail.content}</p>{detail.address&&<p className="feedback-location"><b>Địa điểm:</b> {detail.address}</p>}</section>
            <section className="feedback-detail-section"><h3>File ảnh & minh chứng</h3>{attachmentError&&<div className="feedback-alert error" role="alert"><AlertCircle/>{attachmentError}</div>}{detailAttachments.length?<div className="feedback-internal-messages">{detailAttachments.map(attachment=><article key={attachment.id}><div><b>{attachment.originalName||'File minh chứng'}</b><span>{[attachment.mimeType,formatFileSize(attachment.size)].filter(Boolean).join(' · ')}</span>{attachment.createdAt&&<time>{formatDate(attachment.createdAt)}</time>}<button className="feedback-btn secondary" type="button" disabled={downloadingAttachmentId===attachment.id} onClick={()=>void downloadAttachment(attachment)}>{downloadingAttachmentId===attachment.id?<RefreshCw className="spin"/>:<Download/>}{downloadingAttachmentId===attachment.id?'Đang tải':'Tải file'}</button></div></article>)}</div>:<p className="feedback-muted">Phản ánh này không có file đính kèm.</p>}</section>
            {detail.resolutionSummary&&<section className="feedback-resolution"><CheckCircle2/><div><h3>Kết quả đề xuất</h3><p>{detail.resolutionSummary}</p></div></section>}
            {detail.rejectionReason&&<section className="feedback-rejection"><XCircle/><div><h3>Lý do không tiếp nhận</h3><p>{detail.rejectionReason}</p></div></section>}
            {detail.reopenRequestedAt&&<section className="feedback-appeal"><RotateCcw/><div><h3>Người dân đề nghị xem xét lại</h3><p>{detail.reopenRequestReason}</p><small>Gửi lúc {formatDate(detail.reopenRequestedAt)} · Lần {detail.reopenRequestCount}/3</small></div></section>}
            <section className="feedback-detail-section"><h3>Trao đổi & ghi chú</h3>{detail.messages?.length?<div className="feedback-internal-messages">{detail.messages.map(message=><article key={message.id} className={message.visibility==='INTERNAL'?'internal':''}><div><b>{message.authorName}</b><span>{message.visibility==='INTERNAL'?<><LockKeyhole/>Nội bộ</>:<><Eye/>Người dân thấy</>}</span><time>{formatDate(message.createdAt)}</time></div><p>{message.body}</p></article>)}</div>:<p className="feedback-muted">Chưa có trao đổi nào.</p>}</section>
            <section className="feedback-detail-section"><h3>Lịch sử xử lý</h3><div className="feedback-event-list">{detail.events?.map(event=><div key={event.id}><i/><div><b>{eventLabels[event.action]||event.action}</b><span>{event.actorName||'Hệ thống'} · {formatDate(event.createdAt)}</span>{event.note&&<p>{event.note}</p>}</div></div>)}</div></section>
            {detail.rating&&<div className="feedback-rating-result"><Star/><span><b>{detail.rating}/5 điểm</b>{detail.ratingComment&&<small>{detail.ratingComment}</small>}</span></div>}
          </div>

          <footer className="feedback-detail-actions">
            {canReview&&['RECEIVED','ASSIGNED'].includes(detail.status)&&<button onClick={()=>startAction('triage')}><Filter/>Phân loại</button>}
            {canReview&&['RECEIVED','ASSIGNED','REOPENED','IN_PROGRESS','WAITING_CITIZEN'].includes(detail.status)&&<button onClick={()=>startAction('assign')}><UserCheck/>Phân công</button>}
            {canHandle(detail)&&['ASSIGNED','REOPENED'].includes(detail.status)&&<button onClick={()=>startAction('start')}><Clock3/>Bắt đầu xử lý</button>}
            {canHandle(detail)&&['IN_PROGRESS','REOPENED'].includes(detail.status)&&<button onClick={()=>startAction('request')}><MessageCircleMore/>Yêu cầu bổ sung</button>}
            {canHandle(detail)&&!['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&<button onClick={()=>startAction('contact')}><MessageCircleMore/>Ghi nhận liên hệ</button>}
            {canHandle(detail)&&!['CLOSED','REJECTED'].includes(detail.status)&&<button onClick={()=>startAction('message')}><Send/>Thêm trao đổi</button>}
            {canHandle(detail)&&['IN_PROGRESS','REOPENED'].includes(detail.status)&&<button className="primary" onClick={()=>startAction('submit')}><ShieldCheck/>Trình duyệt</button>}
            {canReview&&detail.status==='PENDING_REVIEW'&&detail.submittedForReviewBy!==user.id&&<><button className="danger" onClick={()=>startAction('return')}><RotateCcw/>Trả lại</button><button className="primary" onClick={()=>startAction('approve')}><Check/>Duyệt kết quả</button></>}
            {canReview&&detail.status==='PENDING_REVIEW'&&detail.submittedForReviewBy===user.id&&<span className="feedback-readonly"><LockKeyhole/>Bạn đã trình hồ sơ này; cần người khác duyệt kết quả.</span>}
            {canReview&&detail.status==='RESOLVED'&&<button onClick={()=>startAction('close')}><CheckCircle2/>Đóng hồ sơ</button>}
            {canReview&&detail.status==='WAITING_CITIZEN'&&detail.citizenResponseDueAt&&new Date(detail.citizenResponseDueAt)<=new Date()&&<button className="danger" onClick={()=>startAction('closeNoResponse')}><XCircle/>Kết thúc do quá hạn bổ sung</button>}
            {isAdmin&&['RECEIVED','ASSIGNED'].includes(detail.status)&&<button className="danger" onClick={()=>startAction('reject')}><XCircle/>Không tiếp nhận</button>}
            {canReview&&['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&detail.reopenRequestedAt&&<><button className="danger" onClick={()=>startAction('rejectReopen')}><XCircle/>Từ chối đề nghị</button><button className="primary" onClick={()=>startAction('reopen')}><RotateCcw/>Chấp nhận mở lại</button></>}
            {canReview&&['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&!detail.reopenRequestedAt&&<button onClick={()=>startAction('reopen')}><RotateCcw/>{detail.status==='REJECTED'?'Khôi phục hồ sơ':'Mở lại nội bộ'}</button>}
            {isAdmin&&['RESOLVED','CLOSED'].includes(detail.status)&&(detail.isPublic||!detail.reopenRequestedAt)&&<button onClick={()=>startAction(detail.isPublic?'unpublish':'publish')}><Eye/>{detail.isPublic?'Gỡ công khai':'Công khai'}</button>}
            {!canHandle(detail)&&!canReview&&<span className="feedback-readonly"><Eye/>Bạn đang xem hồ sơ ở chế độ chỉ đọc.</span>}
          </footer>

          {actionKind&&<form className="feedback-action-sheet" onSubmit={submitAction}>
            <div className="feedback-action-head"><div><span>THAO TÁC HỒ SƠ</span><h3>{actionTitles[actionKind]}</h3></div><button type="button" disabled={saving} aria-label="Đóng thao tác" onClick={closeAction}><X/></button></div>
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
            {actionKind==='message'&&<><label>Phạm vi hiển thị<select value={actionForm.visibility} onChange={event=>setActionForm({...actionForm,visibility:event.target.value as FeedbackMessageVisibility})}>{['IN_PROGRESS','WAITING_CITIZEN','REOPENED'].includes(detail.status)&&<option value="PUBLIC">Phản hồi cho người dân</option>}<option value="INTERNAL">Ghi chú nội bộ</option></select></label><label className="full">Nội dung<textarea required minLength={2} maxLength={3000} rows={4} value={actionForm.message} onChange={event=>setActionForm({...actionForm,message:event.target.value})}/></label></>}
            {actionKind==='submit'&&<label className="full">Kết quả xử lý đề xuất<textarea required minLength={10} maxLength={5000} rows={6} value={actionForm.summary} onChange={event=>setActionForm({...actionForm,summary:event.target.value})}/><small>Sau khi duyệt, nội dung này sẽ được gửi cho người dân.</small></label>}
            {['approve','close','closeNoResponse'].includes(actionKind)&&<label className="full">Ghi chú (không bắt buộc)<textarea maxLength={actionKind==='approve'?2000:1000} rows={3} value={actionForm.note} onChange={event=>setActionForm({...actionForm,note:event.target.value})}/></label>}
            {actionKind==='return'&&<label className="full">Lý do trả lại<textarea required minLength={3} maxLength={2000} rows={4} value={actionForm.note} onChange={event=>setActionForm({...actionForm,note:event.target.value})}/></label>}
            {['reject','reopen','rejectReopen'].includes(actionKind)&&<label className="full">{actionKind==='reject'?'Lý do không tiếp nhận':actionKind==='rejectReopen'?'Lý do chưa chấp nhận đề nghị':'Căn cứ mở lại hồ sơ'}<textarea required minLength={10} maxLength={2000} rows={4} value={actionForm.reason} onChange={event=>setActionForm({...actionForm,reason:event.target.value})}/></label>}
            {actionKind==='publish'&&<>
              <div className="feedback-sheet-note full"><ShieldCheck/>Đây là chính xác nội dung đã được hệ thống tự động ẩn danh và sẽ hiển thị cho người dân. Bạn không cần nhập lại tiêu đề hoặc nội dung.</div>
              {publicationPreviewLoading&&<div className="feedback-sheet-note full" role="status"><RefreshCw className="spin"/>Đang tạo bản xem trước đã ẩn danh...</div>}
              {publicationPreviewError&&<div className="feedback-alert error full" role="alert"><AlertCircle/><span>{publicationPreviewError}</span><button className="feedback-btn secondary" type="button" onClick={()=>void loadPublicationPreview(detail.id)}>Tải lại</button></div>}
              {publicationPreview&&<section className="feedback-detail-section full" aria-label="Xem trước nội dung công khai">
                <h3>Bản xem trước sẽ công khai</h3>
                <small>Tiêu đề phản ánh</small><p><b>{publicationPreview.title}</b></p>
                <small>Nội dung phản ánh</small><p>{publicationPreview.content}</p>
                <small>Kết quả xử lý</small><p>{publicationPreview.resolutionSummary||'Không có nội dung kết quả xử lý.'}</p>
              </section>}
              <label className="feedback-my-work full"><input required disabled={!publicationPreview||publicationPreviewLoading||Boolean(publicationPreviewError)} type="checkbox" checked={actionForm.confirmAnonymized} onChange={event=>setActionForm({...actionForm,confirmAnonymized:event.target.checked})}/>Tôi đã kiểm tra bản xem trước đã ẩn danh và đồng ý công khai</label>
            </>}
            {['start','approve','close','closeNoResponse','unpublish'].includes(actionKind)&&<div className="feedback-sheet-note full"><AlertCircle/>Hệ thống sẽ ghi nhận người thực hiện và thời điểm cập nhật trong nhật ký hồ sơ.</div>}
            {actionError&&<div className="feedback-alert error full" role="alert"><AlertCircle/>{actionError}</div>}
            <div className="feedback-sheet-actions full"><button type="button" onClick={closeAction}>Hủy</button><button className={['return','reject','rejectReopen'].includes(actionKind)?'danger':'primary'} disabled={saving||(actionKind==='publish'&&(!publicationPreview||publicationPreviewLoading||Boolean(publicationPreviewError)))}>{saving?<><RefreshCw className="spin"/>Đang xử lý...</>:actionTitles[actionKind]}</button></div>
          </form>}
        </>}
      </aside>
    </div>}
  </>;
}
