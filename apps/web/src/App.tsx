import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ADMIN_ROLES, ALL_ROLES, APPROVAL_ROLES, hasAnyRole, IMPORT_ROLES, SUPERVISOR_ROLES } from './authz';
import { api, ApiError, auth } from './api';
import Layout from './components/Layout';
import { Spinner } from './components/UI';
import { useLocality } from './locality';
import { titleFor } from './nav';
import OpsCenter from './pages/OpsCenter';
import Forbidden from './pages/Forbidden';
import Login from './pages/Login';
import PublicHome from './pages/PublicHome';
import Targets from './pages/Targets';
import FeedbackPublic from './pages/FeedbackPublic';
import PublishedFeedbackDetail from './pages/PublishedFeedbackDetail';
import ForgotPassword from './pages/ForgotPassword';
import type { AuthMeResponse, Role, User } from './types';

const PublicDashboardStudio = lazy(() => import('./pages/PublicDashboardStudio'));
// Trang quản trị tải theo nhu cầu: trang đầu (đăng nhập, trung tâm điều hành) nhẹ hơn.
const Accountability = lazy(() => import('./pages/Accountability'));
const BugReports = lazy(() => import('./pages/BugReports'));
const Datasets = lazy(() => import('./pages/Datasets'));
const Frameworks = lazy(() => import('./pages/Frameworks'));
const MyWork = lazy(() => import('./pages/MyWork'));
const Proposals = lazy(() => import('./pages/Proposals'));
const SetupWizard = lazy(() => import('./pages/SetupWizard'));
const TargetDossier = lazy(() => import('./pages/TargetDossier'));
const Wallboard = lazy(() => import('./pages/Wallboard'));
const DocumentReview = lazy(() => import('./pages/DocumentReview'));
const Documents = lazy(() => import('./pages/Documents'));
const FeedbackAdmin = lazy(() => import('./pages/FeedbackAdmin'));
const Imports = lazy(() => import('./pages/Imports'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Users = lazy(() => import('./pages/Users'));
const Departments = lazy(() => import('./pages/Departments'));
const Settings = lazy(() => import('./pages/Settings'));
const Reports = lazy(() => import('./pages/Reports'));
const Approvals = lazy(() => import('./pages/Approvals'));
const Profile = lazy(() => import('./pages/Profile'));

/** Bắt buộc đăng nhập; mặc định hiển thị trong khung quản trị, hoặc toàn màn hình khi truyền `children`. */
function Protected({children}:{children?:ReactNode}){
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
  return children?<>{children}</>:<Layout/>;
}

function RoleRoute({allowed,children}:{allowed:readonly Role[];children:ReactNode}){
  const location=useLocation();
  if(!hasAnyRole(auth.user,allowed))return <Navigate to="/admin/forbidden" replace state={{from:location.pathname}}/>;
  return <>{children}</>;
}

function LoginRoute(){
  return auth.token?<Navigate to="/admin" replace/>:<Login/>;
}

/** Tiêu đề thẻ trình duyệt — đọc tên ứng dụng từ hồ sơ địa phương, không viết cứng tên đơn vị nào. */
function DocumentTitle(){
  const location=useLocation();
  const locality=useLocality();
  useEffect(()=>{
    const brand=locality.brandName;
    const unit=locality.configured?locality.name:brand;
    const path=location.pathname;
    let title:string;
    if(path==='/')title=`${brand} · Cổng thông tin điều hành`;
    else if(path==='/phan-anh')title=`Gửi và tra cứu phản ánh · ${unit}`;
    else if(path.startsWith('/phan-anh/cong-khai/'))title=`Chi tiết phản ánh công khai · ${unit}`;
    else if(path==='/admin/login')title=`Đăng nhập nội bộ · ${brand}`;
    else if(path==='/admin/forgot-password')title=`Khôi phục mật khẩu · ${brand}`;
    else if(path==='/trinh-chieu')title=`Trình chiếu phòng họp · ${brand}`;
    else if(path.startsWith('/admin'))title=`${titleFor(path,false)} · ${brand}`;
    else title=brand;
    document.title=title;
  },[location.pathname,locality]);
  return null;
}

export default function App(){
  return <><DocumentTitle/><Routes>
    <Route path="/" element={<PublicHome/>}/>
    <Route path="/phan-anh" element={<FeedbackPublic/>}/>
    <Route path="/phan-anh/cong-khai/:code" element={<PublishedFeedbackDetail/>}/>
    <Route path="/admin/login" element={<LoginRoute/>}/>
    <Route path="/admin/forgot-password" element={auth.token?<Navigate to="/admin" replace/>:<ForgotPassword/>}/>
    <Route path="/trinh-chieu" element={<Protected><Suspense fallback={<Spinner/>}><Wallboard/></Suspense></Protected>}/>
    <Route path="/admin" element={<Protected/>}>
      <Route index element={<RoleRoute allowed={ALL_ROLES}><OpsCenter/></RoleRoute>}/>
      <Route path="viec-cua-toi" element={<RoleRoute allowed={ALL_ROLES}><MyWork/></RoleRoute>}/>
      <Route path="trach-nhiem" element={<RoleRoute allowed={SUPERVISOR_ROLES}><Accountability/></RoleRoute>}/>
      <Route path="bo-chi-tieu" element={<RoleRoute allowed={ALL_ROLES}><Frameworks/></RoleRoute>}/>
      <Route path="targets/:id" element={<RoleRoute allowed={ALL_ROLES}><TargetDossier/></RoleRoute>}/>
      <Route path="proposals" element={<RoleRoute allowed={ALL_ROLES}><Proposals/></RoleRoute>}/>
      <Route path="kho-du-lieu" element={<RoleRoute allowed={ALL_ROLES}><Datasets/></RoleRoute>}/>
      <Route path="thiet-lap" element={<RoleRoute allowed={ADMIN_ROLES}><SetupWizard/></RoleRoute>}/>
      <Route path="bao-loi" element={<RoleRoute allowed={ADMIN_ROLES}><BugReports/></RoleRoute>}/>
      {/* Copilot không còn là một màn hình riêng — nay là bảng nổi trong Layout.
          Giữ lại đường dẫn cũ để liên kết đã lưu vẫn dùng được: Layout sẽ đưa về
          tổng quan và tự mở bảng trợ lý. */}
      <Route path="copilot" element={null}/>
      <Route path="targets" element={<RoleRoute allowed={ALL_ROLES}><Targets/></RoleRoute>}/>
      <Route path="reports" element={<RoleRoute allowed={ALL_ROLES}><Reports/></RoleRoute>}/>
      <Route path="imports" element={<RoleRoute allowed={IMPORT_ROLES}><Imports/></RoleRoute>}/>
      <Route path="documents" element={<RoleRoute allowed={ALL_ROLES}><Documents/></RoleRoute>}/>
      <Route path="documents/:id" element={<RoleRoute allowed={ALL_ROLES}><DocumentReview/></RoleRoute>}/>
      <Route path="approvals" element={<RoleRoute allowed={APPROVAL_ROLES}><Approvals/></RoleRoute>}/>
      <Route path="feedback" element={<RoleRoute allowed={ALL_ROLES}><FeedbackAdmin/></RoleRoute>}/>
      <Route path="departments" element={<RoleRoute allowed={ALL_ROLES}><Departments/></RoleRoute>}/>
      <Route path="users" element={<RoleRoute allowed={ADMIN_ROLES}><Users/></RoleRoute>}/>
      <Route path="settings" element={<RoleRoute allowed={ADMIN_ROLES}><Settings/></RoleRoute>}/>
      <Route path="public-dashboard" element={<RoleRoute allowed={ADMIN_ROLES}><Suspense fallback={<Spinner/>}><PublicDashboardStudio/></Suspense></RoleRoute>}/>
      <Route path="audit-logs" element={<RoleRoute allowed={ADMIN_ROLES}><AuditLogs/></RoleRoute>}/>
      <Route path="profile" element={<RoleRoute allowed={ALL_ROLES}><Profile/></RoleRoute>}/>
      <Route path="forbidden" element={<Forbidden/>}/>
      <Route path="*" element={<Navigate to="/admin" replace/>}/>
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></>;
}
