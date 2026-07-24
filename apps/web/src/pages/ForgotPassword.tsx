import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, auth } from '../api';
import { currentVietnamYear } from '../date';

type Stage='request'|'verify'|'password'|'done';
type RequestResponse={message:string;expiresInMinutes:number};
type VerifyResponse={resetToken:string;expiresInMinutes:number};
const strongPasswordPattern='(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{10,128}';
const strongPasswordRegex=/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/;

function AuthVisual(){
  const currentYear=currentVietnamYear();
  return <section className="login-visual">
    <div className="visual-grid"/>
    <div className="visual-content">
      <div className="gov-badge">LT <span>PHƯỜNG LÁI THIÊU</span></div>
      <p className="eyebrow light">KHÔI PHỤC TÀI KHOẢN</p>
      <h1>Khôi phục<br/><em>quyền truy cập.</em></h1>
      <p className="lead">Mã xác thực được gửi đến email công vụ đã đăng ký và chỉ sử dụng được một lần.</p>
      <div className="visual-points"><span><ShieldCheck/>Không tiết lộ tài khoản</span><span><KeyRound/>Mã xác thực một lần</span><span><BarChart3/>Thu hồi phiên đăng nhập cũ</span></div>
    </div>
    <div className="visual-footer">UBND PHƯỜNG LÁI THIÊU · HỆ THỐNG ĐIỀU HÀNH NỘI BỘ · {currentYear}</div>
  </section>;
}

