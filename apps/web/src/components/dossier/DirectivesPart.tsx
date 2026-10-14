import { FileText, Gavel, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { hasAnyRole, WORKING_ROLES } from '../../authz';
import { fmtDate, fmtDateTime } from '../../ioc-format';
import { directiveKindLabels, type DirectiveKind } from '../../ioc-types';
import { toast } from '../Toast';
import { Badge, Empty } from '../UI';
import { ConfirmModal, EvidenceChips, EvidenceFileInput, uploadEvidenceFiles, type DossierDirective, type PartProps } from './shared';

type DocumentOption={id:string;code:string;title:string;docNumber?:string|null};

/** Phần 1 — Chỉ đạo điều hành: kế hoạch, công văn, thông báo kết luận… làm căn cứ thực hiện. */
export default function DirectivesPart({d,me,reload,fail}:PartProps){
  const [adding,setAdding]=useState(false);
  const [removing,setRemoving]=useState<DossierDirective|null>(null);
  const [busy,setBusy]=useState(false);
  // Gỡ văn bản: người bổ sung hoặc lãnh đạo/trưởng phòng chủ trì (canEvaluate = có quyền giám sát phòng).
  const canRemove=(item:DossierDirective)=>hasAnyRole(me,WORKING_ROLES)&&(item.createdById===me.id||d.permissions.canEvaluate);

  async function remove(){
    if(!removing)return;
    setBusy(true);
    try{
      await api(`/targets/${encodeURIComponent(d.id)}/directives/${encodeURIComponent(removing.id)}`,{method:'DELETE'});
      toast.ok('Đã gỡ văn bản chỉ đạo',removing.title);
      setRemoving(null);
      await reload();
    }catch(error){fail(error,'Không gỡ được văn bản chỉ đạo');setRemoving(null)}
    finally{setBusy(false)}
  }

  return <section className="panel" aria-labelledby="dos-directives-title">
    <div className="panel-head">
      <div>
        <h3 id="dos-directives-title">Chỉ đạo điều hành</h3>
        <p>Kế hoạch, chương trình, công văn, thông báo kết luận… làm căn cứ triển khai chỉ tiêu.</p>
      </div>
      {d.permissions.canContribute&&!adding&&<div className="dos-head-actions">
        <button type="button" className="btn primary sm" onClick={()=>setAdding(true)}><Plus aria-hidden="true"/>Thêm văn bản</button>
      </div>}
    </div>

    {d.sourceDocument&&<div className="info-box dos-gap">
      <FileText aria-hidden="true"/>
      <p>Chỉ tiêu được giao theo văn bản <Link to={`/admin/documents/${d.sourceDocument.id}`}>{d.sourceDocument.docNumber||d.sourceDocument.code} — {d.sourceDocument.title}</Link></p>
    </div>}

    {adding&&<DirectiveForm d={d} fail={fail} onCancel={()=>setAdding(false)} onSaved={async()=>{setAdding(false);await reload()}}/>}

    {d.directives.length
      ?d.directives.map(item=><article key={item.id} className="dos-entry">
        <header>
          <Badge tone="info">{item.kindLabel||directiveKindLabels[item.kind]}</Badge>
          {item.docNumber&&<strong className="dos-docno">Số {item.docNumber}</strong>}
          <span className="right">
            {item.issuedDate&&<span className="dos-muted">Ban hành {fmtDate(item.issuedDate)}</span>}
            {canRemove(item)&&<button type="button" className="btn ghost sm icon danger-text" aria-label={`Gỡ văn bản chỉ đạo ${item.docNumber||item.title}`} onClick={()=>setRemoving(item)}><Trash2 aria-hidden="true"/></button>}
          </span>
        </header>
        <p className="dos-entry-title">{item.title}</p>
        {item.issuer&&<div className="meta">Cơ quan ban hành: {item.issuer}</div>}
        {item.note&&<p className="dos-note">{item.note}</p>}
        {item.sourceDocument&&<div className="meta">Văn bản trong kho: <Link to={`/admin/documents/${item.sourceDocument.id}`}>{item.sourceDocument.code} — {item.sourceDocument.title}</Link></div>}
        <EvidenceChips targetId={d.id} items={item.evidences}/>
        <div className="meta">Bổ sung bởi {item.createdByName} · {fmtDateTime(item.createdAt)}</div>
      </article>)
      :!adding&&<Empty
        title="Chưa có văn bản chỉ đạo"
        description={d.permissions.canContribute
          ?'Bổ sung kế hoạch, công văn hoặc thông báo kết luận để hồ sơ có căn cứ chỉ đạo điều hành.'
          :'Phòng chủ trì chưa bổ sung văn bản chỉ đạo cho chỉ tiêu này.'}
        action={d.permissions.canContribute?<button type="button" className="btn secondary sm" onClick={()=>setAdding(true)}><Gavel aria-hidden="true"/>Bổ sung văn bản đầu tiên</button>:undefined}
      />}

    {removing&&<ConfirmModal
      title="Gỡ văn bản chỉ đạo?"
      description="Văn bản và các minh chứng đính kèm sẽ bị gỡ khỏi hồ sơ. Thao tác được ghi vào dòng thời gian trách nhiệm và không hoàn tác được."
      confirmLabel="Gỡ văn bản"
      busyLabel="Đang gỡ…"
      danger
      busy={busy}
      onConfirm={()=>void remove()}
      onClose={()=>setRemoving(null)}
    >
      <p className="dos-confirm-target"><b>{removing.kindLabel}{removing.docNumber?` số ${removing.docNumber}`:''}</b><br/>{removing.title}</p>
    </ConfirmModal>}
  </section>;
}

function DirectiveForm({d,fail,onCancel,onSaved}:{d:PartProps['d'];fail:PartProps['fail'];onCancel:()=>void;onSaved:()=>Promise<void>}){
  const [kind,setKind]=useState<DirectiveKind>('KE_HOACH');
  const [docNumber,setDocNumber]=useState('');
  const [issuedDate,setIssuedDate]=useState('');
  const [issuer,setIssuer]=useState('');
  const [title,setTitle]=useState('');
  const [note,setNote]=useState('');
  const [sourceDocumentId,setSourceDocumentId]=useState('');
  const [documents,setDocuments]=useState<DocumentOption[]>([]);
  const [files,setFiles]=useState<File[]>([]);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);

  // Danh mục kho văn bản để gắn văn bản nguồn (không bắt buộc; tải hỏng thì ẩn ô chọn).
  useEffect(()=>{
    let active=true;
    api<DocumentOption[]>('/documents').then(rows=>{if(active&&Array.isArray(rows))setDocuments(rows)}).catch(()=>undefined);
    return()=>{active=false};
  },[]);

  async function submit(event:FormEvent){
    event.preventDefault();
    if(title.trim().length<3){setError('Vui lòng nhập trích yếu văn bản (ít nhất 3 ký tự).');return}
    setSaving(true);
    setError('');
    try{
      const directive=await api<{id:string}>(`/targets/${encodeURIComponent(d.id)}/directives`,{method:'POST',body:JSON.stringify({
        kind,
        title:title.trim(),
        docNumber:docNumber.trim()||undefined,
        issuedDate:issuedDate||undefined,
        issuer:issuer.trim()||undefined,
        note:note.trim()||undefined,
        sourceDocumentId:sourceDocumentId||undefined,
      })});
      const failures=files.length&&directive?.id?await uploadEvidenceFiles(d.id,files,{directiveId:directive.id}):[];
      toast.ok('Đã bổ sung văn bản chỉ đạo',title.trim());
      if(failures.length)toast.warn('Chưa tải được một số tệp đính kèm',failures.join(' '));
      await onSaved();
    }catch(caught){setError(fail(caught,'Không bổ sung được văn bản chỉ đạo'))}
    finally{setSaving(false)}
  }

  return <form className="dos-form" onSubmit={submit} noValidate aria-label="Thêm văn bản chỉ đạo">
    <div className="dos-form-title"><strong>Thêm văn bản chỉ đạo</strong><span>Ghi đúng số hiệu, ngày ban hành để dễ đối chiếu khi kiểm tra.</span></div>
    <div className="form-grid two">
      <label>Loại văn bản
        <select value={kind} onChange={event=>setKind(event.target.value as DirectiveKind)}>
          {(Object.keys(directiveKindLabels) as DirectiveKind[]).map(key=><option key={key} value={key}>{directiveKindLabels[key]}</option>)}
        </select>
      </label>
      <label>Số hiệu
        <input type="text" value={docNumber} maxLength={80} placeholder="Ví dụ: 125/KH-UBND" onChange={event=>setDocNumber(event.target.value)}/>
      </label>
      <label>Ngày ban hành
        <input type="date" value={issuedDate} onChange={event=>setIssuedDate(event.target.value)}/>
      </label>
      <label>Cơ quan ban hành
        <input type="text" value={issuer} maxLength={200} placeholder="Ví dụ: UBND phường" onChange={event=>setIssuer(event.target.value)}/>
      </label>
      <label className="full">Trích yếu <span className="dos-req">(bắt buộc)</span>
        <textarea rows={2} value={title} maxLength={500} required onChange={event=>setTitle(event.target.value)}/>
      </label>
      <label className="full">Ghi chú, nội dung chỉ đạo chính
        <textarea rows={2} value={note} maxLength={1000} onChange={event=>setNote(event.target.value)}/>
      </label>
      {documents.length>0&&<label className="full">Văn bản trong kho (không bắt buộc)
        <select value={sourceDocumentId} onChange={event=>setSourceDocumentId(event.target.value)}>
          <option value="">Không gắn văn bản trong kho</option>
          {documents.map(item=><option key={item.id} value={item.id}>{item.docNumber||item.code} — {item.title}</option>)}
        </select>
      </label>}
      <div className="full"><EvidenceFileInput files={files} onChange={setFiles} disabled={saving} label="Tệp văn bản đính kèm (ảnh hoặc PDF, tối đa 10MB)"/></div>
    </div>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <div className="row">
      <button type="button" className="btn secondary" onClick={onCancel} disabled={saving}>Huỷ</button>
      <button type="submit" className="btn primary" disabled={saving}>{saving?'Đang lưu…':'Lưu văn bản'}</button>
    </div>
  </form>;
}
