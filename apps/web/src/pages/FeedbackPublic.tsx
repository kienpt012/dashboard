import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  Eye,
  FileImage,
  FileSearch,
  FileText,
  KeyRound,
  LockKeyhole,
  MessageCircleMore,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Star,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, downloadApi } from '../api';
import { currentVietnamYear } from '../date';
import type {
  FeedbackCategory,
  FeedbackAttachment,
  FeedbackStatus,
  PublicFeedbackCreated,
  PublicFeedbackDetail,
} from '../types';
import '../feedback.css';

const categories:Array<{value:FeedbackCategory;label:string}>=[
  {value:'INFRASTRUCTURE',label:'Hạ tầng, giao thông'},
  {value:'ENVIRONMENT',label:'Môi trường, vệ sinh'},
  {value:'ADMINISTRATIVE_PROCEDURE',label:'Thủ tục hành chính'},
  {value:'SECURITY_ORDER',label:'An ninh, trật tự'},
  {value:'SOCIAL_WELFARE',label:'An sinh xã hội'},
  {value:'CULTURE_EDUCATION',label:'Văn hóa, giáo dục'},
  {value:'OTHER',label:'Nội dung khác'},
];

const statusLabels:Record<FeedbackStatus,string>={
  RECEIVED:'Đã tiếp nhận',
  ASSIGNED:'Đã phân công',
  IN_PROGRESS:'Đang xử lý',
  WAITING_CITIZEN:'Chờ bổ sung thông tin',
  PENDING_REVIEW:'Chờ duyệt kết quả',
  RESOLVED:'Đã có kết quả',
  CLOSED:'Đã đóng hồ sơ',
  REJECTED:'Không thuộc phạm vi tiếp nhận',
  REOPENED:'Đang xem xét lại',
};

const eventLabels:Record<string,string>={
  CREATED:'Hồ sơ được tiếp nhận',
  CITIZEN_ATTACHMENTS_ADDED:'Người dân đã gửi tệp minh chứng',
  FEEDBACK_TRIAGED:'Hồ sơ được phân loại',
  FEEDBACK_ASSIGNED:'Đã phân công đơn vị xử lý',
  FEEDBACK_STARTED:'Bắt đầu xử lý',
  CONTACT_ATTEMPT_LOGGED:'Đơn vị xử lý đã liên hệ xác minh',
  INFORMATION_REQUESTED:'Cần người dân bổ sung thông tin',
  CITIZEN_MESSAGE_ADDED:'Người dân đã bổ sung thông tin',
  PUBLIC_MESSAGE_ADDED:'Đơn vị xử lý đã phản hồi',
  FEEDBACK_SUBMITTED_FOR_REVIEW:'Kết quả được trình duyệt',
  RESOLUTION_APPROVED:'Kết quả xử lý đã được duyệt',
  RESOLUTION_RETURNED:'Kết quả được trả lại để hoàn thiện',
  FEEDBACK_CLOSED:'Hồ sơ đã đóng',
  FEEDBACK_CLOSED_NO_RESPONSE:'Hồ sơ kết thúc do quá hạn bổ sung thông tin',
  FEEDBACK_REJECTED:'Hồ sơ không thuộc phạm vi tiếp nhận',
  FEEDBACK_REOPENED:'Hồ sơ được mở lại',
  CITIZEN_REOPEN_REQUESTED:'Đã gửi đề nghị xem xét lại',
  CITIZEN_REOPEN_REQUEST_APPROVED:'Đề nghị xem xét lại được chấp nhận',
  CITIZEN_REOPEN_REQUEST_REJECTED:'Đề nghị xem xét lại chưa được chấp nhận',
  CITIZEN_RATED:'Người dân đã đánh giá kết quả',
  FEEDBACK_PUBLISHED:'Kết quả được công khai',
  FEEDBACK_UNPUBLISHED:'Kết quả được tạm gỡ khỏi trang công khai',
};

const emptyCreate={
  title:'',content:'',category:'INFRASTRUCTURE' as FeedbackCategory,submitterName:'',submitterPhone:'',
  submitterEmail:'',address:'',preferredContact:'PHONE' as 'PHONE'|'EMAIL',consent:false,scopeConfirmed:false,
};

const PENDING_SUBMISSION_KEY='ioc-feedback-pending-submission';
const MAX_EVIDENCE_FILES=5;
const MAX_EVIDENCE_SIZE=10*1024*1024;
const ACCEPTED_EVIDENCE_TYPES=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const ACCEPTED_EVIDENCE_EXTENSIONS=new Set(['jpg','jpeg','png','webp','pdf']);
type PendingSubmission={clientSubmissionId:string;lookupSecret:string;createdAt:number};
type AttachmentUploadResponse={attachments:FeedbackAttachment[];version:number};

function newPendingSubmission():PendingSubmission{
  const secretBytes=new Uint8Array(16);crypto.getRandomValues(secretBytes);
  const idBytes=new Uint8Array(16);crypto.getRandomValues(idBytes);idBytes[6]=(idBytes[6]&0x0f)|0x40;idBytes[8]=(idBytes[8]&0x3f)|0x80;
  const hex=Array.from(idBytes,value=>value.toString(16).padStart(2,'0')).join('');
  const clientSubmissionId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  return {clientSubmissionId,lookupSecret:Array.from(secretBytes,value=>value.toString(16).padStart(2,'0')).join('').toUpperCase(),createdAt:Date.now()};
}

function restoredPendingSubmission():PendingSubmission|null{
  try{
    const value=JSON.parse(sessionStorage.getItem(PENDING_SUBMISSION_KEY)||'null') as PendingSubmission|null;
    return value&&Date.now()-value.createdAt<24*60*60*1000?value:null;
  }catch{return null}
}

function savePendingSubmission(value:PendingSubmission){
  try{sessionStorage.setItem(PENDING_SUBMISSION_KEY,JSON.stringify(value))}catch{/* Idempotency still works for the current page session. */}
}

