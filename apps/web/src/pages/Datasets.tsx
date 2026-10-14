import { Database, Download, FileSpreadsheet, Pencil, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api, auth, downloadApi } from '../api';
import { hasAnyRole } from '../authz';
import { toast } from '../components/Toast';
import { Badge, Empty, Modal, PageHead, SkeletonTable } from '../components/UI';
import { fmtDate, fmtDateTime, fmtNumber, relativeTime } from '../ioc-format';
import type { Dataset, DatasetColumn } from '../ioc-types';
import type { Department, Role } from '../types';
import '../styles/ioc-datasets.css';

type Row={id:string;data:Record<string,unknown>;version:number;createdAt?:string;updatedAt?:string;createdBy?:string|null;updatedBy?:string|null;readOnly?:boolean};
type RowsResponse={total:number;rows:Row[]};
type Recomputed={targetId:string;code:string;title:string;previousValue:number;value:number|null;changed:boolean;warnings:string[]};
type ImportResult={applied:boolean;total:number;valid:number;errors:{line:number;errors:string[]}[];sample:Record<string,unknown>[];recomputed?:Recomputed[]};
type DatasetDetail=Dataset&{id?:string;version?:number;ownerDepartmentId?:string|null};

const DATASET_ADMIN_ROLES:readonly Role[]=['ADMIN','LEADER','CLERK'];
const PAGE=50;
const typeLabels:Record<DatasetColumn['type'],string>={text:'Chữ',number:'Số',date:'Ngày',boolean:'Có/không',enum:'Danh mục'};

function showValue(column:DatasetColumn,value:unknown){
  if(value===null||value===undefined||value==='')return '—';
  if(column.type==='number'&&typeof value==='number')return fmtNumber(value);
  if(column.type==='date'&&typeof value==='string')return fmtDate(value);
  if(column.type==='boolean')return value===true?'Có':value===false?'Không':String(value);
  return String(value);
}

function notifyRecomputed(recomputed?:Recomputed[]){
  const changed=(recomputed??[]).filter(item=>item.changed);
  if(changed.length)toast.info('Đã tính lại chỉ tiêu tự tính',changed.slice(0,3).map(item=>`${item.code}: ${item.value===null?'chưa tính được':fmtNumber(item.value)}`).join(' · ')+(changed.length>3?` và ${changed.length-3} chỉ tiêu khác`:''));
}