export default function ForgotPassword(){
  const [stage,setStage]=useState<Stage>('request');
  const [identifier,setIdentifier]=useState('');
  const [otp,setOtp]=useState('');
  const [resetToken,setResetToken]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [showNewPassword,setShowNewPassword]=useState(false);
  const [showConfirmPassword,setShowConfirmPassword]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(false);
  const [cooldown,setCooldown]=useState(0);

  useEffect(()=>{
    if(cooldown<=0)return;
    const timer=window.setInterval(()=>setCooldown(value=>Math.max(0,value-1)),1000);
    return()=>window.clearInterval(timer);
  },[cooldown]);

  async function requestCode(){
    setLoading(true);setError('');setNotice('');
    try{
      const result=await api<RequestResponse>('/auth/password-reset/request',{
        method:'POST',
        body:JSON.stringify({identifier:identifier.trim()}),
      });
      setNotice(result.message);
      setStage('verify');
      setCooldown(60);
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể gửi yêu cầu khôi phục mật khẩu');
    }finally{setLoading(false)}
  }

  async function submitRequest(event:FormEvent){
    event.preventDefault();
    await requestCode();
  }

  async function submitOtp(event:FormEvent){
    event.preventDefault();setLoading(true);setError('');setNotice('');
    try{
      const result=await api<VerifyResponse>('/auth/password-reset/verify',{
        method:'POST',
        body:JSON.stringify({identifier:identifier.trim(),otp}),
      });
      setResetToken(result.resetToken);
      setStage('password');
      setNotice(`Mã đã được xác thực. Hãy đặt mật khẩu mới trong ${result.expiresInMinutes} phút.`);
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể xác thực mã');
    }finally{setLoading(false)}
  }

  async function submitPassword(event:FormEvent){
    event.preventDefault();setError('');setNotice('');
    if(!strongPasswordRegex.test(newPassword)){
      setError('Mật khẩu mới chưa đáp ứng đầy đủ các yêu cầu bảo mật');
      return;
    }
    if(newPassword!==confirmPassword){
      setError('Mật khẩu xác nhận chưa khớp');
      return;
    }
    setLoading(true);
    try{
      const result=await api<{message:string}>('/auth/password-reset/complete',{
        method:'POST',
        body:JSON.stringify({resetToken,newPassword}),
      });
      auth.clear();
      setResetToken('');
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice(result.message);
      setStage('done');
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể đặt lại mật khẩu');
    }finally{setLoading(false)}
  }

  function changeIdentifier(){
    setStage('request');setOtp('');setResetToken('');setError('');setNotice('');
  }

  return <div className="login-page">
    <AuthVisual/>
    <section className="login-panel">
      <div className="login-card reset-card">
        <div className="mobile-brand"><div className="brand-mark">LT</div> IOC LÁI THIÊU</div>
        <div className="reset-steps" aria-label="Tiến trình khôi phục mật khẩu">
          <i aria-label="Bước 1: xác nhận tài khoản" aria-current={stage==='request'?'step':undefined} className={stage!=='request'?'done':'active'}>1</i>
          <span/>
          <i aria-label="Bước 2: xác thực mã OTP" aria-current={stage==='verify'?'step':undefined} className={stage==='password'||stage==='done'?'done':stage==='verify'?'active':''}>2</i>
          <span/>
          <i aria-label="Bước 3: đặt mật khẩu mới" aria-current={stage==='password'?'step':undefined} className={stage==='done'?'done':stage==='password'?'active':''}>3</i>
        </div>

        {stage==='request'&&<form onSubmit={submitRequest}>
          <span className="eyebrow">KHÔI PHỤC MẬT KHẨU</span>
          <h2>Xác nhận tài khoản</h2>
          <p>Nhập tên đăng nhập hoặc email công vụ. Nếu thông tin khớp, hệ thống sẽ gửi mã xác thực đến email đã đăng ký.</p>
          {error&&<div className="form-error" role="alert">{error}</div>}
          <label>Tên đăng nhập hoặc email<div className="input-icon"><Mail/><input required minLength={3} maxLength={180} value={identifier} onChange={event=>{setIdentifier(event.target.value);setError('')}} placeholder="Ví dụ: nguyenvana hoặc email công vụ" autoComplete="username" autoFocus/></div></label>
          <button className="btn primary login-btn reset-submit" disabled={loading}>{loading?'Đang xử lý...':<>Gửi mã xác thực <ArrowRight/></>}</button>
        </form>}

        {stage==='verify'&&<form onSubmit={submitOtp}>
          <span className="eyebrow">BƯỚC 2/3</span>
          <h2>Nhập mã xác thực</h2>
          <p>Kiểm tra hộp thư và nhập mã gồm 6 chữ số. Không cung cấp mã này cho bất kỳ ai.</p>
          {notice&&<div className="form-success" role="status">{notice}</div>}
          {error&&<div className="form-error" role="alert">{error}</div>}
          <label>Mã xác thực<div className="input-icon otp-input"><KeyRound/><input required value={otp} onChange={event=>{setOtp(event.target.value.replace(/\D/g,'').slice(0,6));setError('')}} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" autoFocus/></div></label>
          <button className="btn primary login-btn reset-submit" disabled={loading||otp.length!==6}>{loading?'Đang xác thực...':<>Xác thực mã <ArrowRight/></>}</button>
          <div className="reset-secondary-actions">
            <button type="button" onClick={()=>void requestCode()} disabled={loading||cooldown>0}>{cooldown>0?`Gửi lại sau ${cooldown}s`:'Gửi lại mã'}</button>
            <button type="button" onClick={changeIdentifier}>Dùng tài khoản khác</button>
          </div>
        </form>}

        {stage==='password'&&<form onSubmit={submitPassword}>
          <span className="eyebrow">BƯỚC 3/3</span>
          <h2>Đặt mật khẩu mới</h2>
          <p>Mật khẩu mới sẽ thu hồi toàn bộ phiên đăng nhập cũ của tài khoản.</p>
          {notice&&<div className="form-success" role="status">{notice}</div>}
          {error&&<div className="form-error" role="alert">{error}</div>}
          <label>Mật khẩu mới<div className="input-icon"><LockKeyhole/><input required minLength={10} maxLength={128} pattern={strongPasswordPattern} type={showNewPassword?'text':'password'} value={newPassword} onChange={event=>{setNewPassword(event.target.value);setError('')}} placeholder="Nhập mật khẩu mới" autoComplete="new-password" autoFocus/><button type="button" aria-label={showNewPassword?'Ẩn mật khẩu mới':'Hiện mật khẩu mới'} onClick={()=>setShowNewPassword(value=>!value)}>{showNewPassword?<EyeOff/>:<Eye/>}</button></div></label>
          <small className="reset-password-help">Tối thiểu 10 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt; không chứa tên đăng nhập.</small>
          <label>Xác nhận mật khẩu<div className="input-icon"><ShieldCheck/><input required minLength={10} maxLength={128} pattern={strongPasswordPattern} type={showConfirmPassword?'text':'password'} value={confirmPassword} onChange={event=>{setConfirmPassword(event.target.value);setError('')}} placeholder="Nhập lại mật khẩu mới" autoComplete="new-password"/><button type="button" aria-label={showConfirmPassword?'Ẩn mật khẩu xác nhận':'Hiện mật khẩu xác nhận'} onClick={()=>setShowConfirmPassword(value=>!value)}>{showConfirmPassword?<EyeOff/>:<Eye/>}</button></div></label>
          <button className="btn primary login-btn reset-submit" disabled={loading||!strongPasswordRegex.test(newPassword)||newPassword!==confirmPassword}>{loading?'Đang lưu...':<>Đặt lại mật khẩu <ArrowRight/></>}</button>
        </form>}

        {stage==='done'&&<div className="reset-complete">
          <CheckCircle2/>
          <span className="eyebrow">HOÀN TẤT</span>
          <h2>Mật khẩu đã được cập nhật</h2>
          <p>{notice}</p>
          <Link className="btn primary login-btn" to="/admin/login">Đăng nhập bằng mật khẩu mới <ArrowRight/></Link>
        </div>}

        {stage!=='done'&&<Link className="reset-back" to="/admin/login"><ArrowLeft/>Quay lại đăng nhập</Link>}
      </div>
    </section>
  </div>;
}
