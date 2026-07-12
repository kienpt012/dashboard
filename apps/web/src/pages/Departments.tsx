import { Building2, Plus, Target, Users } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, auth } from '../api';
import { Empty, Modal, PageHead, Spinner } from '../components/UI';
import type { Department } from '../types';

const emptyForm={code:'',name:'',description:'',color:'#0f766e'};

export default function Departments(){
  const user=auth.user;
  const isAdmin=user?.role==='ADMIN';
  const [departments,setDepartments]=useState<Department[]>([]);
  const [loading,setLoading]=useState(true);
  const [modalOpen,setModalOpen]=useState(false);
  const [submitting,setSubmitting]=useState(false);
  const [pageError,setPageError]=useState('');
  const [formError,setFormError]=useState('');
  const [form,setForm]=useState(emptyForm);

  async function load(){
    setLoading(true);setPageError('');
    try{
      const result=await api<Department[]>('/departments');
      setDepartments(isAdmin?result:result.filter(department=>department.id===user?.departmentId));
    }catch(reason){
      setPageError(reason instanceof Error?reason.message:'Không thể tải thông tin phòng ban');
    }finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[]);

  function openCreate(){setForm(emptyForm);setFormError('');setModalOpen(true)}

  async function submit(event:FormEvent){
    event.preventDefault();setSubmitting(true);setFormError('');
    try{
      await api('/departments',{method:'POST',body:JSON.stringify(form)});
      setModalOpen(false);setForm(emptyForm);await load();
    }catch(reason){
      setFormError(reason instanceof Error?reason.message:'Không thể tạo phòng ban');
    }finally{setSubmitting(false)}
  }

  return <>
    <PageHead
      eyebrow="CƠ CẤU TỔ CHỨC"
      title={isAdmin?'Phòng ban & đơn vị':user?.department?.name||'Thông tin phòng ban'}
      description={isAdmin?'Quản lý các đầu mối thực hiện và quy mô chỉ tiêu được giao.':'Thông tin dưới đây được giới hạn trong đơn vị của tài khoản đang đăng nhập.'}
      actions={isAdmin?<button className="btn primary" onClick={openCreate}><Plus/>Thêm phòng ban</button>:undefined}
    />

    {pageError&&<div className="form-error">{pageError} <button className="btn secondary" onClick={()=>void load()}>Thử lại</button></div>}
    {loading?<Spinner/>:departments.length?<div className="department-grid">{departments.map(department=><article className="department-card" key={department.id}>
      <div className="dep-card-head"><div className="dep-large-icon" style={{background:`${department.color}16`,color:department.color}}><Building2/></div><span className={`status ${department.isActive?'green':'slate'}`}><i/>{department.isActive?'Đang hoạt động':'Ngừng hoạt động'}</span></div>
      <span>{department.code}</span>
      <h3>{department.name}</h3>
      <p>{department.description||'Chưa có mô tả cho đơn vị này.'}</p>
      <div className="dep-card-stats"><div><Users/><span>Nhân sự<b>{department._count?.users??0}</b></span></div><div><Target/><span>Chỉ tiêu<b>{department._count?.targets??0}</b></span></div></div>
      <i className="dep-accent" style={{background:department.color}}/>
    </article>)}</div>:<Empty
      title="Chưa có thông tin phòng ban"
      description={isAdmin?'Hãy tạo phòng ban đầu tiên để bắt đầu giao chỉ tiêu.':'Liên hệ quản trị viên để kiểm tra đơn vị được gán cho tài khoản.'}
    />}

    {isAdmin&&modalOpen&&<Modal title="Thêm phòng ban" onClose={()=>setModalOpen(false)}><form className="form-grid single" onSubmit={submit}>
      {formError&&<div className="form-error full">{formError}</div>}
      <label className="full">Mã phòng ban<input required minLength={2} maxLength={30} value={form.code} onChange={event=>setForm({...form,code:event.target.value.toUpperCase()})} placeholder="VD: TCKH"/></label>
      <label className="full">Tên phòng ban<input required minLength={2} maxLength={160} value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label>
      <label className="full">Mô tả<textarea maxLength={1000} value={form.description} onChange={event=>setForm({...form,description:event.target.value})}/></label>
      <label className="full">Màu nhận diện<div className="color-input"><input type="color" value={form.color} onChange={event=>setForm({...form,color:event.target.value})}/><input required pattern="^#[0-9A-Fa-f]{6}$" value={form.color} onChange={event=>setForm({...form,color:event.target.value})}/></div></label>
      <div className="modal-actions full"><button type="button" className="btn secondary" disabled={submitting} onClick={()=>setModalOpen(false)}>Hủy</button><button className="btn primary" disabled={submitting}>{submitting?'Đang tạo...':'Thêm phòng ban'}</button></div>
    </form></Modal>}
  </>;
}
