import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  BadgeCheck,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  MessageCircleMore,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import ScrollProgress from '../components/ScrollProgress';
import { toast } from '../components/Toast';
import { Skeleton } from '../components/UI';
import { currentVietnamYear } from '../date';
import { Reveal } from '../components/Motion';
import type { FeedbackCategory, PublishedFeedbackDetail as PublishedFeedbackDetailType } from '../types';
import '../styles/public-site.css';

const categoryLabels:Record<FeedbackCategory,string>={
  INFRASTRUCTURE:'Hạ tầng đô thị',
  ENVIRONMENT:'Môi trường',
  ADMINISTRATIVE_PROCEDURE:'Thủ tục hành chính',
  SECURITY_ORDER:'An ninh trật tự',
  SOCIAL_WELFARE:'An sinh xã hội',
  CULTURE_EDUCATION:'Văn hóa - giáo dục',
  OTHER:'Nội dung khác',
};

const eventLabels:Record<string,string>={
  CREATED:'Phản ánh được tiếp nhận',
  CITIZEN_ATTACHMENTS_ADDED:'Người dân bổ sung tệp minh chứng',
  FEEDBACK_TRIAGED:'Phản ánh được phân loại',
  FEEDBACK_ASSIGNED:'Chuyển đến đơn vị phụ trách',
  FEEDBACK_STARTED:'Đơn vị bắt đầu xử lý',
  CONTACT_ATTEMPT_LOGGED:'Đơn vị xử lý liên hệ xác minh',
  INFORMATION_REQUESTED:'Đề nghị người dân bổ sung thông tin',
  CITIZEN_MESSAGE_ADDED:'Người dân bổ sung thông tin',
  PUBLIC_MESSAGE_ADDED:'Đơn vị xử lý cập nhật phản hồi',
  FEEDBACK_SUBMITTED_FOR_REVIEW:'Kết quả được trình phê duyệt',
  RESOLUTION_APPROVED:'Kết quả xử lý được phê duyệt',
  RESOLUTION_RETURNED:'Kết quả được yêu cầu hoàn thiện',
  FEEDBACK_CLOSED:'Hoàn tất hồ sơ',
  FEEDBACK_CLOSED_NO_RESPONSE:'Kết thúc do quá hạn bổ sung thông tin',
  FEEDBACK_REJECTED:'Phản ánh được xác định ngoài phạm vi tiếp nhận',
  FEEDBACK_REOPENED:'Hồ sơ được xem xét lại',
  CITIZEN_REOPEN_REQUESTED:'Người dân đề nghị xem xét lại',
  CITIZEN_REOPEN_REQUEST_APPROVED:'Đề nghị xem xét lại được chấp nhận',
  CITIZEN_REOPEN_REQUEST_REJECTED:'Đề nghị xem xét lại đã được phản hồi',
  CITIZEN_RATED:'Người dân đánh giá kết quả',
  FEEDBACK_PUBLISHED:'Kết quả được công khai',
  FEEDBACK_UNPUBLISHED:'Kết quả từng được tạm gỡ khỏi trang công khai',
};

function formatDate(value?:string|null,includeTime=false){
  if(!value)return 'Chưa cập nhật';
  return new Date(value).toLocaleString('vi-VN',{
    dateStyle:'long',
    ...(includeTime?{timeStyle:'short' as const}:{}),
    timeZone:'Asia/Ho_Chi_Minh',
  });
}