/** Kho dữ liệu (DL-01): bảng dữ liệu nghiệp vụ để chỉ tiêu tự tính — xem, nhập tay, nhập Excel, biết chỉ tiêu nào đang dùng. */
export default function Datasets(){
  const me=auth.user;
  const [params,setParams]=useSearchParams();
  const [datasets,setDatasets]=useState<DatasetDetail[]|null>(null);
  const [error,setError]=useState('');
  const [departments,setDepartments]=useState<Department[]>([]);
  const [editingDataset,setEditingDataset]=useState<{item?:DatasetDetail}|null>(null);
  const canManage=hasAnyRole(me,DATASET_ADMIN_ROLES);
  const selectedCode=params.get('code');

  const load=useCallback(async()=>{
    setError('');
    try{setDatasets(await api<DatasetDetail[]>('/datasets'))}
    catch(caught){setError(caught instanceof Error?caught.message:'Không tải được kho dữ liệu')}
  },[]);

  useEffect(()=>{
    void load();
    api<Department[]>('/departments').then(list=>setDepartments(list.filter(item=>item.isActive))).catch(()=>undefined);
  },[load]);

  const selected=useMemo(()=>datasets?.find(item=>item.code===selectedCode)??datasets?.[0]??null,[datasets,selectedCode]);
  const select=(code:string)=>setParams(next=>{next.set('code',code);return next},{replace:true});

  return <div className="datasets">
    <PageHead
      eyebrow="Dữ liệu"
      title="Kho dữ liệu"
      description="Bảng dữ liệu nghiệp vụ là nguồn để chỉ tiêu tự tính: cập nhật dữ liệu là số liệu chỉ tiêu tự đổi theo, truy được tới từng dòng."
      actions={<>
        <button type="button" className="btn secondary" onClick={()=>void load()}><RefreshCw aria-hidden="true"/>Làm mới</button>
        {canManage&&<button type="button" className="btn primary" onClick={()=>setEditingDataset({})}><Plus aria-hidden="true"/>Tạo bảng dữ liệu</button>}
      </>}
    />
    {error?<div className="form-error" role="alert">{error} <button type="button" className="btn secondary sm" onClick={()=>void load()}>Thử lại</button></div>
      :!datasets?<SkeletonTable rows={6}/>
      :!datasets.length?<Empty title="Chưa có bảng dữ liệu" description="Nạp bộ chỉ tiêu mẫu sẽ tự tạo các bảng dữ liệu cần thiết; hoặc tạo bảng mới." action={canManage?<button type="button" className="btn secondary sm" onClick={()=>setEditingDataset({})}><Plus aria-hidden="true"/>Tạo bảng dữ liệu</button>:undefined}/>
      :<div className="ds-layout">
        <nav className="ds-list" aria-label="Danh sách bảng dữ liệu">
          {datasets.map(item=><button key={item.code} type="button" className={`ds-item ${selected?.code===item.code?'active':''}`} aria-current={selected?.code===item.code?'true':undefined} onClick={()=>select(item.code)}>
            <strong>{item.name}</strong>
            <small>
              {item.builtin?'Dữ liệu hệ thống · tự động':`${fmtNumber(item.rowCount??0)} dòng${item.lastDataAt?` · cập nhật ${relativeTime(item.lastDataAt)}`:' · chưa có dữ liệu'}`}
            </small>
            <small>{item.ownerDepartment?.name??(item.builtin?'Phân hệ phản ánh':'Chưa giao đơn vị chủ quản')}{item.usedBy.length?` · ${item.usedBy.length} chỉ tiêu dùng`:''}</small>
          </button>)}
        </nav>
        {selected&&<DatasetPanel key={selected.code} dataset={selected} canManage={canManage} onEdit={()=>setEditingDataset({item:selected})} onChanged={load}/>}
      </div>}
    {editingDataset&&<DatasetForm item={editingDataset.item} departments={departments} onClose={()=>setEditingDataset(null)}
      onSaved={async code=>{setEditingDataset(null);await load();select(code)}}/>}
  </div>;
}

