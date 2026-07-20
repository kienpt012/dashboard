import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ADMIN_ROLES, ALL_ROLES, APPROVAL_ROLES, hasAnyRole, IMPORT_ROLES } from './authz';
import { api, ApiError, auth } from './api';
import Layout from './components/Layout';
import { Spinner } from './components/UI';
import Dashboard from './pages/Dashboard';
import Departments from './pages/Departments';
import Forbidden from './pages/Forbidden';
import Imports from './pages/Imports';
import Login from './pages/Login';
import PublicHome from './pages/PublicHome';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Targets from './pages/Targets';
import Users from './pages/Users';
import Approvals from './pages/Approvals';
import FeedbackAdmin from './pages/FeedbackAdmin';
import FeedbackPublic from './pages/FeedbackPublic';
import PublishedFeedbackDetail from './pages/PublishedFeedbackDetail';
import AuditLogs from './pages/AuditLogs';
import Profile from './pages/Profile';
import type { AuthMeResponse, Role, User } from './types';

function Protected(){
  const token=auth.token;
  const [loading,setLoading]=useState(Boolean(token));
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);

  useEffect(()=>{
    let active=true;
    if(!token){setLoading(false);return}
    setLoading(true);setError('');
    api<AuthMeResponse>('/auth/me').then(result=>{
      if(!active)return;
      const user:User='user' in result?result.user:result;
      auth.setUser(user);
      setLoading(false);
    }).catch((reason:unknown)=>{
      if(!active)return;
      setLoading(false);
      if(reason instanceof ApiError&&reason.status===401)return;
      setError(reason instanceof Error?reason.message:'Không thể xác thực phiên đăng nhập');
    });
    return()=>{active=false};
  },[token,attempt]);

  if(!token)return <Navigate to="/admin/login" replace/>;
  if(loading)return <Spinner/>;
  if(error)return <div className="spinner-wrap"><div className="panel"><h3>Không thể xác thực phiên làm việc</h3><p>{error}</p><button className="btn primary" onClick={()=>setAttempt(value=>value+1)}>Thử lại</button></div></div>;
  return <Layout/>;
}

function RoleRoute({allowed,children}:{allowed:readonly Role[];children:ReactNode}){
  const location=useLocation();
  if(!hasAnyRole(auth.user,allowed))return <Navigate to="/admin/forbidden" replace state={{from:location.pathname}}/>;
  return <>{children}</>;
}

function LoginRoute(){
  return auth.token?<Navigate to="/admin" replace/>:<Login/>;
}

const pageTitles: Record<string, string> = {
  '/': 'IOC Lái Thiêu · Cổng thông tin điều hành',
  '/phan-anh': 'Gửi và tra cứu phản ánh · Phường Lái Thiêu',
  '/admin/login': 'Đăng nhập nội bộ · IOC Lái Thiêu',
  '/admin': 'Tổng quan điều hành · IOC Lái Thiêu',
  '/admin/targets': 'Quản lý chỉ tiêu · IOC Lái Thiêu',
  '/admin/reports': 'Báo cáo chỉ tiêu · IOC Lái Thiêu',
  '/admin/imports': 'Nhập dữ liệu báo cáo · IOC Lái Thiêu',
  '/admin/approvals': 'Duyệt báo cáo · IOC Lái Thiêu',
  '/admin/feedback': 'Tiếp nhận phản ánh · IOC Lái Thiêu',
  '/admin/departments': 'Cơ cấu phòng ban · IOC Lái Thiêu',
  '/admin/users': 'Quản lý tài khoản · IOC Lái Thiêu',
  '/admin/settings': 'Thiết lập hệ thống · IOC Lái Thiêu',
  '/admin/audit-logs': 'Nhật ký hệ thống · IOC Lái Thiêu',
  '/admin/profile': 'Hồ sơ và bảo mật · IOC Lái Thiêu',
};

function DocumentTitle(){
  const location=useLocation();
  useEffect(()=>{
    document.title=location.pathname.startsWith('/phan-anh/cong-khai/')
      ?'Chi tiết phản ánh công khai · Phường Lái Thiêu'
      :(pageTitles[location.pathname]||'IOC Lái Thiêu');
  },[location.pathname]);
  return null;
}

export default function App(){
  return <><DocumentTitle/><Routes>
    <Route path="/" element={<PublicHome/>}/>
    <Route path="/phan-anh" element={<FeedbackPublic/>}/>
    <Route path="/phan-anh/cong-khai/:code" element={<PublishedFeedbackDetail/>}/>
    <Route path="/admin/login" element={<LoginRoute/>}/>
    <Route path="/admin" element={<Protected/>}>
      <Route index element={<RoleRoute allowed={ALL_ROLES}><Dashboard/></RoleRoute>}/>
      <Route path="targets" element={<RoleRoute allowed={ALL_ROLES}><Targets/></RoleRoute>}/>
      <Route path="reports" element={<RoleRoute allowed={ALL_ROLES}><Reports/></RoleRoute>}/>
      <Route path="imports" element={<RoleRoute allowed={IMPORT_ROLES}><Imports/></RoleRoute>}/>
      <Route path="approvals" element={<RoleRoute allowed={APPROVAL_ROLES}><Approvals/></RoleRoute>}/>
      <Route path="feedback" element={<RoleRoute allowed={ALL_ROLES}><FeedbackAdmin/></RoleRoute>}/>
      <Route path="departments" element={<RoleRoute allowed={ALL_ROLES}><Departments/></RoleRoute>}/>
      <Route path="users" element={<RoleRoute allowed={ADMIN_ROLES}><Users/></RoleRoute>}/>
      <Route path="settings" element={<RoleRoute allowed={ADMIN_ROLES}><Settings/></RoleRoute>}/>
      <Route path="audit-logs" element={<RoleRoute allowed={ADMIN_ROLES}><AuditLogs/></RoleRoute>}/>
      <Route path="profile" element={<RoleRoute allowed={ALL_ROLES}><Profile/></RoleRoute>}/>
      <Route path="forbidden" element={<Forbidden/>}/>
      <Route path="*" element={<Navigate to="/admin" replace/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></>;
}