export default function PublishedFeedbackDetail(){
  const {code=''}=useParams();
  const [detail,setDetail]=useState<PublishedFeedbackDetailType|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [atTop,setAtTop]=useState(true);
  const requestIdRef=useRef(0);
  const titleRef=useRef<HTMLHeadingElement|null>(null);

  async function load(signal?:AbortSignal){
    const requestId=++requestIdRef.current;
    setLoading(true);setError('');
    try{
      const result=await api<PublishedFeedbackDetailType>(`/public/feedbacks/published/${encodeURIComponent(code)}`,{signal});
      if(requestId!==requestIdRef.current)return null;
      setDetail(result);
      return true;
    }catch(reason){
      if(signal?.aborted||requestId!==requestIdRef.current)return null;
      setDetail(null);
      setError(reason instanceof Error?reason.message:'Không thể tải phản ánh công khai.');
      return false;
    }finally{if(requestId===requestIdRef.current)setLoading(false)}
  }

  /* Chỉ báo kết quả cho lần người dùng chủ động tải lại — lần tải đầu im lặng. */
  async function retry(){
    const result=await load();
    if(result===true)toast.ok('Đã tải lại kết quả công khai');
    else if(result===false)toast.error('Chưa thể tải lại kết quả công khai');
  }

  useEffect(()=>{
    const controller=new AbortController();
    window.scrollTo({top:0,behavior:'auto'});
    void load(controller.signal);
    return()=>{controller.abort();requestIdRef.current+=1};
  },[code]);

  useEffect(()=>{
    if(!detail)return;
    requestAnimationFrame(()=>titleRef.current?.focus({preventScroll:true}));
  },[detail]);

  /* Nút "về đầu trang" hiện sau khi cuộn ~600px. */
  useEffect(()=>{
    let frame=0;
    const measure=()=>{frame=0;setAtTop(window.scrollY<600)};
    const schedule=()=>{if(!frame)frame=window.requestAnimationFrame(measure)};
    window.addEventListener('scroll',schedule,{passive:true});
    measure();
    return()=>{if(frame)window.cancelAnimationFrame(frame);window.removeEventListener('scroll',schedule)};
  },[]);

  function scrollToTop(){
    const still=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({top:0,behavior:still?'auto':'smooth'});
  }

  return <div className="published-detail-page">
    <ScrollProgress/>

    <header className="published-detail-header">
      <Link to="/" className="public-brand"><div className="brand-mark">LT</div><div><strong>PHƯỜNG LÁI THIÊU</strong><span>Cổng thông tin điều hành số</span></div></Link>
      <Link to="/#ket-qua-phan-anh" className="published-detail-back"><ArrowLeft/>Danh sách kết quả</Link>
    </header>

    <main className="published-detail-main">
      <nav className="published-breadcrumb" aria-label="Đường dẫn">
        <Link to="/">Trang chủ</Link><span>/</span>
        <Link to="/#ket-qua-phan-anh">Phản ánh công khai</Link><span>/</span>
        <b>{detail?.code||code}</b>
      </nav>

      {loading
        ? <div className="published-detail-state" role="status" aria-label="Đang tải toàn bộ quá trình xử lý">
          <Skeleton className="published-detail-skeleton-hero"/>
          <Skeleton className="published-detail-skeleton-body"/>
        </div>
        : error
          ? <div className="alert bad public-alert" role="alert">
            <AlertCircle/>
            <p><b>Chưa thể mở kết quả này.</b> {error}</p>
            <button type="button" className="btn secondary compact" onClick={()=>void retry()}>Thử tải lại</button>
          </div>
          : detail&&<>
            <Reveal asChild><article className="published-detail-hero">
              <div>
                <span className="published-detail-kicker"><BadgeCheck/>KẾT QUẢ ĐÃ PHÊ DUYỆT VÀ CÔNG BỐ</span>
                <h1 ref={titleRef} tabIndex={-1}>{detail.title}</h1>
                <p className="published-detail-code">{detail.code}</p>
              </div>
              <div className="published-detail-summary">
                <div><Building2/><span><small>Đơn vị xử lý</small><b>{detail.departmentName||'UBND Phường Lái Thiêu'}</b></span></div>
                <div><FileText/><span><small>Nhóm vấn đề</small><b>{categoryLabels[detail.category]||'Nội dung khác'}</b></span></div>
                <div><CalendarDays/><span><small>Công khai ngày</small><b>{formatDate(detail.publishedAt)}</b></span></div>
              </div>
            </article></Reveal>

            <Reveal asChild index={1}><div className="published-detail-grid">
              <div className="published-detail-content">
                <section>
                  <span className="published-section-number">01</span>
                  <div><h2>Nội dung phản ánh</h2><p>{detail.content}</p><small>Tiếp nhận: {formatDate(detail.createdAt,true)}</small></div>
                </section>
                <section className="published-resolution">
                  <span className="published-section-number"><CheckCircle2/></span>
                  <div><h2>Kết quả xử lý</h2><p>{detail.resolutionSummary||'Kết quả chi tiết đang được đơn vị xử lý cập nhật.'}</p><small>Hoàn thành: {formatDate(detail.resolvedAt,true)}</small></div>
                </section>
              </div>

              <aside className="published-timeline" aria-label="Toàn bộ quá trình xử lý công khai">
                <div className="published-timeline-head"><Clock3/><div><span>QUÁ TRÌNH XỬ LÝ</span><h2>Nhật ký xử lý hồ sơ</h2></div></div>
                <div className="published-timeline-list">
                  {detail.timeline.length?detail.timeline.map((event,index)=><Reveal key={`${event.createdAt}:${event.action}:${index}`} asChild index={index}><div><i/><div><b>{eventLabels[event.action]||'Hồ sơ được cập nhật'}</b><time dateTime={event.createdAt}>{formatDate(event.createdAt,true)}</time></div></div></Reveal>)
                    :<p className="published-timeline-empty">Nhật ký công khai đang được cập nhật.</p>}
                </div>
                {detail.messages.length>0&&<div className="published-public-messages"><h3>Trao đổi trong quá trình xử lý</h3>{detail.messages.map((message,index)=><article key={`${message.createdAt}:${message.authorName}:${index}`}><div><b>{message.authorName}</b><time dateTime={message.createdAt}>{formatDate(message.createdAt,true)}</time></div><p>{message.body}</p></article>)}</div>}
              </aside>
            </div></Reveal>
          </>}
    </main>

    <Reveal asChild><section className="published-detail-cta"><div><MessageCircleMore/><span><b>Gửi phản ánh mới</b><small>Tạo hồ sơ mới hoặc tra cứu hồ sơ đã gửi bằng mã bảo mật.</small></span><Link to="/phan-anh">Gửi hoặc tra cứu phản ánh</Link></div></section></Reveal>

    <footer className="public-footer"><div className="public-container"><p>© {currentVietnamYear()} UBND Phường Lái Thiêu.</p></div></footer>

    <button
      type="button"
      className={`back-to-top${atTop?'':' show'}`}
      aria-label="Về đầu trang"
      tabIndex={atTop?-1:0}
      aria-hidden={atTop?true:undefined}
      onClick={scrollToTop}
    ><ArrowUp/></button>
  </div>;
}