function DatasetPanel({dataset,canManage,onEdit,onChanged}:{dataset:DatasetDetail;canManage:boolean;onEdit:()=>void;onChanged:()=>Promise<void>}){
  const [rows,setRows]=useState<RowsResponse|null>(null);
  const [page,setPage]=useState(0);
  const [error,setError]=useState('');
  const [rowEditor,setRowEditor]=useState<{row?:Row}|null>(null);
  const [removing,setRemoving]=useState<Row|null>(null);
  const [importing,setImporting]=useState(false);
  const [busy,setBusy]=useState(false);

  const loadRows=useCallback(async()=>{
    setError('');
    try{setRows(await api<RowsResponse>(`/datasets/${encodeURIComponent(dataset.code)}/rows?take=${PAGE}&skip=${page*PAGE}`))}
    catch(caught){setError(caught instanceof Error?caught.message:'Không tải được dữ liệu')}
  },[dataset.code,page]);
  useEffect(()=>{void loadRows()},[loadRows]);

  async function refreshAll(){await Promise.all([loadRows(),onChanged()])}

  async function downloadTemplate(){
    try{
      const blob=await downloadApi(`/datasets/${encodeURIComponent(dataset.code)}/template.xlsx`);
      const url=URL.createObjectURL(blob);
      const link=document.createElement('a');
      link.href=url;link.download=`mau-${dataset.code}.xlsx`;
      document.body.appendChild(link);link.click();link.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
    }catch(caught){toast.error('Không tải được mẫu Excel',caught instanceof Error?caught.message:undefined)}
  }

  async function remove(){
    if(!removing)return;
    setBusy(true);
    try{
      const result=await api<{recomputed?:Recomputed[]}>(`/datasets/${encodeURIComponent(dataset.code)}/rows/${encodeURIComponent(removing.id)}`,{method:'DELETE'});
      toast.ok('Đã xoá dòng dữ liệu');
      notifyRecomputed(result?.recomputed);
      setRemoving(null);
      await refreshAll();
    }catch(caught){toast.error('Không xoá được dòng',caught instanceof Error?caught.message:undefined)}
    finally{setBusy(false)}
  }

  const totalPages=rows?Math.max(1,Math.ceil(rows.total/PAGE)):1;
  return <section className="panel ds-detail" aria-labelledby="ds-title">
    <div className="panel-head">
      <div>
        <h3 id="ds-title"><Database aria-hidden="true"/> {dataset.name}</h3>
        <p><span className="ioc-code">{dataset.code}</span>{dataset.builtin&&<> · <Badge tone="info">Dữ liệu hệ thống</Badge></>}</p>
      </div>
      <div className="ds-actions">
        {!dataset.builtin&&<button type="button" className="btn ghost sm" onClick={()=>void downloadTemplate()}><Download aria-hidden="true"/>Mẫu Excel</button>}
        {dataset.canEdit&&<button type="button" className="btn secondary sm" onClick={()=>setImporting(true)}><Upload aria-hidden="true"/>Nhập Excel</button>}
        {dataset.canEdit&&<button type="button" className="btn primary sm" onClick={()=>setRowEditor({})}><Plus aria-hidden="true"/>Thêm dòng</button>}
        {canManage&&!dataset.builtin&&<button type="button" className="btn ghost sm" onClick={onEdit}><Pencil aria-hidden="true"/>Sửa bảng</button>}
      </div>
    </div>

    {dataset.description&&<p className="ds-desc">{dataset.description}</p>}
    <dl className="dos-kv ds-meta">
      <div><dt>Đơn vị chủ quản</dt><dd>{dataset.ownerDepartment?.name??(dataset.builtin?'Lấy tự động từ phân hệ tiếp nhận phản ánh':'Chưa giao')}</dd></div>
      {dataset.updateCycle&&<div><dt>Chu kỳ cập nhật</dt><dd>{dataset.updateCycle}</dd></div>}
      {dataset.sourceSystem&&<div><dt>Hệ thống nguồn</dt><dd>{dataset.sourceSystem}</dd></div>}
      {dataset.lastDataAt&&<div><dt>Dữ liệu mới nhất</dt><dd>{fmtDateTime(dataset.lastDataAt)}</dd></div>}
      {dataset.collectionGuide&&<div className="wide"><dt>Hướng dẫn thu thập</dt><dd>{dataset.collectionGuide}</dd></div>}
    </dl>
    <div className="ds-cols" aria-label="Các cột của bảng">
      {dataset.columns.map(column=><span key={column.key} className="chip" title={column.options?.length?`Giá trị: ${column.options.join(', ')}`:column.key}>
        {column.label} <b>{typeLabels[column.type]}{column.required?' · bắt buộc':''}</b>
      </span>)}
    </div>

    <h4 className="ds-subtitle">Chỉ tiêu đang dùng bảng này</h4>
    {dataset.usedBy.length
      ?<ul className="ds-usedby">{dataset.usedBy.map(target=><li key={target.id}><Link to={`/admin/targets/${target.id}`}><span className="ioc-code">{target.code}</span> {target.title}</Link>{target.framework&&<small> · {target.framework}</small>}</li>)}</ul>
      :<p className="ioc-muted">Chưa có chỉ tiêu tự tính nào dùng bảng này.</p>}

    <h4 className="ds-subtitle">Dữ liệu {rows?`(${fmtNumber(rows.total)} dòng)`:''}</h4>
    {error?<div className="form-error" role="alert">{error}</div>
      :!rows?<SkeletonTable rows={5}/>
      :!rows.rows.length?<Empty title="Bảng chưa có dữ liệu" description={dataset.canEdit?'Thêm từng dòng hoặc tải mẫu Excel, điền rồi nhập vào.':'Đơn vị chủ quản chưa cập nhật dữ liệu cho bảng này.'}/>
      :<div className="table-wrap">
        <table className="ds-table">
          <thead><tr>
            {dataset.columns.map(column=><th key={column.key} scope="col" className={column.type==='number'?'ioc-num':undefined}>{column.label}</th>)}
            {dataset.canEdit&&!dataset.builtin&&<th scope="col"><span className="sr-only">Thao tác</span></th>}
          </tr></thead>
          <tbody>
            {rows.rows.map(row=><tr key={row.id}>
              {dataset.columns.map(column=><td key={column.key} className={column.type==='number'?'ioc-num':undefined}>{showValue(column,row.data[column.key])}</td>)}
              {dataset.canEdit&&!dataset.builtin&&<td className="ds-row-actions">
                <button type="button" className="btn ghost sm icon" aria-label="Sửa dòng" onClick={()=>setRowEditor({row})}><Pencil aria-hidden="true"/></button>
                <button type="button" className="btn ghost sm icon danger-text" aria-label="Xoá dòng" onClick={()=>setRemoving(row)}><Trash2 aria-hidden="true"/></button>
              </td>}
            </tr>)}
          </tbody>
        </table>
      </div>}
    {rows&&rows.total>PAGE&&<div className="ds-pager">
      <button type="button" className="btn secondary sm" disabled={page===0} onClick={()=>setPage(page-1)}>Trang trước</button>
      <span>Trang {page+1}/{totalPages}</span>
      <button type="button" className="btn secondary sm" disabled={page+1>=totalPages} onClick={()=>setPage(page+1)}>Trang sau</button>
    </div>}

    {rowEditor&&<RowForm dataset={dataset} row={rowEditor.row} onClose={()=>setRowEditor(null)} onSaved={async()=>{setRowEditor(null);await refreshAll()}}/>}
    {importing&&<ImportModal dataset={dataset} onClose={()=>setImporting(false)} onDone={async()=>{setImporting(false);await refreshAll()}}/>}
    {removing&&<Modal title="Xoá dòng dữ liệu?" description="Chỉ tiêu tự tính dùng bảng này sẽ được tính lại ngay. Thao tác không hoàn tác được." onClose={()=>{if(!busy)setRemoving(null)}}>
      <div className="modal-body">
        <p className="dos-confirm-target">{dataset.columns.slice(0,3).map(column=>`${column.label}: ${showValue(column,removing.data[column.key])}`).join(' · ')}</p>
        <div className="modal-actions">
          <button type="button" className="btn secondary" data-modal-initial-focus disabled={busy} onClick={()=>setRemoving(null)}>Huỷ</button>
          <button type="button" className="btn danger" disabled={busy} onClick={()=>void remove()}>{busy?'Đang xoá…':'Xoá dòng'}</button>
        </div>
      </div>
    </Modal>}
  </section>;
}

