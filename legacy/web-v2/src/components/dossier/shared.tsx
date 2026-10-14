import { ExternalLink, FileText, Link2, Paperclip, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadApi } from '../../api';
import type { Directive, Dossier, Evidence, Frequency, Report } from '../../ioc-types';
import type { User } from '../../types';
import { toast } from '../Toast';
import { Modal } from '../UI';

// Phần dùng chung của hồ sơ chỉ tiêu (CT-06): kiểu dữ liệu khớp API thật, kỳ báo cáo, minh chứng, hộp xác nhận.

/** API trả thêm các trường mà `Dossier` trong ioc-types.ts chưa khai báo (createdById để biết ai được gỡ văn bản, baseVersion để biết báo cáo đã cũ…). */
export type DossierReport=Report&{userId:string;baseVersion:number;reviewedBy?:string|null};
export type DossierDirective=Directive&{createdById:string;sourceDocumentId?:string|null};
export type DossierEvidence=Evidence&{createdAt?:string};
export type DossierData=Omit<Dossier,'reports'|'directives'>&{
  reports:DossierReport[];
  directives:DossierDirective[];
  computedAt?:string|null;
  assignedAt?:string|null;
  archivedAt?:string|null;
  archiveReason?:string|null;
};

export type PartProps={
  d:DossierData;
  me:User;
  /** Tải lại hồ sơ (không hiện khung xương), trả về dữ liệu mới. */
  reload:()=>Promise<DossierData|null>;
  /** Báo lỗi thao tác: 409 → tải lại hồ sơ; trả về thông điệp để hiện trong biểu mẫu. */
  fail:(error:unknown,title:string)=>string;
};

// ───── Kỳ báo cáo (cùng quy ước với apps/api/src/periods.ts) ─────

const ROMAN=['I','II','III','IV'];
const PERIOD_KEY=/^(\d{4})(?:-(H[12]|Q[1-4]|M(0[1-9]|1[0-2])))?$/;

export function periodLabel(key:string){
  const match=PERIOD_KEY.exec(key);
  if(!match)return key;
  const year=match[1];
  const suffix=match[2];
  if(!suffix)return `Năm ${year}`;
  const index=Number(suffix.slice(1));
  if(suffix[0]==='H')return index===1?`6 tháng đầu năm ${year}`:`6 tháng cuối năm ${year}`;
  if(suffix[0]==='Q')return `Quý ${ROMAN[index-1]}/${year}`;
  return `Tháng ${index}/${year}`;
}

export function periodsOfYear(frequency:Frequency,year:number){
  const count=frequency==='MONTHLY'?12:frequency==='QUARTERLY'?4:frequency==='SEMIANNUAL'?2:1;
  return Array.from({length:count},(_,offset)=>{
    const index=offset+1;
    if(frequency==='MONTHLY')return `${year}-M${String(index).padStart(2,'0')}`;
    if(frequency==='QUARTERLY')return `${year}-Q${index}`;
    if(frequency==='SEMIANNUAL')return `${year}-H${index}`;
    return String(year);
  });
}

/** Kỳ mặc định khi báo cáo: kỳ hiện tại nếu chưa báo cáo, nếu không thì kỳ thiếu gần nhất. */
export function defaultReportPeriod(d:DossierData){
  const current=d.periods.find(period=>period.key===d.currentPeriodKey);
  if(current&&!current.reported)return current.key;
  const missing=[...d.periods].reverse().find(period=>!period.reported);
  return missing?.key??current?.key??d.periods[d.periods.length-1]?.key??'';
}

// ───── Định dạng nhỏ ─────

