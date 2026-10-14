import { Bug, ImagePlus } from 'lucide-react';
import { type ClipboardEvent, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { fmtDateTime } from '../ioc-format';
import { screenCodeFor } from '../nav';
import { Modal } from './UI';
import { toast } from './Toast';

/**
 * Nút "Báo lỗi" trên mọi màn hình: tự ghi địa chỉ trang, tiêu đề, mã màn hình, khung nhìn và thời điểm —
 * đúng yêu cầu khách hàng "giữ lại URL để biết trang nào lỗi mà sửa". Có thể dán ảnh chụp màn hình (Ctrl+V).
 */
export default function BugReportButton(){
  const location=useLocation();
  const [open,setOpen]=useState(false);
  const [description,setDescription]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const [openedAt,setOpenedAt]=useState(new Date());

  const context={
    url:window.location.href,
    pageTitle:document.title,
    screenCode:screenCodeFor(location.pathname),
    viewport:`${window.innerWidth}×${window.innerHeight}`,
  };

  function start(){
    setOpenedAt(new Date());
    setDescription('');setFile(null);setError('');setOpen(true);
  }

  function onPaste(event:ClipboardEvent<HTMLTextAreaElement>){
    const image=[...event.clipboardData.files].find(item=>item.type.startsWith('image/'));
    if(image){event.preventDefault();setFile(image)}
  }

  async function submit(){
    if(description.trim().length<5){setError('Vui lòng mô tả lỗi (ít nhất 5 ký tự)');return}
    setSending(true);setError('');
    try{
      const form=new FormData();
      form.set('description',description.trim());
      form.set('url',context.url);
      form.set('pageTitle',context.pageTitle);
      form.set('screenCode',context.screenCode);
      form.set('viewport',context.viewport);
      if(file)form.set('screenshot',file);
      await api('/bug-reports',{method:'POST',body:form});
      toast.ok('Đã gửi báo lỗi');
      setOpen(false);
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không gửi được báo lỗi');
    }finally{setSending(false)}
  }

  return <>
    <button type="button" className="top-icon-btn" onClick={start} aria-label="Báo lỗi màn hình này" title="Báo lỗi màn hình này">
      <Bug aria-hidden="true"/>
    </button>
    {open&&<Modal title="Báo lỗi" onClose={()=>setOpen(false)}>
      <div className="bug-context">
        <span><b>Mã màn hình</b>{context.screenCode}</span>
        <span><b>Thời điểm</b>{fmtDateTime(openedAt)}</span>
        <span className="full"><b>Địa chỉ</b><code>{context.url}</code></span>
      </div>
      <label className="field">Mô tả lỗi
        <textarea rows={5} value={description} onChange={event=>setDescription(event.target.value)} onPaste={onPaste} maxLength={4000}/>
      </label>
      <label className="btn secondary sm bug-file">
        <ImagePlus aria-hidden="true"/>{file?file.name||'Ảnh đã dán':'Đính kèm ảnh'}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event=>setFile(event.target.files?.[0]??null)}/>
      </label>
      {error&&<p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={()=>setOpen(false)}>Hủy</button>
        <button type="button" className="btn primary" onClick={()=>void submit()} disabled={sending}>{sending?'Đang gửi…':'Gửi báo lỗi'}</button>
      </div>
    </Modal>}
  </>;
}