function clearPendingSubmission(){
  try{sessionStorage.removeItem(PENDING_SUBMISSION_KEY)}catch{/* Storage can be disabled by browser privacy settings. */}
}

function formatDate(value?:string|null){
  return value?new Date(value).toLocaleString('vi-VN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}):'Chưa xác định';
}

function getError(reason:unknown,fallback:string){
  return reason instanceof Error?reason.message:fallback;
}

function publicDeadline(detail:PublicFeedbackDetail){
  return detail.status==='WAITING_CITIZEN'?(detail.citizenResponseDueAt||detail.dueAt):(detail.firstResponseAt?detail.dueAt:(detail.firstResponseDueAt||detail.dueAt));
}

function formatFileSize(bytes:number){
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toLocaleString('vi-VN',{maximumFractionDigits:1})} KB`;
  return `${(bytes/(1024*1024)).toLocaleString('vi-VN',{maximumFractionDigits:1})} MB`;
}

function isAcceptedEvidenceFile(file:File){
  if(ACCEPTED_EVIDENCE_TYPES.has(file.type.toLowerCase()))return true;
  const extension=file.name.split('.').pop()?.toLowerCase()||'';
  return (!file.type||file.type==='application/octet-stream')&&ACCEPTED_EVIDENCE_EXTENSIONS.has(extension);
}

export default function FeedbackPublic(){
  const [tab,setTab]=useState<'send'|'track'>('send');
  const tabRefs=useRef<Array<HTMLButtonElement|null>>([]);
  const receiptRef=useRef<HTMLDivElement|null>(null);
  const newFeedbackConfirmRef=useRef<HTMLDivElement|null>(null);
  const createErrorRef=useRef<HTMLDivElement|null>(null);
  const copyErrorRef=useRef<HTMLDivElement|null>(null);
  const trackErrorRef=useRef<HTMLDivElement|null>(null);
  const actionErrorRef=useRef<HTMLDivElement|null>(null);
  const evidenceInputRef=useRef<HTMLInputElement|null>(null);
  const supplementalEvidenceInputRef=useRef<HTMLInputElement|null>(null);
  const [createForm,setCreateForm]=useState(emptyCreate);
  const [creating,setCreating]=useState(false);
  const [created,setCreated]=useState<PublicFeedbackCreated|null>(null);
  const [evidenceFiles,setEvidenceFiles]=useState<File[]>([]);
  const [evidenceError,setEvidenceError]=useState('');
  const [draggingEvidence,setDraggingEvidence]=useState(false);
  const [uploadState,setUploadState]=useState<'idle'|'uploading'|'failed'|'done'>('idle');
  const [uploadedAttachments,setUploadedAttachments]=useState<FeedbackAttachment[]>([]);
  const [pendingSubmission,setPendingSubmission]=useState<PendingSubmission|null>(restoredPendingSubmission);
  const [createError,setCreateError]=useState('');
  const [copied,setCopied]=useState(false);
  const [copyError,setCopyError]=useState('');
  const [confirmNewFeedback,setConfirmNewFeedback]=useState(false);
  const [credentials,setCredentials]=useState({code:'',lookupSecret:''});
  const [detail,setDetail]=useState<PublicFeedbackDetail|null>(null);
  const [tracking,setTracking]=useState(false);
  const [trackError,setTrackError]=useState('');
  const [actionLoading,setActionLoading]=useState(false);
  const [actionError,setActionError]=useState('');
  const [message,setMessage]=useState('');
  const [reopenReason,setReopenReason]=useState('');
  const [rating,setRating]=useState(5);
  const [ratingComment,setRatingComment]=useState('');
  const [action,setAction]=useState<'message'|'rating'|'reopen'|null>(null);
  const [attachmentLoading,setAttachmentLoading]=useState<string|null>(null);
  const [attachmentError,setAttachmentError]=useState('');
  const [supplementalFiles,setSupplementalFiles]=useState<File[]>([]);
  const [supplementalError,setSupplementalError]=useState('');
  const [supplementalUploading,setSupplementalUploading]=useState(false);
  const [draggingSupplemental,setDraggingSupplemental]=useState(false);

  useEffect(()=>{
    if(!created)return;
    receiptRef.current?.focus({preventScroll:true});
    receiptRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
  },[created]);

  useEffect(()=>{if(createError)createErrorRef.current?.focus()},[createError]);
  useEffect(()=>{if(copyError)copyErrorRef.current?.focus()},[copyError]);
  useEffect(()=>{if(trackError)trackErrorRef.current?.focus()},[trackError]);
  useEffect(()=>{if(actionError)actionErrorRef.current?.focus()},[actionError]);
  useEffect(()=>{if(confirmNewFeedback)newFeedbackConfirmRef.current?.focus()},[confirmNewFeedback]);

  function selectTab(next:'send'|'track',focus=false){
    if(created&&uploadState==='uploading'&&next==='track')return;
    setTab(next);
    if(focus){
      const index=next==='send'?0:1;
      requestAnimationFrame(()=>tabRefs.current[index]?.focus());
    }
  }

  function handleTabKeyDown(event:KeyboardEvent<HTMLButtonElement>,index:number){
    let nextIndex:number|null=null;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft')nextIndex=(index+1)%2;
    else if(event.key==='Home')nextIndex=0;
    else if(event.key==='End')nextIndex=1;
    if(nextIndex===null)return;
    event.preventDefault();
    selectTab(nextIndex===0?'send':'track',true);
  }

  function addEvidenceFiles(files:File[]){
    setEvidenceError('');
    const invalidType=files.find(file=>!isAcceptedEvidenceFile(file));
    if(invalidType){
      setEvidenceError(`Tệp “${invalidType.name}” không đúng định dạng. Chỉ nhận JPG, PNG, WEBP hoặc PDF.`);
      return;
    }
    const oversized=files.find(file=>file.size>MAX_EVIDENCE_SIZE);
    if(oversized){
      setEvidenceError(`Tệp “${oversized.name}” vượt quá 10 MB. Vui lòng giảm dung lượng rồi thử lại.`);
      return;
    }
    setEvidenceFiles(current=>{
      const merged=[...current];
      for(const file of files){
        if(!merged.some(item=>item.name===file.name&&item.size===file.size&&item.lastModified===file.lastModified))merged.push(file);
      }
      if(merged.length>MAX_EVIDENCE_FILES){
        setEvidenceError('Mỗi phản ánh được gửi tối đa 5 tệp minh chứng.');
        return current;
      }
      return merged;
    });
  }

  function chooseEvidence(event:ChangeEvent<HTMLInputElement>){
    addEvidenceFiles(Array.from(event.target.files||[]));
    event.target.value='';
  }

  function dropEvidence(event:DragEvent<HTMLDivElement>){
    event.preventDefault();setDraggingEvidence(false);
    addEvidenceFiles(Array.from(event.dataTransfer.files||[]));
  }

  async function uploadEvidence(receipt:PublicFeedbackCreated,files:File[],refresh=false){
    if(!files.length){setUploadState('idle');return}
    setUploadState('uploading');setEvidenceError('');
    try{
      let expectedVersion=receipt.version;
      if(refresh){
        const current=await api<PublicFeedbackDetail>('/public/feedbacks/track',{
          method:'POST',
          body:JSON.stringify({code:receipt.code,lookupSecret:receipt.lookupSecret}),
        });
        expectedVersion=current.version;
      }
      const body=new FormData();
      body.set('lookupSecret',receipt.lookupSecret);
      body.set('expectedVersion',String(expectedVersion));
      files.forEach(file=>body.append('files',file,file.name));
      const result=await api<AttachmentUploadResponse>(`/public/feedbacks/${encodeURIComponent(receipt.code)}/attachments`,{method:'POST',body});
      setUploadedAttachments(result.attachments);setUploadState('done');setEvidenceFiles([]);
      setCreated(value=>value?{...value,version:result.version}:value);
    }catch(reason){
      setUploadState('failed');
      setEvidenceError(getError(reason,'Phản ánh đã được tiếp nhận nhưng chưa thể tải tệp minh chứng.'));
    }
  }

  async function submitFeedback(event:FormEvent){
    event.preventDefault();setCreating(true);setCreateError('');setCopyError('');setConfirmNewFeedback(false);setCreated(null);
    const submission=pendingSubmission??newPendingSubmission();
    if(!pendingSubmission){setPendingSubmission(submission);savePendingSubmission(submission)}
    try{
      const result=await api<PublicFeedbackCreated>('/public/feedbacks',{
        method:'POST',
        body:JSON.stringify({
          ...createForm,
          clientSubmissionId:submission.clientSubmissionId,
          lookupSecret:submission.lookupSecret,
          submitterEmail:createForm.submitterEmail.trim()||undefined,
          address:createForm.address.trim()||undefined,
        }),
      });
      setCreated(result);setCopied(false);setCreateForm(emptyCreate);setPendingSubmission(null);clearPendingSubmission();
      setUploadedAttachments([]);
      if(evidenceFiles.length)await uploadEvidence(result,evidenceFiles);
    }catch(reason){setCreateError(getError(reason,'Không thể gửi phản ánh. Vui lòng thử lại.'))}
    finally{setCreating(false)}
  }

  async function copyReceipt(){
    if(!created)return;
    const receipt=`Mã phản ánh: ${created.code}\nMã bảo mật: ${created.lookupSecret}`;
    setCopyError('');
    try{
      if(!navigator.clipboard)throw new Error('Clipboard API is unavailable');
      await navigator.clipboard.writeText(receipt);setCopied(true);
    }catch{
      setCopied(false);
      setCopyError('Không thể sao chép tự động. Vui lòng chọn và sao chép từng mã trước khi rời trang này.');
    }
  }

  function startAnotherFeedback(){
    if(uploadState==='uploading')return;
    setCreated(null);setCopied(false);setCopyError('');setConfirmNewFeedback(false);
    setEvidenceFiles([]);setEvidenceError('');setUploadState('idle');setUploadedAttachments([]);
    selectTab('send',true);
  }

  function useReceipt(){
    if(!created||uploadState==='uploading')return;
    setCredentials({code:created.code,lookupSecret:created.lookupSecret});
    setDetail(null);setTrackError('');setActionError('');selectTab('track',true);
  }

  async function track(event?:FormEvent){
    event?.preventDefault();setTracking(true);setTrackError('');setActionError('');setDetail(null);setAction(null);
    try{
      const result=await api<PublicFeedbackDetail>('/public/feedbacks/track',{
        method:'POST',body:JSON.stringify({code:credentials.code.trim(),lookupSecret:credentials.lookupSecret.trim()}),
      });
      setDetail({...result,attachments:result.attachments||[]});setAttachmentError('');
      setSupplementalFiles([]);setSupplementalError('');
    }catch(reason){setTrackError(getError(reason,'Không thể tra cứu hồ sơ.'))}
    finally{setTracking(false)}
  }

  async function openAttachment(item:FeedbackAttachment,download=false){
    if(!detail)return;
    const loadingKey=`${item.id}:${download?'download':'view'}`;
    setAttachmentLoading(loadingKey);setAttachmentError('');
    try{
      const blob=await downloadApi(`/public/feedbacks/${encodeURIComponent(detail.code)}/attachments/${encodeURIComponent(item.id)}/download`,{
        method:'POST',
        body:JSON.stringify({lookupSecret:credentials.lookupSecret.trim()}),
      });
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.rel='noopener';
      if(download)link.download=item.originalName;
      else link.target='_blank';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
    }catch(reason){
      setAttachmentError(getError(reason,'Không thể mở tệp minh chứng. Vui lòng thử lại.'));
    }finally{setAttachmentLoading(null)}
  }

  function addSupplementalFiles(files:File[]){
    if(!detail)return;
    setSupplementalError('');
    const invalidType=files.find(file=>!isAcceptedEvidenceFile(file));
    if(invalidType){
      setSupplementalError(`Tệp “${invalidType.name}” không đúng định dạng. Chỉ nhận JPG, PNG, WEBP hoặc PDF.`);
      return;
    }
    const oversized=files.find(file=>file.size>MAX_EVIDENCE_SIZE);
    if(oversized){
      setSupplementalError(`Tệp “${oversized.name}” vượt quá 10 MB.`);
      return;
    }
    const remaining=Math.max(0,MAX_EVIDENCE_FILES-detail.attachments.length);
    setSupplementalFiles(current=>{
      const merged=[...current];
      for(const file of files){
        if(!merged.some(item=>item.name===file.name&&item.size===file.size&&item.lastModified===file.lastModified))merged.push(file);
      }
      if(merged.length>remaining){
        setSupplementalError(`Hồ sơ này chỉ có thể bổ sung thêm ${remaining} tệp.`);
        return current;
      }
      return merged;
    });
  }

  function chooseSupplementalEvidence(event:ChangeEvent<HTMLInputElement>){
    addSupplementalFiles(Array.from(event.target.files||[]));
    event.target.value='';
  }

  async function uploadSupplementalEvidence(event:FormEvent){
    event.preventDefault();
    if(!detail||!supplementalFiles.length)return;
    setSupplementalUploading(true);setSupplementalError('');
    try{
      const body=new FormData();
      body.set('lookupSecret',credentials.lookupSecret.trim());
      body.set('expectedVersion',String(detail.version));
      supplementalFiles.forEach(file=>body.append('files',file,file.name));
      await api<AttachmentUploadResponse>(`/public/feedbacks/${encodeURIComponent(detail.code)}/attachments`,{method:'POST',body});
      const refreshed=await api<PublicFeedbackDetail>('/public/feedbacks/track',{
        method:'POST',
        body:JSON.stringify({code:detail.code,lookupSecret:credentials.lookupSecret.trim()}),
      });
      setDetail({...refreshed,attachments:refreshed.attachments||[]});
      setSupplementalFiles([]);
    }catch(reason){
      if(reason instanceof ApiError&&reason.status===409){
        try{
          const refreshed=await api<PublicFeedbackDetail>('/public/feedbacks/track',{
            method:'POST',
            body:JSON.stringify({code:detail.code,lookupSecret:credentials.lookupSecret.trim()}),
          });
          setDetail({...refreshed,attachments:refreshed.attachments||[]});
          setSupplementalError('Hồ sơ vừa được cập nhật. Dữ liệu đã được làm mới; vui lòng kiểm tra và nhấn “Tải minh chứng” lại.');
        }catch{
          setSupplementalError('Hồ sơ vừa được cập nhật. Vui lòng tra cứu lại rồi tải tệp.');
        }
      }else setSupplementalError(getError(reason,'Không thể tải tệp minh chứng. Vui lòng thử lại.'));
    }finally{setSupplementalUploading(false)}
  }

  async function citizenAction(kind:'message'|'rating'|'reopen',event:FormEvent){
    event.preventDefault();
    if(!detail)return;
    setActionLoading(true);setActionError('');
    const common={lookupSecret:credentials.lookupSecret.trim(),expectedVersion:detail.version};
    const config=kind==='message'
      ?{path:`/public/feedbacks/${encodeURIComponent(detail.code)}/messages`,body:{...common,message}}
      :kind==='rating'
        ?{path:`/public/feedbacks/${encodeURIComponent(detail.code)}/rating`,body:{...common,rating,comment:ratingComment.trim()||undefined}}
        :{path:`/public/feedbacks/${encodeURIComponent(detail.code)}/reopen`,body:{...common,reason:reopenReason}};
    try{
      const result=await api<PublicFeedbackDetail>(config.path,{method:'POST',body:JSON.stringify(config.body)});
      setDetail(result);setAction(null);setMessage('');setRatingComment('');setReopenReason('');
    }catch(reason){setActionError(getError(reason,'Không thể cập nhật hồ sơ.'))}
    finally{setActionLoading(false)}
  }

  const canMessage=detail&&['WAITING_CITIZEN','IN_PROGRESS','REOPENED'].includes(detail.status);
  const canAddAttachments=detail&&['RECEIVED','ASSIGNED','IN_PROGRESS','WAITING_CITIZEN','REOPENED'].includes(detail.status);
  const remainingAttachmentSlots=detail?Math.max(0,MAX_EVIDENCE_FILES-detail.attachments.length):0;
  const receiptUploadBusy=Boolean(created&&uploadState==='uploading');
  const canRate=detail&&['RESOLVED','CLOSED'].includes(detail.status)&&detail.closureReason==='RESOLVED'&&!detail.rating&&!detail.reopenRequestedAt;
  const appealDecisionAt=detail?(detail.closedAt||detail.resolvedAt):null;
  const appealExpiresAt=appealDecisionAt?new Date(new Date(appealDecisionAt).getTime()+30*24*60*60*1000):null;
  const appealWindowOpen=Boolean(appealExpiresAt&&appealExpiresAt>new Date());
  const canReopen=detail
    && ['RESOLVED','CLOSED','REJECTED'].includes(detail.status)
    && !detail.reopenRequestedAt
    && (detail.reopenRequestCount??0)<3
    && appealWindowOpen;

  return <div className="feedback-public">
    <header className="feedback-public-header">
      <Link to="/" className="feedback-public-brand"><span>LT</span><div><strong>PHƯỜNG LÁI THIÊU</strong><small>Kênh phản ánh hiện trường</small></div></Link>
      <Link to="/" className="feedback-back" aria-label="Về trang thông tin"><ArrowLeft/><span>Về trang thông tin</span></Link>
    </header>

    <main className="feedback-public-main">
      <section className="feedback-public-intro">
        <div><span className="feedback-kicker"><MessageCircleMore/>PHẢN ÁNH HIỆN TRƯỜNG</span><h1>Gửi và tra cứu phản ánh</h1><p>Gửi nội dung, tài liệu minh chứng và tra cứu tình trạng xử lý bằng mã phản ánh, mã bảo mật.</p></div>
        <div className="feedback-trust-list"><span><ShieldCheck/><b>Bảo vệ thông tin</b><small>Chỉ cán bộ có thẩm quyền được xem dữ liệu liên hệ.</small></span><span><Clock3/><b>Theo dõi tiến độ</b><small>Mỗi thay đổi trạng thái đều được ghi nhận theo thời gian.</small></span><span><FileSearch/><b>Kết quả đã phê duyệt</b><small>Kết quả xử lý được người có thẩm quyền phê duyệt trước khi hoàn tất.</small></span></div>
      </section>

      <section className="feedback-public-workspace" aria-label="Gửi và tra cứu phản ánh">
        <div className="feedback-tabs" role="tablist" aria-label="Chức năng phản ánh">
          <button ref={element=>{tabRefs.current[0]=element}} id="feedback-tab-send" role="tab" aria-controls="feedback-panel-send" aria-selected={tab==='send'} tabIndex={tab==='send'?0:-1} className={tab==='send'?'active':''} onClick={()=>selectTab('send')} onKeyDown={event=>handleTabKeyDown(event,0)}><Send/>Gửi phản ánh</button>
          <button ref={element=>{tabRefs.current[1]=element}} id="feedback-tab-track" role="tab" aria-controls="feedback-panel-track" aria-selected={tab==='track'} tabIndex={tab==='track'?0:-1} className={tab==='track'?'active':''} disabled={receiptUploadBusy} onClick={()=>selectTab('track')} onKeyDown={event=>handleTabKeyDown(event,1)}><FileSearch/>Tra cứu hồ sơ</button>
        </div>

        <div id="feedback-panel-send" role="tabpanel" aria-labelledby="feedback-tab-send" className="feedback-form-card" hidden={tab!=='send'}>
          {created?<div ref={receiptRef} className="feedback-receipt" role="status" tabIndex={-1}>
            <div className="feedback-success-icon"><CheckCircle2/></div>
            <span>ĐÃ TIẾP NHẬN PHẢN ÁNH</span><h2>Hãy lưu lại hai mã dưới đây</h2>
            <p>Mã bảo mật chỉ hiển thị một lần. Không gửi mã này cho người không có trách nhiệm xử lý.</p>
            <div className="feedback-receipt-grid"><div><small>Mã phản ánh</small><strong>{created.code}</strong></div><div><small>Mã bảo mật</small><strong>{created.lookupSecret}</strong></div></div>
            <div className="feedback-warning"><LockKeyhole/><span><b>Quan trọng:</b> nếu làm mất mã bảo mật, bạn sẽ không thể tự tra cứu hồ sơ trên cổng thông tin.</span></div>
            {uploadState==='uploading'&&<div className="feedback-upload-status" role="status"><RefreshCw className="spin"/><span><b>Đã tạo hồ sơ.</b> Đang tải {evidenceFiles.length} tệp minh chứng...</span></div>}
            {uploadState==='done'&&<div className="feedback-upload-status success"><CheckCircle2/><span><b>Đã lưu {uploadedAttachments.length} tệp minh chứng.</b> Tệp chỉ được mở qua mã bảo mật của hồ sơ.</span></div>}
            {uploadState==='failed'&&<div className="feedback-upload-status failed" role="alert"><AlertCircle/><span><b>Hồ sơ đã được tiếp nhận, nhưng tệp chưa tải lên.</b>{evidenceError&&<> {evidenceError}</>}</span><button type="button" disabled={creating} onClick={()=>void uploadEvidence(created,evidenceFiles,true)}><RefreshCw/>Thử tải tệp lại</button></div>}
            <div className="feedback-form-actions"><button className="feedback-btn secondary" type="button" onClick={copyReceipt}>{copied?<Check/>:<Clipboard/>}{copied?'Đã sao chép':'Sao chép hai mã'}</button><button className="feedback-btn primary" type="button" disabled={receiptUploadBusy} onClick={useReceipt}><Eye/>Tra cứu ngay</button></div>
            {copyError&&<div ref={copyErrorRef} className="feedback-alert error" role="alert" tabIndex={-1}><AlertCircle/>{copyError}</div>}
            {!confirmNewFeedback&&<button className="feedback-text-btn" type="button" disabled={receiptUploadBusy} onClick={()=>setConfirmNewFeedback(true)} aria-controls="feedback-new-confirm">Gửi phản ánh khác</button>}
            {confirmNewFeedback&&<>
              <div ref={newFeedbackConfirmRef} id="feedback-new-confirm" className="feedback-warning" role="alert" tabIndex={-1}><AlertCircle/><span><b>Bạn đã lưu hai mã chưa?</b> Mã bảo mật sẽ không hiển thị lại sau khi tạo phản ánh mới.</span></div>
              <div className="feedback-form-actions"><button className="feedback-btn secondary" type="button" onClick={()=>{setConfirmNewFeedback(false);selectTab('send',true)}}>Quay lại lưu mã</button><button className="feedback-btn primary" type="button" disabled={receiptUploadBusy} onClick={startAnotherFeedback}>Đã lưu mã, tạo phản ánh mới</button></div>
            </>}
          </div>:<>
            <div className="feedback-card-heading"><span>01</span><div><h2>Nội dung phản ánh</h2><p>Cung cấp thông tin cụ thể để đơn vị chuyên môn xác minh nhanh hơn.</p></div></div>
            {createError&&<div ref={createErrorRef} className="feedback-alert error" role="alert" tabIndex={-1}><AlertCircle/>{createError}</div>}
            <form className="feedback-public-form" onSubmit={submitFeedback} aria-busy={creating}>
              <label className="full">Nhóm vấn đề<select required value={createForm.category} onChange={event=>setCreateForm({...createForm,category:event.target.value as FeedbackCategory})}>{categories.map(category=><option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
              <label className="full">Tiêu đề ngắn gọn<input required minLength={8} maxLength={200} value={createForm.title} onChange={event=>setCreateForm({...createForm,title:event.target.value})} placeholder="Ví dụ: Đèn chiếu sáng hỏng tại đường..."/></label>
              <label className="full">Mô tả chi tiết<textarea required minLength={20} maxLength={5000} rows={6} value={createForm.content} onChange={event=>setCreateForm({...createForm,content:event.target.value})} placeholder="Nêu rõ vị trí, thời điểm và tình trạng cần xử lý..."/></label>
              <label className="full">Địa điểm xảy ra<input maxLength={500} value={createForm.address} onChange={event=>setCreateForm({...createForm,address:event.target.value})} placeholder="Số nhà, tên đường hoặc khu phố (nếu có)"/></label>
              <div className="feedback-evidence full">
                <div className="feedback-evidence-heading"><div><b>Tệp ảnh, tài liệu minh chứng</b><small>Không bắt buộc · tối đa 5 tệp · JPG, PNG, WEBP hoặc PDF · không quá 10 MB/tệp</small></div><span>{evidenceFiles.length}/{MAX_EVIDENCE_FILES}</span></div>
                <label className="feedback-visually-hidden" htmlFor="feedback-evidence-files">Chọn ảnh hoặc tài liệu minh chứng</label>
                <input id="feedback-evidence-files" ref={evidenceInputRef} className="feedback-file-input" type="file" multiple aria-describedby="feedback-evidence-help" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={chooseEvidence}/>
                <div
                  className={`feedback-dropzone${draggingEvidence?' dragging':''}`}
                  onDragEnter={event=>{event.preventDefault();setDraggingEvidence(true)}}
                  onDragOver={event=>event.preventDefault()}
                  onDragLeave={event=>{if(event.currentTarget===event.target)setDraggingEvidence(false)}}
                  onDrop={dropEvidence}
                >
                  <UploadCloud/><div><b>Kéo tệp vào đây</b><span>hoặc</span><button type="button" onClick={()=>evidenceInputRef.current?.click()}>Chọn tệp từ thiết bị</button></div>
                </div>
                {evidenceError&&<div className="feedback-file-error" role="alert"><AlertCircle/>{evidenceError}</div>}
                {evidenceFiles.length>0&&<ul className="feedback-file-list" aria-label="Tệp minh chứng đã chọn">{evidenceFiles.map(file=><li key={`${file.name}-${file.size}-${file.lastModified}`}>
                  {file.type==='application/pdf'?<FileText/>:<FileImage/>}
                  <span><b>{file.name}</b><small>{formatFileSize(file.size)}</small></span>
                  <button type="button" aria-label={`Bỏ tệp ${file.name}`} onClick={()=>{setEvidenceFiles(current=>current.filter(item=>item!==file));setEvidenceError('')}}><Trash2/></button>
                </li>)}</ul>}
                <p id="feedback-evidence-help" className="feedback-evidence-privacy"><ShieldCheck/>Không gửi giấy tờ tùy thân hoặc hình ảnh chứa dữ liệu riêng tư không cần thiết.</p>
              </div>
              <div className="feedback-form-divider full"><span>Thông tin để liên hệ xác minh</span></div>
              <label>Họ và tên<input required minLength={2} maxLength={160} autoComplete="name" value={createForm.submitterName} onChange={event=>setCreateForm({...createForm,submitterName:event.target.value})}/></label>
              <label>Số điện thoại<input required inputMode="tel" autoComplete="tel" pattern="[0-9+().\-\s]{9,24}" value={createForm.submitterPhone} onChange={event=>setCreateForm({...createForm,submitterPhone:event.target.value})}/></label>
              <label>Email<input type="email" required={createForm.preferredContact==='EMAIL'} autoComplete="email" maxLength={180} value={createForm.submitterEmail} onChange={event=>setCreateForm({...createForm,submitterEmail:event.target.value})}/></label>
              <label>Kênh cán bộ ưu tiên liên hệ<select value={createForm.preferredContact} onChange={event=>setCreateForm({...createForm,preferredContact:event.target.value as 'PHONE'|'EMAIL'})}><option value="PHONE">Điện thoại</option><option value="EMAIL">Email và thông báo tiến độ</option></select><small>Nếu chọn Email, hệ thống sẽ gửi thông báo khi tiếp nhận và khi hồ sơ có cập nhật xử lý.</small></label>
              <label className="feedback-check full"><input required type="checkbox" checked={createForm.scopeConfirmed} onChange={event=>setCreateForm({...createForm,scopeConfirmed:event.target.checked})}/><span>Tôi xác nhận đây là phản ánh dân sinh; không phải hồ sơ khiếu nại, tố cáo hoặc nội dung khẩn cấp cần gọi cơ quan chức năng.</span></label>
              <label className="feedback-check full"><input required type="checkbox" checked={createForm.consent} onChange={event=>setCreateForm({...createForm,consent:event.target.checked})}/><span>Tôi đồng ý để cơ quan tiếp nhận xử lý thông tin cá nhân cho mục đích xác minh và phản hồi nội dung này.</span></label>
              <div className="feedback-scope-note full"><ShieldCheck/><span>Nếu có nguy hiểm tức thời, hãy liên hệ trực tiếp cơ quan chức năng. Kênh này không thay thế dịch vụ khẩn cấp.</span></div>
              <div className="feedback-form-actions full"><button className="feedback-btn primary" disabled={creating}>{creating?<><RefreshCw className="spin"/>Đang gửi...</>:<><Send/>Gửi phản ánh</>}</button></div>
            </form>
          </>}
        </div>

        <div id="feedback-panel-track" role="tabpanel" aria-labelledby="feedback-tab-track" className="feedback-track-layout" hidden={tab!=='track'}>
          <div className="feedback-form-card compact-card">
            <div className="feedback-card-heading"><span>02</span><div><h2>Tra cứu hồ sơ</h2><p>Nhập đúng hai mã đã nhận khi gửi phản ánh.</p></div></div>
            <form className="feedback-public-form single" onSubmit={track} aria-busy={tracking}>
              <label className="full">Mã phản ánh<input required minLength={8} maxLength={30} autoCapitalize="characters" value={credentials.code} onChange={event=>setCredentials({...credentials,code:event.target.value.toUpperCase()})} placeholder="PA-2026-..."/></label>
              <label className="full">Mã bảo mật<div className="feedback-secret-input"><KeyRound/><input required minLength={20} maxLength={64} type="password" autoComplete="off" value={credentials.lookupSecret} onChange={event=>setCredentials({...credentials,lookupSecret:event.target.value})}/></div></label>
              {trackError&&<div ref={trackErrorRef} className="feedback-alert error full" role="alert" tabIndex={-1}><AlertCircle/>{trackError}</div>}
              <button className="feedback-btn primary full" disabled={tracking}>{tracking?<><RefreshCw className="spin"/>Đang kiểm tra...</>:<><FileSearch/>Tra cứu tiến độ</>}</button>
            </form>
            <div className="feedback-privacy-note"><LockKeyhole/><span>Hệ thống không xác nhận mã phản ánh nếu mã bảo mật không đúng, nhằm tránh dò tìm thông tin.</span></div>
          </div>

          {detail&&<article className="feedback-public-detail" aria-live="polite" aria-busy={actionLoading||supplementalUploading}>
            <div className="feedback-detail-title"><div><span>{detail.code}</span><h2>{detail.title}</h2></div><span className={`feedback-status ${detail.status.toLowerCase()}`}>{statusLabels[detail.status]}</span></div>
            <div className="feedback-detail-meta"><span><small>Tiếp nhận</small><b>{formatDate(detail.createdAt)}</b></span><span><small>Đơn vị xử lý</small><b>{detail.departmentName||'Đang phân công'}</b></span><span><small>{detail.status==='WAITING_CITIZEN'?'Hạn bổ sung thông tin':detail.firstResponseAt?'Hạn xử lý':'Hạn phản hồi'}</small><b>{formatDate(publicDeadline(detail))}</b></span></div>
            <section><h3>Nội dung đã gửi</h3><p className="feedback-content-text">{detail.content}</p>{detail.address&&<p className="feedback-address"><b>Địa điểm:</b> {detail.address}</p>}</section>
            {(detail.attachments.length>0||canAddAttachments)&&<section><h3>Ảnh và tài liệu minh chứng <span className="feedback-section-count">{detail.attachments.length}/{MAX_EVIDENCE_FILES}</span></h3><p className="feedback-attachment-note"><LockKeyhole/>Tệp được bảo vệ và chỉ mở sau khi hệ thống xác thực mã bảo mật.</p>
              {detail.attachments.length>0?<div className="feedback-attachment-list">{detail.attachments.map(item=><article key={item.id}>
                <span className="feedback-attachment-icon">{item.mimeType==='application/pdf'?<FileText/>:<FileImage/>}</span>
                <span><b>{item.originalName}</b><small>{item.mimeType==='application/pdf'?'Tài liệu PDF':'Tệp hình ảnh'} · {formatFileSize(item.size)} · tải lên {formatDate(item.createdAt)}</small></span>
                <span className="feedback-attachment-actions"><button type="button" disabled={attachmentLoading?.startsWith(item.id)} onClick={()=>void openAttachment(item)}>{attachmentLoading===`${item.id}:view`?<RefreshCw className="spin"/>:<Eye/>}{attachmentLoading===`${item.id}:view`?'Đang mở':'Xem'}</button><button type="button" disabled={attachmentLoading?.startsWith(item.id)} onClick={()=>void openAttachment(item,true)}>{attachmentLoading===`${item.id}:download`?<RefreshCw className="spin"/>:<FileText/>}{attachmentLoading===`${item.id}:download`?'Đang tải':'Tải xuống'}</button></span>
              </article>)}</div>:<p className="feedback-no-attachments">Chưa có tệp minh chứng nào trong hồ sơ.</p>}
              {attachmentError&&<div className="feedback-alert error" role="alert"><AlertCircle/>{attachmentError}</div>}
              {canAddAttachments&&remainingAttachmentSlots>0&&<form className="feedback-supplemental-upload" onSubmit={uploadSupplementalEvidence} aria-busy={supplementalUploading}>
                <div><b>Bổ sung minh chứng</b><small>Có thể tải thêm {remainingAttachmentSlots} tệp trong khi hồ sơ đang được xử lý.</small></div>
                <label className="feedback-visually-hidden" htmlFor="feedback-supplemental-files">Chọn tệp minh chứng bổ sung</label>
                <input id="feedback-supplemental-files" ref={supplementalEvidenceInputRef} className="feedback-file-input" type="file" multiple aria-describedby="feedback-supplemental-help" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={chooseSupplementalEvidence}/>
                <div className={`feedback-dropzone compact${draggingSupplemental?' dragging':''}`} onDragEnter={event=>{event.preventDefault();setDraggingSupplemental(true)}} onDragOver={event=>event.preventDefault()} onDragLeave={()=>setDraggingSupplemental(false)} onDrop={event=>{event.preventDefault();setDraggingSupplemental(false);addSupplementalFiles(Array.from(event.dataTransfer.files||[]))}}>
                  <UploadCloud/><div><b>Kéo tệp vào đây</b><span>hoặc</span><button type="button" disabled={supplementalUploading} onClick={()=>supplementalEvidenceInputRef.current?.click()}>Chọn tệp</button></div>
                </div>
                {supplementalFiles.length>0&&<ul className="feedback-file-list" aria-label="Tệp bổ sung đã chọn">{supplementalFiles.map(file=><li key={`${file.name}-${file.size}-${file.lastModified}`}>
                  {file.type==='application/pdf'?<FileText/>:<FileImage/>}<span><b>{file.name}</b><small>{formatFileSize(file.size)}</small></span><button type="button" disabled={supplementalUploading} aria-label={`Bỏ tệp ${file.name}`} onClick={()=>{setSupplementalFiles(current=>current.filter(item=>item!==file));setSupplementalError('')}}><Trash2/></button>
                </li>)}</ul>}
                <p id="feedback-supplemental-help" className="feedback-evidence-privacy"><ShieldCheck/>JPG, PNG, WEBP hoặc PDF; tối đa 10 MB mỗi tệp.</p>
                {supplementalError&&<div className="feedback-file-error" role="alert"><AlertCircle/>{supplementalError}</div>}
                <button className="feedback-btn secondary" disabled={supplementalUploading||!supplementalFiles.length}>{supplementalUploading?<><RefreshCw className="spin"/>Đang tải...</>:<><UploadCloud/>Tải minh chứng</>}</button>
              </form>}
            </section>}
            {detail.resolutionSummary&&<section className="feedback-result-box"><CheckCircle2/><div><h3>Kết quả xử lý</h3><p>{detail.resolutionSummary}</p></div></section>}
            {detail.rejectionReason&&<section className="feedback-result-box rejected"><AlertCircle/><div><h3>Lý do không tiếp nhận</h3><p>{detail.rejectionReason}</p></div></section>}
            {detail.reopenRequestedAt&&<section className="feedback-result-box pending"><Clock3/><div><h3>Đề nghị xem xét lại đang chờ duyệt</h3><p>Đã gửi lúc {formatDate(detail.reopenRequestedAt)}. Kết quả hiện tại vẫn có hiệu lực cho đến khi người có thẩm quyền chấp nhận mở lại hồ sơ.</p></div></section>}
            {!detail.reopenRequestedAt&&['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&detail.reopenRequestDecision==='REJECTED'&&<section className="feedback-result-box rejected"><AlertCircle/><div><h3>Đề nghị xem xét lại chưa được chấp nhận</h3><p>{detail.reopenRequestDecisionNote||'Vui lòng liên hệ cơ quan tiếp nhận nếu cần được hướng dẫn thêm.'}</p></div></section>}
            {!detail.reopenRequestedAt&&['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&(detail.reopenRequestCount??0)<3&&!appealWindowOpen&&<section className="feedback-result-box pending"><Clock3/><div><h3>Đã hết thời hạn đề nghị xem xét lại</h3><p>Thời hạn gửi đề nghị là 30 ngày kể từ kết quả hoặc quyết định gần nhất.</p></div></section>}
            <section><h3>Tiến trình hồ sơ</h3><div className="feedback-public-timeline">{detail.events.map((event,index)=><div key={`${event.createdAt}:${event.action}:${index}`}><i/><span><b>{eventLabels[event.action]||'Hồ sơ được cập nhật'}</b><small>{formatDate(event.createdAt)}</small></span></div>)}</div></section>
            {detail.messages.length>0&&<section><h3>Trao đổi công khai</h3><div className="feedback-message-list">{detail.messages.map((item,index)=><div key={`${item.createdAt}:${item.authorName}:${index}`}><div><b>{item.authorName}</b><time>{formatDate(item.createdAt)}</time></div><p>{item.body}</p></div>)}</div></section>}
            {detail.rating&&<div className="feedback-rating-result"><Star/><span><b>{detail.rating}/5 điểm</b>{detail.ratingComment&&<small>{detail.ratingComment}</small>}</span></div>}
            {actionError&&<div ref={actionErrorRef} className="feedback-alert error" role="alert" tabIndex={-1}><AlertCircle/>{actionError}</div>}

            {(canMessage||canRate||canReopen)&&<div className="feedback-citizen-actions">
              {canMessage&&<button type="button" disabled={actionLoading} onClick={()=>{setActionError('');setAction(action==='message'?null:'message')}}><MessageCircleMore/>Bổ sung thông tin</button>}
              {canRate&&<button type="button" disabled={actionLoading} onClick={()=>{setActionError('');setAction(action==='rating'?null:'rating')}}><Star/>Đánh giá kết quả</button>}
              {canReopen&&<button type="button" disabled={actionLoading} onClick={()=>{setActionError('');setAction(action==='reopen'?null:'reopen')}}><RotateCcw/>Đề nghị xem xét lại</button>}
            </div>}
            {action==='message'&&<form className="feedback-inline-form" aria-busy={actionLoading} onSubmit={event=>citizenAction('message',event)}><label>Thông tin bổ sung<textarea required minLength={3} maxLength={3000} rows={4} value={message} onChange={event=>setMessage(event.target.value)}/></label><button className="feedback-btn primary" disabled={actionLoading}>{actionLoading?<><RefreshCw className="spin"/>Đang gửi...</>:<><Send/>Gửi bổ sung</>}</button></form>}
            {action==='rating'&&<form className="feedback-inline-form" aria-busy={actionLoading} onSubmit={event=>citizenAction('rating',event)}><label>Mức hài lòng<select value={rating} onChange={event=>setRating(Number(event.target.value))}>{[5,4,3,2,1].map(value=><option key={value} value={value}>{value}/5 - {value>=4?'Hài lòng':value===3?'Bình thường':'Chưa hài lòng'}</option>)}</select></label><label>Nhận xét<textarea maxLength={1000} rows={3} value={ratingComment} onChange={event=>setRatingComment(event.target.value)}/></label><button className="feedback-btn primary" disabled={actionLoading}>{actionLoading?<><RefreshCw className="spin"/>Đang gửi...</>:<><Star/>Gửi đánh giá</>}</button></form>}
            {action==='reopen'&&<form className="feedback-inline-form" aria-busy={actionLoading} onSubmit={event=>citizenAction('reopen',event)}><label>Lý do cần xem xét lại<textarea required minLength={10} maxLength={2000} rows={4} value={reopenReason} onChange={event=>setReopenReason(event.target.value)}/></label><button className="feedback-btn secondary" disabled={actionLoading}>{actionLoading?<><RefreshCw className="spin"/>Đang gửi...</>:<><RotateCcw/>Gửi đề nghị</>}</button></form>}
          </article>}
        </div>
      </section>
    </main>

    <footer className="feedback-public-footer"><span>© {currentVietnamYear()} UBND Phường Lái Thiêu</span><Link to="/">Cổng thông tin điều hành</Link><Link to="/admin/login">Không gian nội bộ</Link></footer>
  </div>;
}
