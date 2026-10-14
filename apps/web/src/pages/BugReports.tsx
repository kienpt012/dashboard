import { Bug, ExternalLink, Image as ImageIcon, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ApiError, api, downloadApi } from '../api';
import { toast } from '../components/Toast';
import { Badge, CopyButton, Empty, Modal, PageHead, SkeletonTable } from '../components/UI';
import { fmtDateTime, relativeTime } from '../ioc-format';

type Status='NEW'|'IN_PROGRESS'|'RESOLVED'|'WONT_FIX';
type BugReport={
  id:string;reporterName:string;url:string;pageTitle?:string|null;screenCode?:string|null;viewport?:string|null;userAgent?:string|null;
  description:string;status:Status;adminNote?:string|null;resolvedAt?:string|null;version:number;createdAt:string;hasScreenshot:boolean;
};

const statusMeta:Record<Status,{label:string;tone:'bad'|'warn'|'ok'|'neutral'}>={
  NEW:{label:'Mới',tone:'bad'},
  IN_PROGRESS:{label:'Đang xử lý',tone:'warn'},
  RESOLVED:{label:'Đã sửa',tone:'ok'},
  WONT_FIX:{label:'Không sửa',tone:'neutral'},
};

/** Báo lỗi (HT-06): lỗi người dùng gửi từ nút nổi, kèm địa chỉ trang, mã màn hình, thời điểm và ảnh chụp. */
export default function BugReports(){
  const [items,setItems]=useState<BugReport[]|null>(null);
  const [error,setError]=useState('');
  const [status,setStatus]=useState<Status|''>('');
  const [query,setQuery]=useState('');
  const [open,setOpen]=useState<BugReport|null>(null);

  const load=useCallback(async()=>{
    setError('');
    try{setItems(await api<BugReport[]>('/bug-reports'))}
    catch(caught){setError(caught instanceof Error?caught.message:'Không tải được danh sách báo lỗi')}
  },[]);
  useEffect(()=>{void load()},[load]);

  const visible=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('vi');
    return (items??[]).filter(item=>(!status||item.status===status)&&(!needle||[item.description,item.url,item.reporterName,item.screenCode,item.pageTitle].some(value=>value?.toLocaleLowerCase('vi').includes(needle))));
  },[items,status,query]);
  const fresh=(items??[]).filter(item=>item.status==='NEW').length;

  return <div className="bug-reports">
    <PageHead eyebrow="Hệ thống" title="Báo lỗi"
      description="Lỗi người dùng gửi bằng nút Báo lỗi trên mọi màn hình, kèm địa chỉ trang và thời điểm để tìm đúng chỗ mà sửa."
      actions={<button type="button" className="btn secondary" onClick={()=>void load()}><RefreshCw aria-hidden="true"/>Làm mới</button>}/>
    {items&&<div className="ioc-kpis">
      <button type="button" className={`ioc-kpi ${fresh?'bad':'ok'}`} onClick={()=>setStatus('NEW')}><span>Lỗi mới chưa xử lý</span><strong>{fresh}</strong></button>
      <button type="button" className="ioc-kpi warn" onClick={()=>setStatus('IN_PROGRESS')}><span>Đang xử lý</span><strong>{items.filter(item=>item.status==='IN_PROGRESS').length}</strong></button>
      <button type="button" className="ioc-kpi ok" onClick={()=>setStatus('RESOLVED')}><span>Đã sửa</span><strong>{items.filter(item=>item.status==='RESOLVED').length}</strong></button>
    </div>}
    <div className="ioc-filters">
      <label className="search"><Search aria-hidden="true"/><input type="search" aria-label="Tìm báo lỗi" placeholder="Tìm theo nội dung, địa chỉ trang, người gửi" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <select aria-label="Lọc theo trạng thái" value={status} onChange={event=>setStatus(event.target.value as Status|'')}>
        <option value="">Mọi trạng thái</option>
        {(Object.keys(statusMeta) as Status[]).map(key=><option key={key} value={key}>{statusMeta[key].label}</option>)}
      </select>
    </div>
    {error?<div className="form-error" role="alert">{error} <button type="button" className="btn secondary sm" onClick={()=>void load()}>Thử lại</button></div>
      :!items?<SkeletonTable rows={5}/>
      :!visible.length?<Empty title={items.length?'Không có báo lỗi phù hợp':'Chưa có báo lỗi nào'} description={items.length?'Thử đổi bộ lọc.':'Khi người dùng bấm nút Báo lỗi ở góc màn hình, báo cáo sẽ hiện tại đây.'}/>
      :<section className="panel flush"><div className="table-wrap">
        <table>
          <thead><tr><th scope="col">Lỗi</th><th scope="col">Màn hình</th><th scope="col">Người gửi</th><th scope="col">Thời điểm</th><th scope="col">Trạng thái</th></tr></thead>
          <tbody>{visible.map(item=><tr key={item.id}>
            <td><button type="button" className="row-action bug-row" onClick={()=>setOpen(item)}>{item.hasScreenshot&&<ImageIcon aria-label="Có ảnh chụp"/>}{item.description.length>120?`${item.description.slice(0,120)}…`:item.description}</button></td>
            <td><span className="ioc-code">{item.screenCode||'—'}</span></td>
            <td>{item.reporterName}</td>
            <td title={fmtDateTime(item.createdAt)}>{relativeTime(item.createdAt)}</td>
            <td><Badge tone={statusMeta[item.status].tone}>{statusMeta[item.status].label}</Badge></td>
          </tr>)}</tbody>
        </table>
      </div></section>}
    {open&&<BugDetail item={open} onClose={()=>setOpen(null)} onSaved={async()=>{setOpen(null);await load()}}/>}
  </div>;
}

