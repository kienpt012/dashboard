import { ArrowRight, BarChart3, CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, auth } from '../api';
import { currentVietnamYear } from '../date';
import type { User } from '../types';

type LoginResponse={accessToken:string;user:User};

function safeNextPath(value:string|null){
  if(!value||value.startsWith('//'))return '/admin';
  const allowed=value==='/admin'||value.startsWith('/admin/');
  if(!allowed||value.startsWith('/admin/login'))return '/admin';
  return value;
}

export default function Login(){
  const [username,setUsername]=useState('');
  const [password,setPassword]=useState('');
  const [show,setShow]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const navigate=useNavigate();
  const [searchParams]=useSearchParams();
  const currentYear=currentVietnamYear();

  async function submit(event:FormEvent){
    event.preventDefault();setLoading(true);setError('');
    try{
      const data=await api<LoginResponse>('/auth/login',{method:'POST',body:JSON.stringify({username:username.trim(),password})});
      auth.set(data);
      navigate(safeNextPath(searchParams.get('next')),{replace:true});
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể đăng nhập');
    }finally{setLoading(false)}
  }

  return <div className="login-page">
    <section className="login-visual">
      <div className="visual-grid"/>
      <div className="visual-content">
        <div className="gov-badge">LT <span>PHƯỜNG LÁI THIÊU</span></div>
        <p className="eyebrow light">HỆ THỐNG ĐIỀU HÀNH NỘI BỘ</p>
        <h1>Quản lý chỉ tiêu<br/><em>và phản ánh.</em></h1>
        <p className="lead">Khu vực dành cho cán bộ được phân quyền của UBND Phường Lái Thiêu.</p>
        <div className="visual-points"><span><CheckCircle2/>Chỉ tiêu và báo cáo</span><span><BarChart3/>Tiếp nhận phản ánh</span><span><ShieldCheck/>Phân quyền theo đơn vị</span></div>
      </div>
      <div className="visual-footer">UBND PHƯỜNG LÁI THIÊU · HỆ THỐNG ĐIỀU HÀNH NỘI BỘ · {currentYear}</div>
    </section>

    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-brand"><div className="brand-mark">LT</div> IOC LÁI THIÊU</div>
        <span className="eyebrow">ĐĂNG NHẬP NỘI BỘ</span>
        <h2>Đăng nhập hệ thống</h2>
        <p>Nhập tài khoản đã được cấp để truy cập đúng phạm vi công việc.</p>
        {error&&<div className="form-error" role="alert" aria-live="assertive">{error}</div>}
        <label>Tên đăng nhập<div className="input-icon"><UserRound/><input required value={username} onChange={event=>{setUsername(event.target.value);setError('')}} placeholder="Nhập tên đăng nhập" autoComplete="username" autoFocus/></div></label>
        <label>Mật khẩu<div className="input-icon"><LockKeyhole/><input required type={show?'text':'password'} value={password} onChange={event=>{setPassword(event.target.value);setError('')}} placeholder="Nhập mật khẩu" autoComplete="current-password"/><button type="button" aria-label={show?'Ẩn mật khẩu':'Hiện mật khẩu'} onClick={()=>setShow(value=>!value)}>{show?<EyeOff/>:<Eye/>}</button></div></label>
        <div className="login-row"><span/><Link to="/admin/forgot-password">Quên mật khẩu?</Link></div>
        <button className="btn primary login-btn" disabled={loading}>{loading?'Đang xác thực...':<>Đăng nhập <ArrowRight/></>}</button>
      </form>
      <Link className="support" to="/">Về trang thông tin dành cho người dân</Link>
    </section>
  </div>;
}