function RowForm({dataset,row,onClose,onSaved}:{dataset:DatasetDetail;row?:Row;onClose:()=>void;onSaved:()=>Promise<void>}){
  const [values,setValues]=useState<Record<string,string|boolean>>(()=>Object.fromEntries(dataset.columns.map(column=>{
    const value=row?.data[column.key];
    if(column.type==='boolean')return [column.key,value===true];
    if(column.type==='date'&&typeof value==='string')return [column.key,value.slice(0,10)];
    return [column.key,value===null||value===undefined?'':String(value)];
  })));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function save(event:FormEvent){
    event.preventDefault();
    const missing=dataset.columns.filter(column=>column.required&&column.type!=='boolean'&&!String(values[column.key]??'').trim());
    if(missing.length){setError(`Vui lòng nhập: ${missing.map(column=>column.label).join(', ')}.`);return}
    const data:Record<string,unknown>={};
    for(const column of dataset.columns){
      const value=values[column.key];
      if(column.type==='boolean')data[column.key]=Boolean(value);
      else if(typeof value==='string'&&value.trim()!=='')data[column.key]=value.trim();
      else data[column.key]=null;
    }
    setBusy(true);setError('');
    try{
      const path=`/datasets/${encodeURIComponent(dataset.code)}/rows${row?`/${encodeURIComponent(row.id)}`:''}`;
      const result=await api<{recomputed?:Recomputed[]}>(path,{method:row?'PATCH':'POST',body:JSON.stringify(row?{data,expectedVersion:row.version}:{data})});
      toast.ok(row?'Đã cập nhật dòng dữ liệu':'Đã thêm dòng dữ liệu');
      notifyRecomputed(result?.recomputed);
      await onSaved();
    }catch(caught){setError(caught instanceof ApiError&&caught.status===409?'Dòng vừa được người khác sửa. Đóng hộp thoại và tải lại.':caught instanceof Error?caught.message:'Không lưu được dòng dữ liệu')}
    finally{setBusy(false)}
  }

  return <Modal wide title={row?'Sửa dòng dữ liệu':'Thêm dòng dữ liệu'} description={dataset.name} onClose={()=>{if(!busy)onClose()}}>
    <form className="modal-body" onSubmit={save} noValidate>
      <div className="form-grid two">
        {dataset.columns.map(column=>{
          const label=<>{column.label}{column.required&&<span className="dos-req"> *</span>}</>;
          const value=values[column.key];
          const set=(next:string|boolean)=>setValues(current=>({...current,[column.key]:next}));
          if(column.type==='boolean')return <label key={column.key} className="ds-check"><input type="checkbox" checked={value===true} onChange={event=>set(event.target.checked)}/>{label}</label>;
          if(column.type==='enum')return <label key={column.key}>{label}<select value={String(value)} onChange={event=>set(event.target.value)}>
            <option value="">— Chọn —</option>{(column.options??[]).map(option=><option key={option} value={option}>{option}</option>)}
          </select></label>;
          return <label key={column.key}>{label}<input type={column.type==='date'?'date':'text'} inputMode={column.type==='number'?'decimal':undefined} value={String(value)} onChange={event=>set(event.target.value)}/></label>;
        })}
      </div>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Huỷ</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy?'Đang lưu…':'Lưu dòng'}</button>
      </div>
    </form>
  </Modal>;
}