function BugDetail({item,onClose,onSaved}:{item:BugReport;onClose:()=>void;onSaved:()=>Promise<void>}){
  const [shot,setShot]=useState('');
  const [shotError,setShotError]=useState('');
  const [status,setStatus]=useState<Status>(item.status==='NEW'?'IN_PROGRESS':item.status);
  const [note,setNote]=useState(item.adminNote??'');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!item.hasScreenshot)return;
    let url='';
    let active=true;
    downloadApi(`/bug-reports/${item.id}/screenshot`).then(blob=>{url=URL.createObjectURL(blob);if(active)setShot(url);else URL.revokeObjectURL(url)})
      .catch(()=>{if(active)setShotError('Không tải được ảnh chụp')});
    return()=>{active=false;if(url)URL.revokeObjectURL(url)};
  },[item]);

  async function save(event:FormEvent){
    event.preventDefault();
    setBusy(true);setError('');
    try{
      await api(`/bug-reports/${item.id}`,{method:'PATCH',body:JSON.stringify({expectedVersion:item.version,status,adminNote:note.trim()||undefined})});
      toast.ok('Đã cập nhật báo lỗi',statusMeta[status].label);
      await onSaved();
    }catch(caught){setError(caught instanceof ApiError&&caught.status===409?'Báo lỗi vừa được cập nhật. Đóng và tải lại.':caught instanceof Error?caught.message:'Không lưu được')}
    finally{setBusy(false)}
  }

  const safeUrl=/^https?:\/\//i.test(item.url)?item.url:'';
  return <Modal wide title="Chi tiết báo lỗi" description={`${item.reporterName} · ${fmtDateTime(item.createdAt)}`} onClose={()=>{if(!busy)onClose()}}>
    <form className="modal-body" onSubmit={save}>
      <div className="bug-context">
        <span><b>Mã màn hình</b>{item.screenCode||'—'}</span>
        <span><b>Khung nhìn</b>{item.viewport||'—'}</span>
        <span className="full"><b>Địa chỉ trang</b><code>{item.url}</code></span>
        {item.pageTitle&&<span className="full"><b>Tiêu đề trang</b>{item.pageTitle}</span>}
        {item.userAgent&&<span className="full"><b>Trình duyệt</b><code>{item.userAgent}</code></span>}
      </div>
      <div className="bug-links">
        <CopyButton value={item.url} label="Sao chép địa chỉ"/>
        {safeUrl&&<a className="btn ghost sm" href={safeUrl} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden="true"/>Mở trang</a>}
      </div>
      <p className="bug-desc"><Bug aria-hidden="true"/> {item.description}</p>
      {item.hasScreenshot&&(shot?<a href={shot} target="_blank" rel="noopener noreferrer"><img className="bug-shot" src={shot} alt="Ảnh chụp màn hình người dùng gửi kèm"/></a>
        :<p className="ioc-muted">{shotError||'Đang tải ảnh chụp…'}</p>)}
      <div className="form-grid two">
        <label>Trạng thái<select value={status} onChange={event=>setStatus(event.target.value as Status)}>
          {(Object.keys(statusMeta) as Status[]).map(key=><option key={key} value={key}>{statusMeta[key].label}</option>)}
        </select></label>
        <label className="full">Ghi chú xử lý<textarea rows={3} value={note} maxLength={2000} onChange={event=>setNote(event.target.value)} placeholder="Nguyên nhân, cách sửa, phiên bản đã sửa"/></label>
      </div>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Đóng</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy?'Đang lưu…':'Lưu'}</button>
      </div>
    </form>
  </Modal>;
}
