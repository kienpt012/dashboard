import { Building2, CheckCheck, FileBarChart, Gauge, LogOut, Menu, Settings, Sheet, Target, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ADMIN_ROLES, ALL_ROLES, APPROVAL_ROLES, getInitials, hasAnyRole, IMPORT_ROLES, roleLabels } from '../authz';
import { auth } from '../api';

const items=[
  {to:'/admin',label:'Tổng quan điều hành',icon:Gauge,roles:ALL_ROLES},
  {to:'/admin/targets',label:'Quản lý chỉ tiêu',icon:Target,roles:ALL_ROLES},
  {to:'/admin/reports',label:'Báo cáo chỉ tiêu',icon:FileBarChart,roles:ALL_ROLES},
  {to:'/admin/imports',label:'Nhập dữ liệu báo cáo',icon:Sheet,roles:IMPORT_ROLES},
  {to:'/admin/approvals',label:'Duyệt báo cáo',icon:CheckCheck,roles:APPROVAL_ROLES},
  {to:'/admin/departments',label:'Phòng ban',icon:Building2,roles:ALL_ROLES},
  {to:'/admin/users',label:'Tài khoản',icon:Users,roles:ADMIN_ROLES},
  {to:'/admin/settings',label:'Thiết lập hệ thống',icon:Settings,roles:ADMIN_ROLES},
];

const titles:Record<string,string>={
  '/admin':'Tổng quan điều hành',
  '/admin/targets':'Quản lý chỉ tiêu',
  '/admin/reports':'Báo cáo chỉ tiêu',
  '/admin/imports':'Nhập dữ liệu báo cáo',
  '/admin/approvals':'Duyệt báo cáo',
  '/admin/departments':'Cơ cấu phòng ban',
  '/admin/users':'Quản lý tài khoản',
  '/admin/settings':'Thiết lập hệ thống',
  '/admin/forbidden':'Quyền truy cập',
};

const departmentTitles:Record<string,string>={
  '/admin':'Tổng quan đơn vị',
  '/admin/targets':'Chỉ tiêu của đơn vị',
  '/admin/reports':'Báo cáo của đơn vị',
  '/admin/imports':'Nộp báo cáo Excel',
  '/admin/departments':'Thông tin phòng ban',
};

export default function Layout(){
  const [open,setOpen]=useState(false);
  const location=useLocation();
  const navigate=useNavigate();
  const user=auth.user;
  const isAdmin=user?.role==='ADMIN';
  const initials=getInitials(user?.fullName);
  const roleLabel=user?roleLabels[user.role]:'Người dùng';
  const scopeLabel=isAdmin?'Toàn hệ thống':user?.department?.name||'Chưa gán phòng ban';
  const visibleItems=items.filter(item=>hasAnyRole(user,item.roles));
  const title=(!isAdmin&&departmentTitles[location.pathname])||titles[location.pathname]||'Trung tâm điều hành';
  const labelFor=(to:string,label:string)=>(!isAdmin&&departmentTitles[to])||label;

  useEffect(()=>setOpen(false),[location.pathname]);
  const logout=()=>{auth.clear();navigate('/admin/login',{replace:true})};

  return <div className="app-shell">
    <aside className={`sidebar ${open?'open':''}`}>
      <div className="brand"><div className="brand-mark">TH</div><div><strong>IOC TÂN HƯNG</strong><span>Trung tâm điều hành</span></div><button className="mobile-close" onClick={()=>setOpen(false)} aria-label="Đóng menu"><X/></button></div>
      <div className="system-state"><i/>Phiên làm việc đã xác thực</div>
      <nav><p className="nav-label">KHÔNG GIAN LÀM VIỆC</p>{visibleItems.map(({to,label,icon:Icon})=><NavLink key={to} to={to} end={to==='/admin'} className={({isActive})=>isActive?'active':''}><Icon size={19}/><span>{labelFor(to,label)}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><div className="avatar">{initials}</div><div><strong>{user?.fullName||'Người dùng'}</strong><span>{roleLabel}</span></div><button onClick={logout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={18}/></button></div>
    </aside>
    {open&&<div className="backdrop" onClick={()=>setOpen(false)}/>}
    <main className="main-area">
      <header className="topbar">
        <button className="menu-btn" onClick={()=>setOpen(true)} aria-label="Mở menu"><Menu/></button>
        <div><span className="breadcrumb">{roleLabel} / {scopeLabel}</span><h1>{title}</h1></div>
        <div className="top-actions"><div className="clock-chip"><Building2 size={15}/>{scopeLabel}</div><div className="profile-chip"><div className="avatar small">{initials}</div><span>{user?.fullName||'Người dùng'}</span></div></div>
      </header>
      <div className="page"><Outlet/></div>
    </main>
  </div>;
}
