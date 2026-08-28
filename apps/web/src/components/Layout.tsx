import { Bot, Building2, CheckCheck, FileBarChart, FileText, Gauge, History, LayoutDashboard, LogOut, Menu, MessageSquareText, Settings, Sheet, Target, UserRound, Users, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ADMIN_ROLES, ALL_ROLES, APPROVAL_ROLES, getInitials, hasAnyRole, IMPORT_ROLES, roleLabels } from '../authz';
import { auth } from '../api';

const items=[
  {to:'/admin',label:'Tổng quan điều hành',icon:Gauge,roles:ALL_ROLES},
  {to:'/admin/copilot',label:'IOC Copilot',icon:Bot,roles:ALL_ROLES},
  {to:'/admin/targets',label:'Quản lý chỉ tiêu',icon:Target,roles:ALL_ROLES},
  {to:'/admin/reports',label:'Báo cáo chỉ tiêu',icon:FileBarChart,roles:ALL_ROLES},
  {to:'/admin/imports',label:'Nhập dữ liệu báo cáo',icon:Sheet,roles:IMPORT_ROLES},
  {to:'/admin/documents',label:'Kho văn bản',icon:FileText,roles:ALL_ROLES},
  {to:'/admin/approvals',label:'Duyệt báo cáo',icon:CheckCheck,roles:APPROVAL_ROLES},
  {to:'/admin/feedback',label:'Phản ánh người dân',icon:MessageSquareText,roles:ALL_ROLES},
  {to:'/admin/departments',label:'Phòng ban',icon:Building2,roles:ALL_ROLES},
  {to:'/admin/users',label:'Tài khoản',icon:Users,roles:ADMIN_ROLES},
  {to:'/admin/settings',label:'Thiết lập hệ thống',icon:Settings,roles:ADMIN_ROLES},
  {to:'/admin/public-dashboard',label:'Thiết kế trang công khai',icon:LayoutDashboard,roles:ADMIN_ROLES},
  {to:'/admin/audit-logs',label:'Nhật ký hệ thống',icon:History,roles:ADMIN_ROLES},
  {to:'/admin/profile',label:'Hồ sơ & bảo mật',icon:UserRound,roles:ALL_ROLES},
];

const titles:Record<string,string>={
  '/admin':'Tổng quan điều hành',
  '/admin/copilot':'IOC Copilot',
  '/admin/targets':'Quản lý chỉ tiêu',
  '/admin/reports':'Báo cáo chỉ tiêu',
  '/admin/imports':'Nhập dữ liệu báo cáo',
  '/admin/documents':'Kho văn bản',
  '/admin/approvals':'Duyệt báo cáo',
  '/admin/feedback':'Tiếp nhận phản ánh',
  '/admin/departments':'Cơ cấu phòng ban',
  '/admin/users':'Quản lý tài khoản',
  '/admin/settings':'Thiết lập hệ thống',
  '/admin/public-dashboard':'Thiết kế trang công khai',
  '/admin/audit-logs':'Nhật ký hệ thống',
  '/admin/profile':'Hồ sơ & bảo mật',
  '/admin/forbidden':'Quyền truy cập',
};

const departmentTitles:Record<string,string>={
  '/admin':'Tổng quan đơn vị',
  '/admin/targets':'Chỉ tiêu của đơn vị',
  '/admin/reports':'Báo cáo của đơn vị',
  '/admin/imports':'Nộp báo cáo Excel',
  '/admin/feedback':'Phản ánh của đơn vị',
  '/admin/departments':'Thông tin phòng ban',
  '/admin/profile':'Hồ sơ & bảo mật',
};

export default function Layout(){
  const [open,setOpen]=useState(false);
  const sidebarRef=useRef<HTMLElement>(null);
  const menuButtonRef=useRef<HTMLButtonElement>(null);
  const location=useLocation();
  const navigate=useNavigate();
  const user=auth.user;
  const isAdmin=user?.role==='ADMIN';
  const initials=getInitials(user?.fullName);
  const roleLabel=user?roleLabels[user.role]:'Người dùng';
  const scopeLabel=isAdmin?'Toàn hệ thống':user?.department?.name||'Chưa gán phòng ban';
  const visibleItems=items.filter(item=>hasAnyRole(user,item.roles));
  const title=(!isAdmin&&departmentTitles[location.pathname])||titles[location.pathname]||(location.pathname.startsWith('/admin/documents/')?'Xác minh trích xuất AI':'Trung tâm điều hành');
  const labelFor=(to:string,label:string)=>(!isAdmin&&departmentTitles[to])||label;

  useEffect(()=>setOpen(false),[location.pathname]);
  useLayoutEffect(()=>{
    if(!open)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const focusClose=()=>sidebarRef.current?.querySelector<HTMLElement>('.mobile-close')?.focus();
    focusClose();
    const focusTimer=window.setTimeout(focusClose,280);
    const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false)};
    window.addEventListener('keydown',close);
    return()=>{
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown',close);
      document.body.style.overflow=previousOverflow;
      window.setTimeout(()=>menuButtonRef.current?.focus(),0);
    };
  },[open]);
  const logout=()=>{auth.clear();navigate('/admin/login',{replace:true})};

  function keepSidebarFocus(event:ReactKeyboardEvent<HTMLElement>){
    if(!open||event.key!=='Tab')return;
    const items=[...(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')||[])];
    if(!items.length)return;
    const first=items[0];const last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }

  return <div className="app-shell">
    <aside ref={sidebarRef} id="admin-navigation" aria-label="Điều hướng quản trị" className={`sidebar ${open?'open':''}`} onKeyDown={keepSidebarFocus}>
      <div className="brand"><div className="brand-mark">LT</div><div><strong>IOC LÁI THIÊU</strong><span>Trung tâm điều hành</span></div><button className="mobile-close" onClick={()=>setOpen(false)} aria-label="Đóng menu"><X/></button></div>
      <div className="system-state"><i/>Phiên làm việc đã xác thực</div>
      <nav><p className="nav-label">KHÔNG GIAN LÀM VIỆC</p>{visibleItems.map(({to,label,icon:Icon})=><NavLink key={to} to={to} end={to==='/admin'} className={({isActive})=>isActive?'active':''}><Icon size={19}/><span>{labelFor(to,label)}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><div className="avatar">{initials}</div><div><strong>{user?.fullName||'Người dùng'}</strong><span>{roleLabel}</span></div><button onClick={logout} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={18}/></button></div>
    </aside>
    {open&&<div className="backdrop" onClick={()=>setOpen(false)}/>}
    <main className="main-area" inert={open?true:undefined} aria-hidden={open?true:undefined}>
      <header className="topbar">
        <button ref={menuButtonRef} className="menu-btn" onClick={()=>setOpen(true)} aria-label="Mở menu" aria-controls="admin-navigation" aria-expanded={open}><Menu/></button>
        <div><span className="breadcrumb">{roleLabel} / {scopeLabel}</span><h1>{title}</h1></div>
        <div className="top-actions"><div className="clock-chip"><Building2 size={15}/>{scopeLabel}</div><NavLink to="/admin/profile" className={({isActive})=>`profile-chip${isActive?' active':''}`} aria-label="Mở hồ sơ và bảo mật" title="Hồ sơ & bảo mật"><div className="avatar small">{initials}</div><span>{user?.fullName||'Người dùng'}</span></NavLink></div>
      </header>
      <div className="page"><Outlet/></div>
    </main>
  </div>;
}
