import { CheckCircle2, KeyRound, Plus, Search, ShieldCheck, UserCheck, Users as UsersIcon } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getInitials } from '../authz';
import { api, auth } from '../api';
import { Empty, Modal, PageHead, Spinner } from '../components/UI';
import type { Department, Role, User } from '../types';

const roleNames:Record<Role,string>={
  ADMIN:'Quản trị hệ thống',
  MANAGER:'Lãnh đạo đơn vị',
  STAFF:'Cán bộ cập nhật',
  VIEWER:'Chỉ xem báo cáo',
};

type CreateUserForm={username:string;password:string;fullName:string;email:string;role:Role;departmentId:string};
const emptyForm:CreateUserForm={username:'',password:'',fullName:'',email:'',role:'STAFF',departmentId:''};

function formatLastLogin(value?:string|null){
  if(!value)return 'Chưa đăng nhập';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Chưa có dữ liệu':date.toLocaleString('vi-VN');
}

export default function Users(){
  const actor=auth.user;
  const isAdmin=actor?.role==='ADMIN';
  const [users,setUsers]=useState<User[]>([]);
  const [departments,setDepartments]=useState<Department[]>([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [roleFilter,setRoleFilter]=useState<Role|''>('');
  const [departmentFilter,setDepartmentFilter]=useState('');
  const [modalOpen,setModalOpen]=useState(false);
  const [form,setForm]=useState<CreateUserForm>(emptyForm);
  const [formError,setFormError]=useState('');
  const [pageError,setPageError]=useState('');
  const [success,setSuccess]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const [updatingId,setUpdatingId]=useState('');

  async function load(){
    if(!isAdmin){setLoading(false);return}
    setLoading(true);setPageError('');
    try{
      const [userRows,departmentRows]=await Promise.all([api<User[]>('/users'),api<Department[]>('/departments')]);
      setUsers(userRows);setDepartments(departmentRows);
      const firstActive=departmentRows.find(department=>department.isActive)?.id||'';
      setForm(current=>({...current,departmentId:current.departmentId||firstActive}));
    }catch(reason){
      setPageError(reason instanceof Error?reason.message:'Không thể tải danh sách tài khoản');
    }finally{setLoading(false)}
  }

  useEffect(()=>{void load()},[]);

  const activeDepartments=departments.filter(department=>department.isActive);
  const visible=useMemo(()=>{
    const keyword=search.trim().toLocaleLowerCase('vi-VN');
    return users.filter(user=>{
      const matchesSearch=!keyword||`${user.fullName} ${user.username} ${user.email||''} ${user.department?.name||''}`.toLocaleLowerCase('vi-VN').includes(keyword);
      return matchesSearch&&(!roleFilter||user.role===roleFilter)&&(!departmentFilter||user.departmentId===departmentFilter);
    });
  },[users,search,roleFilter,departmentFilter]);

  function openCreate(){
    setForm({...emptyForm,departmentId:activeDepartments[0]?.id||''});
    setFormError('');setModalOpen(true);
  }

  async function create(event:FormEvent){
    event.preventDefault();setSubmitting(true);setFormError('');setSuccess('');
    try{
      const payload={
        username:form.username,
        password:form.password,
        fullName:form.fullName,
        email:form.email.trim()||undefined,
        role:form.role,
        departmentId:form.departmentId||undefined,
      };
      const created=await api<User>('/users',{method:'POST',body:JSON.stringify(payload)});
      setUsers(current=>[created,...current]);
      setModalOpen(false);setSuccess(`Đã tạo tài khoản @${created.username}.`);
    }catch(reason){
      setFormError(reason instanceof Error?reason.message:'Không thể tạo tài khoản');
    }finally{setSubmitting(false)}
  }

  async function toggleActive(user:User){
    if(user.id===actor?.id&&user.isActive)return;
    const action=user.isActive?'khóa':'mở khóa';
    if(!window.confirm(`Bạn có chắc muốn ${action} tài khoản @${user.username}?`))return;
    setUpdatingId(user.id);setPageError('');setSuccess('');
    try{
      const updated=await api<User>(`/users/${user.id}`,{method:'PATCH',body:JSON.stringify({isActive:!user.isActive})});
      setUsers(current=>current.map(row=>row.id===updated.id?updated:row));
      setSuccess(`Đã ${updated.isActive?'mở khóa':'khóa'} tài khoản @${updated.username}.`);
    }catch(reason){
      setPageError(reason instanceof Error?reason.message:`Không thể ${action} tài khoản`);
    }finally{setUpdatingId('')}
  }

  if(!isAdmin)return <><PageHead eyebrow="QUẢN TRỊ TRUY CẬP" title="Không có quyền truy cập" description="Chỉ quản trị viên hệ thống được quản lý tài khoản."/><Empty title="Quyền truy cập bị giới hạn" description="Vui lòng quay lại trang tổng quan."/></>;

  return <>
    <PageHead eyebrow="QUẢN TRỊ TRUY CẬP" title="Tài khoản người dùng" description="Cấp quyền đúng vai trò và gắn tài khoản với đơn vị chịu trách nhiệm." actions={<button className="btn primary" onClick={openCreate}><Plus/>Tạo tài khoản</button>}/>

    {pageError&&<div className="form-error">{pageError}</div>}
    {success&&<div className="import-result"><CheckCircle2/><div><strong>Thao tác thành công</strong><p>{success}</p></div></div>}

    <div className="mini-stat-grid">
      <div><span><UsersIcon/></span><p>Tổng tài khoản<strong>{users.length}</strong></p></div>
      <div><span><UserCheck/></span><p>Đang hoạt động<strong>{users.filter(user=>user.isActive).length}</strong></p></div>
      <div><span><ShieldCheck/></span><p>Quản trị viên<strong>{users.filter(user=>user.role==='ADMIN'&&user.isActive).length}</strong></p></div>
      <div><span><KeyRound/></span><p>Chưa từng đăng nhập<strong>{users.filter(user=>!user.lastLoginAt).length}</strong></p></div>
    </div>

    <div className="table-card">
      <div className="toolbar inside">
        <div className="search"><Search/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Tìm tên, tài khoản, email, phòng ban..."/></div>
        <select aria-label="Lọc theo vai trò" value={roleFilter} onChange={event=>setRoleFilter(event.target.value as Role|'')}><option value="">Tất cả vai trò</option>{Object.entries(roleNames).map(([role,label])=><option key={role} value={role}>{label}</option>)}</select>
        <select aria-label="Lọc theo phòng ban" value={departmentFilter} onChange={event=>setDepartmentFilter(event.target.value)}><option value="">Tất cả phòng ban</option>{departments.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}</select>
      </div>
      {loading?<Spinner/>:<div className="table-wrap"><table><thead><tr><th>Người dùng</th><th>Phòng ban</th><th>Vai trò</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th>Thao tác</th></tr></thead><tbody>{visible.length?visible.map(user=><tr key={user.id}>
        <td><div className="user-cell"><div className="avatar color">{getInitials(user.fullName)}</div><div><strong>{user.fullName}</strong><span>@{user.username}{user.email&&<> · {user.email}</>}</span></div></div></td>
        <td>{user.department?.name||'Không gắn cố định'}</td>
        <td><span className={`role role-${user.role.toLowerCase()}`}>{roleNames[user.role]}</span></td>
        <td><span className={`status ${user.isActive?'green':'slate'}`}><i/>{user.isActive?'Hoạt động':'Đã khóa'}</span></td>
        <td><span className="muted">{formatLastLogin(user.lastLoginAt)}</span></td>
        <td><button className="btn secondary" disabled={updatingId===user.id||(user.id===actor?.id&&user.isActive)} title={user.id===actor?.id?'Không thể tự khóa tài khoản đang đăng nhập':''} onClick={()=>void toggleActive(user)}>{updatingId===user.id?'Đang lưu...':user.isActive?'Khóa':'Mở khóa'}</button></td>
      </tr>):<tr><td colSpan={6}><Empty title="Không tìm thấy tài khoản" description="Hãy thay đổi từ khóa hoặc bộ lọc."/></td></tr>}</tbody></table></div>}
    </div>

    {modalOpen&&<Modal title="Tạo tài khoản mới" onClose={()=>setModalOpen(false)} wide><form className="form-grid" onSubmit={create}>
      {formError&&<div className="form-error full">{formError}</div>}
      <label>Họ và tên<input required minLength={2} maxLength={160} value={form.fullName} onChange={event=>setForm({...form,fullName:event.target.value})} placeholder="Nguyễn Văn A"/></label>
      <label>Email<input type="email" maxLength={180} value={form.email} onChange={event=>setForm({...form,email:event.target.value})} placeholder="email@tanhung.gov.vn"/></label>
      <label>Tên đăng nhập<input required minLength={3} maxLength={50} pattern="[A-Za-z0-9._-]+" value={form.username} onChange={event=>setForm({...form,username:event.target.value})} placeholder="nguyen.van.a" autoComplete="off"/></label>
      <label>Mật khẩu ban đầu<input required minLength={8} maxLength={128} type="password" value={form.password} onChange={event=>setForm({...form,password:event.target.value})} autoComplete="new-password"/></label>
      <label>Vai trò<select value={form.role} onChange={event=>{const role=event.target.value as Role;setForm({...form,role,departmentId:role==='ADMIN'?form.departmentId:form.departmentId||activeDepartments[0]?.id||''})}}>{Object.entries(roleNames).map(([role,label])=><option key={role} value={role}>{label}</option>)}</select></label>
      <label>Phòng ban<select required={form.role!=='ADMIN'} value={form.departmentId} onChange={event=>setForm({...form,departmentId:event.target.value})}><option value="">{form.role==='ADMIN'?'Không gắn cố định':'Chọn phòng ban'}</option>{activeDepartments.map(department=><option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      <div className="permission-note full"><ShieldCheck/><div><strong>Quyền truy cập theo vai trò</strong><p>Tài khoản ngoài vai trò quản trị chỉ được xem và báo cáo dữ liệu của phòng ban đã chọn.</p></div></div>
      <div className="modal-actions full"><button type="button" className="btn secondary" disabled={submitting} onClick={()=>setModalOpen(false)}>Hủy</button><button className="btn primary" disabled={submitting||(form.role!=='ADMIN'&&!form.departmentId)}>{submitting?'Đang tạo...':'Tạo tài khoản'}</button></div>
    </form></Modal>}
  </>;
}
