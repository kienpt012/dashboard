import { Bell, Building2, ChevronDown, FileBarChart, Gauge, LogOut, Menu, Settings, Sheet, Target, Users, X } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { auth } from '../api';

const items=[
  {to:'/admin',label:'Tổng quan điều hành',icon:Gauge},
  {to:'/admin/targets',label:'Quản lý chỉ tiêu',icon:Target},
  {to:'/admin/reports',label:'Báo cáo chỉ tiêu',icon:FileBarChart},
  {to:'/admin/imports',label:'Import dữ liệu',icon:Sheet},
  {to:'/admin/departments',label:'Phòng ban',icon:Building2},
  {to:'/admin/users',label:'Tài khoản',icon:Users},
  {to:'/admin/settings',label:'Thiết lập hệ thống',icon:Settings},
];
const titles:Record<string,string>={'/admin':'Tổng quan điều hành','/admin/targets':'Quản lý chỉ tiêu','/admin/reports':'Báo cáo chỉ tiêu','/admin/imports':'Import dữ liệu','/admin/departments':'Cơ cấu phòng ban','/admin/users':'Quản lý tài khoản','/admin/settings':'Thiết lập hệ thống'};

export default function Layout(){
  const [open,setOpen]=useState(false); const location=useLocation(); const navigate=useNavigate(); const user=auth.user;
  useEffect(()=>setOpen(false),[location.pathname]);
  const logout=()=>{auth.clear();navigate('/admin/login')};
  return <div className="app-shell">
    <aside className={`sidebar ${open?'open':''}`}>
      <div className="brand"><div className="brand-mark">TH</div><div><strong>IOC TÂN HƯNG</strong><span>Trung tâm điều hành</span></div><button className="mobile-close" onClick={()=>setOpen(false)}><X/></button></div>
      <div className="system-state"><i/>Hệ thống đang hoạt động</div>
      <nav><p className="nav-label">KHÔNG GIAN QUẢN TRỊ</p>{items.map(({to,label,icon:Icon})=><NavLink key={to} to={to} end={to==='/admin'} className={({isActive})=>isActive?'active':''}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><div className="avatar">{user?.fullName?.split(' ').slice(-2).map((s:string)=>s[0]).join('').toUpperCase()||'QT'}</div><div><strong>{user?.fullName||'Quản trị viên'}</strong><span>{user?.role==='ADMIN'?'Quản trị hệ thống':'Người dùng'}</span></div><button onClick={logout} title="Đăng xuất"><LogOut size={18}/></button></div>
    </aside>
    {open&&<div className="backdrop" onClick={()=>setOpen(false)}/>}
    <main className="main-area">
      <header className="topbar"><button className="menu-btn" onClick={()=>setOpen(true)}><Menu/></button><div><span className="breadcrumb">IOC Tân Hưng / Quản trị</span><h1>{titles[location.pathname]||'Trung tâm điều hành'}</h1></div><div className="top-actions"><div className="clock-chip"><i/>Dữ liệu trực tuyến</div><button className="icon-btn"><Bell size={19}/><b>3</b></button><button className="profile-chip"><div className="avatar small">QT</div><span>Quản trị viên</span><ChevronDown size={16}/></button></div></header>
      <div className="page"><Outlet/></div>
    </main>
  </div>
}