function ImportModal({dataset,onClose,onDone}:{dataset:DatasetDetail;onClose:()=>void;onDone:()=>Promise<void>}){
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState<ImportResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function send(apply:boolean){
    if(!file){setError('Vui lòng chọn tệp Excel (.xlsx).');return}
    setBusy(true);setError('');
    try{
      const form=new FormData();form.set('file',file);
      const result=await api<ImportResult>(`/datasets/${encodeURIComponent(dataset.code)}/import${apply?'?apply=true':''}`,{method:'POST',body:form});
      if(apply){
        toast.ok('Đã nhập dữ liệu',`${fmtNumber(result.valid)} dòng vào «${dataset.name}»`);
        notifyRecomputed(result.recomputed);
        await onDone();
      }else setPreview(result);
    }catch(caught){setError(caught instanceof Error?caught.message:'Không đọc được tệp Excel')}
    finally{setBusy(false)}
  }

  return <Modal wide title="Nhập dữ liệu từ Excel" description="Bước 1 kiểm tra tệp, chưa ghi gì; bước 2 mới nhập khi tệp không còn dòng lỗi." onClose={()=>{if(!busy)onClose()}}>
    <div className="modal-body">
      <label>Tệp Excel theo mẫu của bảng
        <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>{setFile(event.target.files?.[0]??null);setPreview(null);setError('')}}/>
      </label>
      {preview&&<div className={preview.errors.length?'notice warn':'form-success'} role="status">
        <FileSpreadsheet aria-hidden="true"/>
        <div>
          <p><b>{fmtNumber(preview.valid)}/{fmtNumber(preview.total)}</b> dòng hợp lệ.{preview.errors.length?` Còn ${preview.errors.length} dòng lỗi — sửa trong tệp rồi kiểm tra lại.`:' Có thể nhập.'}</p>
          {preview.errors.length>0&&<ul className="ds-import-errors">{preview.errors.map(item=><li key={item.line}>Dòng {item.line}: {item.errors.join(' ')}</li>)}</ul>}
        </div>
      </div>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Huỷ</button>
        <button type="button" className="btn secondary" disabled={busy||!file} onClick={()=>void send(false)}>{busy&&!preview?'Đang kiểm tra…':'Kiểm tra tệp'}</button>
        <button type="button" className="btn primary" disabled={busy||!preview||preview.errors.length>0||!preview.valid} onClick={()=>void send(true)}><Upload aria-hidden="true"/>{busy&&preview?'Đang nhập…':'Nhập dữ liệu'}</button>
      </div>
    </div>
  </Modal>;
}