export function fmtSize(bytes?:number|null){
  if(!bytes)return '';
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${Math.round(bytes/1024)} KB`;
  return `${(bytes/1024/1024).toFixed(1).replace('.',',')} MB`;
}

export function isHttpUrl(value?:string|null):value is string{
  return Boolean(value&&/^https?:\/\/\S+$/i.test(value.trim()));
}

// ───── Minh chứng ─────

export const EVIDENCE_ACCEPT='image/jpeg,image/png,image/webp,application/pdf,.pdf,.jpg,.jpeg,.png,.webp';
const MAX_EVIDENCE_BYTES=10*1024*1024;
const VIEWABLE=/^(image\/(jpeg|png|webp)|application\/pdf)$/;
const EXTENSIONS:Record<string,string>={'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'};

export function checkEvidenceFile(file:File){
  if(file.size>MAX_EVIDENCE_BYTES)return `Tệp «${file.name}» vượt quá 10MB.`;
  if(file.type&&!VIEWABLE.test(file.type))return `Tệp «${file.name}» không đúng định dạng: chỉ nhận ảnh JPEG, PNG, WEBP hoặc PDF. Văn bản Word/Excel hãy tải vào Kho văn bản rồi liên kết.`;
  return '';
}

type EvidenceLinks={progressUpdateId?:string;directiveId?:string;evaluationId?:string;title?:string;note?:string};

export function uploadEvidence(targetId:string,file:File,links:EvidenceLinks={}){
  const form=new FormData();
  form.set('file',file);
  form.set('title',links.title?.trim()||file.name);
  for(const key of ['progressUpdateId','directiveId','evaluationId','note'] as const){
    const value=links[key]?.trim();
    if(value)form.set(key,value);
  }
  return api<{id:string}>(`/targets/${encodeURIComponent(targetId)}/evidence/upload`,{method:'POST',body:form});
}

/** Tải lần lượt nhiều tệp; trả về danh sách lỗi (rỗng nếu tất cả thành công). */
export async function uploadEvidenceFiles(targetId:string,files:File[],links:EvidenceLinks={}){
  const failures:string[]=[];
  for(const file of files){
    try{await uploadEvidence(targetId,file,{...links,title:files.length===1?links.title:undefined})}
    catch(error){failures.push(`${file.name}: ${error instanceof Error?error.message:'lỗi không xác định'}`)}
  }
  return failures;
}

/** Tải tệp minh chứng qua API (có xác thực) rồi mở ở thẻ mới; trình duyệt chặn cửa sổ thì tải về máy. */
export async function openEvidenceFile(targetId:string,item:Evidence){
  const raw=await downloadApi(`/targets/${encodeURIComponent(targetId)}/evidence/${encodeURIComponent(item.id)}/download`);
  const type=raw.type||item.mimeType||'';
  const viewable=VIEWABLE.test(type);
  // Chỉ mở trực tiếp ảnh/PDF; loại khác luôn tải về dưới dạng nhị phân.
  const blob=new Blob([raw],{type:viewable?type:'application/octet-stream'});
  const url=URL.createObjectURL(blob);
  const viewer=viewable?window.open(url,'_blank'):null;
  if(!viewer){
    const extension=EXTENSIONS[type]??'';
    const link=document.createElement('a');
    link.href=url;
    link.download=extension&&!item.title.toLowerCase().endsWith(extension)?item.title+extension:item.title;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
}

/** Danh sách minh chứng dạng nhãn bấm được: tệp (tải qua API), liên kết ngoài, văn bản trong kho. */
export function EvidenceChips({targetId,items,empty}:{targetId:string;items:DossierEvidence[];empty?:ReactNode}){
  const [busy,setBusy]=useState('');
  if(!items.length)return empty?<>{empty}</>:null;

  async function open(item:DossierEvidence){
    setBusy(item.id);
    try{await openEvidenceFile(targetId,item)}
    catch(error){toast.error('Không mở được minh chứng',error instanceof Error?error.message:undefined)}
    finally{setBusy('')}
  }

  return <div className="dos-evidence">
    {items.map(item=>{
      if(item.kind==='LINK'){
        return isHttpUrl(item.url)
          ?<a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" title={item.note||item.url}><Link2 aria-hidden="true"/>{item.title}<ExternalLink aria-hidden="true"/></a>
          :<span key={item.id} className="dos-evidence-plain"><Link2 aria-hidden="true"/>{item.title}</span>;
      }
      if(item.kind==='DOCUMENT'){
        return item.sourceDocumentId
          ?<Link key={item.id} to={`/admin/documents/${item.sourceDocumentId}`} title="Mở văn bản trong kho"><FileText aria-hidden="true"/>{item.title}</Link>
          :<span key={item.id} className="dos-evidence-plain"><FileText aria-hidden="true"/>{item.title}</span>;
      }
      return <button key={item.id} type="button" disabled={busy===item.id} onClick={()=>void open(item)} title={item.note||'Mở tệp minh chứng'}>
        <Paperclip aria-hidden="true"/>{busy===item.id?'Đang mở…':item.title}
        {item.size?<small>{fmtSize(item.size)}</small>:null}
      </button>;
    })}
  </div>;
}

/** Ô chọn tệp minh chứng (ảnh/PDF ≤10MB), giữ danh sách đã chọn và cho bỏ từng tệp. */
export function EvidenceFileInput({files,onChange,label='Tệp minh chứng (ảnh hoặc PDF, tối đa 10MB mỗi tệp)',disabled}:{files:File[];onChange:(files:File[])=>void;label?:string;disabled?:boolean}){
  return <div className="dos-files">
    <label>{label}
      <input type="file" multiple accept={EVIDENCE_ACCEPT} disabled={disabled} onChange={event=>{
        const chosen=[...(event.target.files??[])];
        event.target.value='';
        const errors=chosen.map(checkEvidenceFile).filter(Boolean);
        if(errors.length)toast.warn('Có tệp không hợp lệ',errors.join(' '));
        onChange([...files,...chosen.filter(file=>!checkEvidenceFile(file))].slice(0,10));
      }}/>
    </label>
    {files.length>0&&<ul>
      {files.map((file,index)=><li key={`${file.name}-${index}`}>
        <Paperclip aria-hidden="true"/>
        <span>{file.name}</span>
        <small>{fmtSize(file.size)}</small>
        <button type="button" className="btn ghost sm icon" disabled={disabled} aria-label={`Bỏ tệp ${file.name}`} onClick={()=>onChange(files.filter((_,position)=>position!==index))}><X aria-hidden="true"/></button>
      </li>)}
    </ul>}
  </div>;
}

/** Hộp xác nhận cho thao tác không hoàn tác được (gỡ, trả lại…). Tiêu điểm mặc định đặt ở nút Huỷ. */
export function ConfirmModal({title,description,confirmLabel,busyLabel='Đang xử lý…',danger=false,busy,onConfirm,onClose,children}:{
  title:string;
  description?:string;
  confirmLabel:string;
  busyLabel?:string;
  danger?:boolean;
  busy:boolean;
  onConfirm:()=>void;
  onClose:()=>void;
  children?:ReactNode;
}){
  return <Modal title={title} description={description} onClose={()=>{if(!busy)onClose()}}>
    <div className="modal-body">
      {children}
      <div className="modal-actions">
        <button type="button" className="btn secondary" data-modal-initial-focus onClick={onClose} disabled={busy}>Huỷ</button>
        <button type="button" className={`btn ${danger?'danger':'primary'}`} onClick={onConfirm} disabled={busy}>{busy?busyLabel:confirmLabel}</button>
      </div>
    </div>
  </Modal>;
}

/** Thông điệp lỗi từ một ngoại lệ bất kỳ. */
export function errorText(error:unknown,fallback='Có lỗi xảy ra khi xử lý yêu cầu'){
  return error instanceof Error&&error.message?error.message:fallback;
}
