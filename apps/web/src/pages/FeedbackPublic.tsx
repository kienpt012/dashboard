import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  Eye,
  FileSearch,
  KeyRound,
  LockKeyhole,
  MessageCircleMore,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { currentVietnamYear } from '../date';
import type {
  FeedbackCategory,
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
  FEEDBACK_ASSIGNED:'Đã phân công đơn vị xử lý',
  FEEDBACK_STARTED:'Bắt đầu xử lý',
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
};

const emptyCreate={
  title:'',content:'',category:'INFRASTRUCTURE' as FeedbackCategory,submitterName:'',submitterPhone:'',
  submitterEmail:'',address:'',preferredContact:'PHONE' as 'PHONE'|'EMAIL',consent:false,scopeConfirmed:false,
};

const PENDING_SUBMISSION_KEY='ioc-feedback-pending-submission';
type PendingSubmission={clientSubmissionId:string;lookupSecret:string;createdAt:number};

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

export default function FeedbackPublic(){
  const [tab,setTab]=useState<'send'|'track'>('send');
  const [createForm,setCreateForm]=useState(emptyCreate);
  const [creating,setCreating]=useState(false);
  const [created,setCreated]=useState<PublicFeedbackCreated|null>(null);
  const [pendingSubmission,setPendingSubmission]=useState<PendingSubmission|null>(restoredPendingSubmission);
  const [createError,setCreateError]=useState('');
  const [copied,setCopied]=useState(false);
  const [credentials,setCredentials]=useState({code:'',lookupSecret:''});
  const [detail,setDetail]=useState<PublicFeedbackDetail|null>(null);
  const [tracking,setTracking]=useState(false);
  const [trackError,setTrackError]=useState('');
  const [message,setMessage]=useState('');
  const [reopenReason,setReopenReason]=useState('');
  const [rating,setRating]=useState(5);
  const [ratingComment,setRatingComment]=useState('');
  const [action,setAction]=useState<'message'|'rating'|'reopen'|null>(null);

  async function submitFeedback(event:FormEvent){
    event.preventDefault();setCreating(true);setCreateError('');setCreated(null);
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
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(reason){setCreateError(getError(reason,'Không thể gửi phản ánh. Vui lòng thử lại.'))}
    finally{setCreating(false)}
  }

  async function copyReceipt(){
    if(!created)return;
    const receipt=`Mã phản ánh: ${created.code}\nMã bảo mật: ${created.lookupSecret}`;
    try{await navigator.clipboard.writeText(receipt);setCopied(true)}catch{setCopied(false)}
  }

  function useReceipt(){
    if(!created)return;
    setCredentials({code:created.code,lookupSecret:created.lookupSecret});
    setDetail(null);setTrackError('');setTab('track');
  }

  async function track(event?:FormEvent){
    event?.preventDefault();setTracking(true);setTrackError('');setDetail(null);setAction(null);
    try{
      const result=await api<PublicFeedbackDetail>('/public/feedbacks/track',{
        method:'POST',body:JSON.stringify({code:credentials.code.trim(),lookupSecret:credentials.lookupSecret.trim()}),
      });
      setDetail(result);
    }catch(reason){setTrackError(getError(reason,'Không thể tra cứu hồ sơ.'))}
    finally{setTracking(false)}
  }

  async function citizenAction(kind:'message'|'rating'|'reopen',event:FormEvent){
    event.preventDefault();
    if(!detail)return;
    setTracking(true);setTrackError('');
    const common={lookupSecret:credentials.lookupSecret.trim(),expectedVersion:detail.version};
    const config=kind==='message'
      ?{path:`/public/feedbacks/${encodeURIComponent(detail.code)}/messages`,body:{...common,message}}
      :kind==='rating'
        ?{path:`/public/feedbacks/${encodeURIComponent(detail.code)}/rating`,body:{...common,rating,comment:ratingComment.trim()||undefined}}
        :{path:`/public/feedbacks/${encodeURIComponent(detail.code)}/reopen`,body:{...common,reason:reopenReason}};
    try{
      const result=await api<PublicFeedbackDetail>(config.path,{method:'POST',body:JSON.stringify(config.body)});
      setDetail(result);setAction(null);setMessage('');setRatingComment('');setReopenReason('');
    }catch(reason){setTrackError(getError(reason,'Không thể cập nhật hồ sơ.'))}
    finally{setTracking(false)}
  }

  const canMessage=detail&&['WAITING_CITIZEN','IN_PROGRESS','REOPENED'].includes(detail.status);
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
      <Link to="/" className="feedback-back"><ArrowLeft/>Về trang thông tin</Link>
    </header>

    <main className="feedback-public-main">
      <section className="feedback-public-intro">
        <div><span className="feedback-kicker"><MessageCircleMore/>KẾT NỐI VỚI CHÍNH QUYỀN</span><h1 aria-label="Gửi phản ánh, theo dõi rõ ràng.">Gửi phản ánh,<br/><em>theo dõi rõ ràng.</em></h1><p>Phản ánh vấn đề dân sinh tại địa bàn và tra cứu tiến độ bằng mã bảo mật riêng. Thông tin liên hệ chỉ phục vụ xác minh, không hiển thị công khai.</p></div>
        <div className="feedback-trust-list"><span><ShieldCheck/><b>Bảo vệ thông tin</b><small>Chỉ cán bộ có thẩm quyền được xem dữ liệu liên hệ.</small></span><span><Clock3/><b>Theo dõi tiến độ</b><small>Mỗi thay đổi trạng thái đều được ghi nhận theo thời gian.</small></span><span><FileSearch/><b>Kết quả kiểm duyệt</b><small>Phản hồi chính thức được lãnh đạo đơn vị phê duyệt.</small></span></div>
      </section>

      <section className="feedback-public-workspace" aria-label="Gửi và tra cứu phản ánh">
        <div className="feedback-tabs" role="tablist" aria-label="Chức năng phản ánh">
          <button role="tab" aria-selected={tab==='send'} className={tab==='send'?'active':''} onClick={()=>setTab('send')}><Send/>Gửi phản ánh</button>
          <button role="tab" aria-selected={tab==='track'} className={tab==='track'?'active':''} onClick={()=>setTab('track')}><FileSearch/>Tra cứu hồ sơ</button>
        </div>

        {tab==='send'&&<div className="feedback-form-card">
          {created?<div className="feedback-receipt" role="status">
            <div className="feedback-success-icon"><CheckCircle2/></div>
            <span>ĐÃ TIẾP NHẬN PHẢN ÁNH</span><h2>Hãy lưu lại hai mã dưới đây</h2>
            <p>Mã bảo mật chỉ hiển thị một lần. Không gửi mã này cho người không có trách nhiệm xử lý.</p>
            <div className="feedback-receipt-grid"><div><small>Mã phản ánh</small><strong>{created.code}</strong></div><div><small>Mã bảo mật</small><strong>{created.lookupSecret}</strong></div></div>
            <div className="feedback-warning"><LockKeyhole/><span><b>Quan trọng:</b> nếu làm mất mã bảo mật, bạn sẽ không thể tự tra cứu hồ sơ trên cổng thông tin.</span></div>
            <div className="feedback-form-actions"><button className="feedback-btn secondary" type="button" onClick={copyReceipt}>{copied?<Check/>:<Clipboard/>}{copied?'Đã sao chép':'Sao chép hai mã'}</button><button className="feedback-btn primary" type="button" onClick={useReceipt}><Eye/>Tra cứu ngay</button></div>
            <button className="feedback-text-btn" type="button" onClick={()=>setCreated(null)}>Gửi phản ánh khác</button>
          </div>:<>
            <div className="feedback-card-heading"><span>01</span><div><h2>Nội dung phản ánh</h2><p>Cung cấp thông tin cụ thể để đơn vị chuyên môn xác minh nhanh hơn.</p></div></div>
            {createError&&<div className="feedback-alert error" role="alert"><AlertCircle/>{createError}</div>}
            <form className="feedback-public-form" onSubmit={submitFeedback}>
              <label className="full">Nhóm vấn đề<select required value={createForm.category} onChange={event=>setCreateForm({...createForm,category:event.target.value as FeedbackCategory})}>{categories.map(category=><option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
              <label className="full">Tiêu đề ngắn gọn<input required minLength={8} maxLength={200} value={createForm.title} onChange={event=>setCreateForm({...createForm,title:event.target.value})} placeholder="Ví dụ: Đèn chiếu sáng hỏng tại đường..."/></label>
              <label className="full">Mô tả chi tiết<textarea required minLength={20} maxLength={5000} rows={6} value={createForm.content} onChange={event=>setCreateForm({...createForm,content:event.target.value})} placeholder="Nêu rõ vị trí, thời điểm và tình trạng cần xử lý..."/></label>
              <label className="full">Địa điểm xảy ra<input maxLength={500} value={createForm.address} onChange={event=>setCreateForm({...createForm,address:event.target.value})} placeholder="Số nhà, tên đường hoặc khu phố (nếu có)"/></label>
              <div className="feedback-form-divider full"><span>Thông tin để liên hệ xác minh</span></div>
              <label>Họ và tên<input required minLength={2} maxLength={160} autoComplete="name" value={createForm.submitterName} onChange={event=>setCreateForm({...createForm,submitterName:event.target.value})}/></label>
              <label>Số điện thoại<input required inputMode="tel" autoComplete="tel" pattern="[0-9+().\-\s]{9,24}" value={createForm.submitterPhone} onChange={event=>setCreateForm({...createForm,submitterPhone:event.target.value})}/></label>
              <label>Email<input type="email" required={createForm.preferredContact==='EMAIL'} autoComplete="email" maxLength={180} value={createForm.submitterEmail} onChange={event=>setCreateForm({...createForm,submitterEmail:event.target.value})}/></label>
              <label>Kênh cán bộ ưu tiên liên hệ<select value={createForm.preferredContact} onChange={event=>setCreateForm({...createForm,preferredContact:event.target.value as 'PHONE'|'EMAIL'})}><option value="PHONE">Điện thoại</option><option value="EMAIL">Email</option></select><small>Cán bộ sẽ chủ động liên hệ khi cần; cổng hiện không gửi email tự động.</small></label>
              <label className="feedback-check full"><input required type="checkbox" checked={createForm.scopeConfirmed} onChange={event=>setCreateForm({...createForm,scopeConfirmed:event.target.checked})}/><span>Tôi xác nhận đây là phản ánh dân sinh; không phải hồ sơ khiếu nại, tố cáo hoặc nội dung khẩn cấp cần gọi cơ quan chức năng.</span></label>
              <label className="feedback-check full"><input required type="checkbox" checked={createForm.consent} onChange={event=>setCreateForm({...createForm,consent:event.target.checked})}/><span>Tôi đồng ý để cơ quan tiếp nhận xử lý thông tin cá nhân cho mục đích xác minh và phản hồi nội dung này.</span></label>
              <div className="feedback-scope-note full"><ShieldCheck/><span>Nếu có nguy hiểm tức thời, hãy liên hệ trực tiếp cơ quan chức năng. Kênh này không thay thế dịch vụ khẩn cấp.</span></div>
              <div className="feedback-form-actions full"><button className="feedback-btn primary" disabled={creating}>{creating?<><RefreshCw className="spin"/>Đang gửi...</>:<><Send/>Gửi phản ánh</>}</button></div>
            </form>
          </>}
        </div>}

        {tab==='track'&&<div className="feedback-track-layout">
          <div className="feedback-form-card compact-card">
            <div className="feedback-card-heading"><span>02</span><div><h2>Tra cứu hồ sơ</h2><p>Nhập đúng hai mã đã nhận khi gửi phản ánh.</p></div></div>
            <form className="feedback-public-form single" onSubmit={track}>
              <label className="full">Mã phản ánh<input required minLength={8} maxLength={30} autoCapitalize="characters" value={credentials.code} onChange={event=>setCredentials({...credentials,code:event.target.value.toUpperCase()})} placeholder="PA-2026-..."/></label>
              <label className="full">Mã bảo mật<div className="feedback-secret-input"><KeyRound/><input required minLength={8} maxLength={40} type="password" autoComplete="off" value={credentials.lookupSecret} onChange={event=>setCredentials({...credentials,lookupSecret:event.target.value})}/></div></label>
              {trackError&&<div className="feedback-alert error full" role="alert"><AlertCircle/>{trackError}</div>}
              <button className="feedback-btn primary full" disabled={tracking}>{tracking?<><RefreshCw className="spin"/>Đang kiểm tra...</>:<><FileSearch/>Tra cứu tiến độ</>}</button>
            </form>
            <div className="feedback-privacy-note"><LockKeyhole/><span>Hệ thống không xác nhận mã phản ánh nếu mã bảo mật không đúng, nhằm tránh dò tìm thông tin.</span></div>
          </div>

          {detail&&<article className="feedback-public-detail" aria-live="polite">
            <div className="feedback-detail-title"><div><span>{detail.code}</span><h2>{detail.title}</h2></div><span className={`feedback-status ${detail.status.toLowerCase()}`}>{statusLabels[detail.status]}</span></div>
            <div className="feedback-detail-meta"><span><small>Tiếp nhận</small><b>{formatDate(detail.createdAt)}</b></span><span><small>Đơn vị xử lý</small><b>{detail.departmentName||'Đang phân công'}</b></span><span><small>{detail.status==='WAITING_CITIZEN'?'Hạn bổ sung thông tin':detail.firstResponseAt?'Hạn xử lý':'Hạn phản hồi'}</small><b>{formatDate(publicDeadline(detail))}</b></span></div>
            <section><h3>Nội dung đã gửi</h3><p className="feedback-content-text">{detail.content}</p>{detail.address&&<p className="feedback-address"><b>Địa điểm:</b> {detail.address}</p>}</section>
            {detail.resolutionSummary&&<section className="feedback-result-box"><CheckCircle2/><div><h3>Kết quả xử lý</h3><p>{detail.resolutionSummary}</p></div></section>}
            {detail.rejectionReason&&<section className="feedback-result-box rejected"><AlertCircle/><div><h3>Lý do không tiếp nhận</h3><p>{detail.rejectionReason}</p></div></section>}
            {detail.reopenRequestedAt&&<section className="feedback-result-box pending"><Clock3/><div><h3>Đề nghị xem xét lại đang chờ duyệt</h3><p>Đã gửi lúc {formatDate(detail.reopenRequestedAt)}. Kết quả hiện tại vẫn có hiệu lực cho đến khi người có thẩm quyền chấp nhận mở lại hồ sơ.</p></div></section>}
            {!detail.reopenRequestedAt&&['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&detail.reopenRequestDecision==='REJECTED'&&<section className="feedback-result-box rejected"><AlertCircle/><div><h3>Đề nghị xem xét lại chưa được chấp nhận</h3><p>{detail.reopenRequestDecisionNote||'Vui lòng liên hệ cơ quan tiếp nhận nếu cần được hướng dẫn thêm.'}</p></div></section>}
            {!detail.reopenRequestedAt&&['RESOLVED','CLOSED','REJECTED'].includes(detail.status)&&(detail.reopenRequestCount??0)<3&&!appealWindowOpen&&<section className="feedback-result-box pending"><Clock3/><div><h3>Đã hết thời hạn đề nghị xem xét lại</h3><p>Thời hạn gửi đề nghị là 30 ngày kể từ kết quả hoặc quyết định gần nhất.</p></div></section>}
            <section><h3>Tiến trình hồ sơ</h3><div className="feedback-public-timeline">{detail.events.map(event=><div key={event.id}><i/><span><b>{eventLabels[event.action]||'Hồ sơ được cập nhật'}</b><small>{formatDate(event.createdAt)}</small></span></div>)}</div></section>
            {detail.messages.length>0&&<section><h3>Trao đổi công khai</h3><div className="feedback-message-list">{detail.messages.map(item=><div key={item.id}><div><b>{item.authorName}</b><time>{formatDate(item.createdAt)}</time></div><p>{item.body}</p></div>)}</div></section>}
            {detail.rating&&<div className="feedback-rating-result"><Star/><span><b>{detail.rating}/5 điểm</b>{detail.ratingComment&&<small>{detail.ratingComment}</small>}</span></div>}
            {trackError&&<div className="feedback-alert error" role="alert"><AlertCircle/>{trackError}</div>}

            {(canMessage||canRate||canReopen)&&<div className="feedback-citizen-actions">
              {canMessage&&<button type="button" onClick={()=>setAction(action==='message'?null:'message')}><MessageCircleMore/>Bổ sung thông tin</button>}
              {canRate&&<button type="button" onClick={()=>setAction(action==='rating'?null:'rating')}><Star/>Đánh giá kết quả</button>}
              {canReopen&&<button type="button" onClick={()=>setAction(action==='reopen'?null:'reopen')}><RotateCcw/>Đề nghị xem xét lại</button>}
            </div>}
            {action==='message'&&<form className="feedback-inline-form" onSubmit={event=>citizenAction('message',event)}><label>Thông tin bổ sung<textarea required minLength={3} maxLength={3000} rows={4} value={message} onChange={event=>setMessage(event.target.value)}/></label><button className="feedback-btn primary" disabled={tracking}><Send/>Gửi bổ sung</button></form>}
            {action==='rating'&&<form className="feedback-inline-form" onSubmit={event=>citizenAction('rating',event)}><label>Mức hài lòng<select value={rating} onChange={event=>setRating(Number(event.target.value))}>{[5,4,3,2,1].map(value=><option key={value} value={value}>{value}/5 - {value>=4?'Hài lòng':value===3?'Bình thường':'Chưa hài lòng'}</option>)}</select></label><label>Nhận xét<textarea maxLength={1000} rows={3} value={ratingComment} onChange={event=>setRatingComment(event.target.value)}/></label><button className="feedback-btn primary" disabled={tracking}><Star/>Gửi đánh giá</button></form>}
            {action==='reopen'&&<form className="feedback-inline-form" onSubmit={event=>citizenAction('reopen',event)}><label>Lý do cần xem xét lại<textarea required minLength={10} maxLength={2000} rows={4} value={reopenReason} onChange={event=>setReopenReason(event.target.value)}/></label><button className="feedback-btn secondary" disabled={tracking}><RotateCcw/>Gửi đề nghị</button></form>}
          </article>}
        </div>}
      </section>
    </main>

    <footer className="feedback-public-footer"><span>© {currentVietnamYear()} UBND Phường Lái Thiêu</span><Link to="/">Cổng thông tin điều hành</Link><Link to="/admin/login">Không gian nội bộ</Link></footer>
  </div>;
}