type ColumnDraft={key:string;label:string;type:DatasetColumn['type'];required:boolean;options:string};

function DatasetForm({item,departments,onClose,onSaved}:{item?:DatasetDetail;departments:Department[];onClose:()=>void;onSaved:(code:string)=>Promise<void>}){
  const [code,setCode]=useState(item?.code??'');
  const [name,setName]=useState(item?.name??'');
  const [description,setDescription]=useState(item?.description??'');
  const [ownerDepartmentId,setOwner]=useState(item?.ownerDepartment?.id??'');
  const [updateCycle,setUpdateCycle]=useState(item?.updateCycle??'');
  const [sourceSystem,setSourceSystem]=useState(item?.sourceSystem??'');
  const [collectionGuide,setGuide]=useState(item?.collectionGuide??'');
  const [columns,setColumns]=useState<ColumnDraft[]>(()=>item?.columns.map(column=>({key:column.key,label:column.label,type:column.type,required:Boolean(column.required),options:(column.options??[]).join(', ')}))??[{key:'',label:'',type:'text',required:true,options:''}]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const setColumn=(index:number,patch:Partial<ColumnDraft>)=>setColumns(list=>list.map((column,position)=>position===index?{...column,...patch}:column));

  function validate(){
    if(!item&&!/^[a-z][a-z0-9_]{2,47}$/.test(code))return 'Mã bảng gồm chữ thường không dấu, số, gạch dưới; 3–48 ký tự, bắt đầu bằng chữ.';
    if(name.trim().length<3)return 'Tên bảng phải có ít nhất 3 ký tự.';
    if(!columns.length||columns.length>40)return 'Bảng phải có từ 1 đến 40 cột.';
    const keys=new Set<string>();
    for(const column of columns){
      if(!/^[a-z][a-z0-9_]{0,39}$/.test(column.key))return `Mã cột «${column.key||column.label||'(trống)'}» chỉ gồm chữ thường không dấu, số, gạch dưới, bắt đầu bằng chữ.`;
      if(keys.has(column.key))return `Mã cột «${column.key}» bị trùng.`;
      keys.add(column.key);
      if(!column.label.trim())return `Cột «${column.key}» cần có nhãn.`;
      if(column.type==='enum'&&!column.options.split(',').map(value=>value.trim()).filter(Boolean).length)return `Cột danh mục «${column.label}» cần ít nhất một giá trị.`;
    }
    return '';
  }

  async function save(event:FormEvent){
    event.preventDefault();
    const problem=validate();
    if(problem){setError(problem);return}
    const body={
      name:name.trim(),description:description.trim()||undefined,ownerDepartmentId:ownerDepartmentId||undefined,
      updateCycle:updateCycle.trim()||undefined,sourceSystem:sourceSystem.trim()||undefined,collectionGuide:collectionGuide.trim()||undefined,
      columns:columns.map(column=>({key:column.key,label:column.label.trim(),type:column.type,required:column.required,
        ...(column.type==='enum'?{options:column.options.split(',').map(value=>value.trim()).filter(Boolean)}:{})})),
    };
    setBusy(true);setError('');
    try{
      if(item)await api(`/datasets/${encodeURIComponent(item.code)}`,{method:'PATCH',body:JSON.stringify({...body,expectedVersion:item.version})});
      else await api('/datasets',{method:'POST',body:JSON.stringify({...body,code})});
      toast.ok(item?'Đã cập nhật bảng dữ liệu':'Đã tạo bảng dữ liệu',name.trim());
      await onSaved(item?.code??code);
    }catch(caught){setError(caught instanceof Error?caught.message:'Không lưu được bảng dữ liệu')}
    finally{setBusy(false)}
  }

  return <Modal wide title={item?'Sửa bảng dữ liệu':'Tạo bảng dữ liệu'} description="Khai báo cột để hệ thống kiểm tra dữ liệu nhập vào và sinh mẫu Excel." onClose={()=>{if(!busy)onClose()}}>
    <form className="modal-body" onSubmit={save} noValidate>
      <div className="form-grid two">
        <label>Mã bảng<input type="text" value={code} disabled={Boolean(item)} maxLength={48} placeholder="vd: ho_so_dat_dai" onChange={event=>setCode(event.target.value.toLowerCase())}/></label>
        <label>Tên bảng<input type="text" value={name} maxLength={160} onChange={event=>setName(event.target.value)}/></label>
        <label className="full">Mô tả<textarea rows={2} value={description} maxLength={1000} onChange={event=>setDescription(event.target.value)}/></label>
        <label>Đơn vị chủ quản<select value={ownerDepartmentId} onChange={event=>setOwner(event.target.value)}>
          <option value="">Chưa giao</option>{departments.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}
        </select></label>
        <label>Chu kỳ cập nhật<input type="text" value={updateCycle} maxLength={120} placeholder="Hằng tháng, trước ngày 15" onChange={event=>setUpdateCycle(event.target.value)}/></label>
        <label className="full">Hệ thống nguồn<input type="text" value={sourceSystem} maxLength={300} onChange={event=>setSourceSystem(event.target.value)}/></label>
        <label className="full">Hướng dẫn thu thập<textarea rows={2} value={collectionGuide} maxLength={2000} onChange={event=>setGuide(event.target.value)}/></label>
      </div>
      <h4 className="ds-subtitle">Các cột</h4>
      {item&&<p className="field-hint">Đổi mã hoặc kiểu cột đang có dữ liệu có thể làm dữ liệu cũ không còn hợp lệ — chỉ thêm cột mới khi có thể.</p>}
      <div className="ds-col-editor">
        {columns.map((column,index)=><div key={index} className="ds-col-row">
          <label>Mã cột<input type="text" value={column.key} maxLength={40} onChange={event=>setColumn(index,{key:event.target.value.toLowerCase()})}/></label>
          <label>Nhãn<input type="text" value={column.label} maxLength={120} onChange={event=>setColumn(index,{label:event.target.value})}/></label>
          <label>Kiểu<select value={column.type} onChange={event=>setColumn(index,{type:event.target.value as DatasetColumn['type']})}>
            {(Object.keys(typeLabels) as DatasetColumn['type'][]).map(key=><option key={key} value={key}>{typeLabels[key]}</option>)}
          </select></label>
          {column.type==='enum'&&<label>Giá trị (phân cách dấu phẩy)<input type="text" value={column.options} onChange={event=>setColumn(index,{options:event.target.value})}/></label>}
          <label className="ds-check"><input type="checkbox" checked={column.required} onChange={event=>setColumn(index,{required:event.target.checked})}/>Bắt buộc</label>
          <button type="button" className="btn ghost sm icon danger-text" aria-label={`Bỏ cột ${column.label||column.key}`} disabled={columns.length<=1} onClick={()=>setColumns(list=>list.filter((_,position)=>position!==index))}><Trash2 aria-hidden="true"/></button>
        </div>)}
        <button type="button" className="btn ghost sm" disabled={columns.length>=40} onClick={()=>setColumns(list=>[...list,{key:'',label:'',type:'text',required:false,options:''}])}><Plus aria-hidden="true"/>Thêm cột</button>
      </div>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>Huỷ</button>
        <button type="submit" className="btn primary" disabled={busy}>{busy?'Đang lưu…':item?'Lưu bảng':'Tạo bảng'}</button>
      </div>
    </form>
  </Modal>;
}
