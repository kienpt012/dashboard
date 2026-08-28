import {
  Building2,
  Check,
  CheckCircle2,
  CircleUserRound,
  Clock3,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, auth } from '../api';
import { roleLabels } from '../authz';
import { PageHead } from '../components/UI';
import type { User } from '../types';

type ChangePasswordResponse={accessToken:string;user:User};
type PasswordField='currentPassword'|'newPassword'|'confirmPassword';

const initialPasswords={currentPassword:'',newPassword:'',confirmPassword:''};

function formatDateTime(value?:string|null){
  if(!value)return 'Chưa có thông tin';
  const parsed=new Date(value);
  if(Number.isNaN(parsed.getTime()))return 'Chưa có thông tin';
  return parsed.toLocaleString('vi-VN',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'});
}

export default function Profile(){
  const [user,setUser]=useState<User|null>(auth.user);
  const [passwords,setPasswords]=useState(initialPasswords);
  const [visible,setVisible]=useState<Record<PasswordField,boolean>>({currentPassword:false,newPassword:false,confirmPassword:false});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  const requirements=[
    {label:'Ít nhất 10 ký tự',met:passwords.newPassword.length>=10},
    {label:'Có chữ hoa và chữ thường',met:/[A-Z]/.test(passwords.newPassword)&&/[a-z]/.test(passwords.newPassword)},
    {label:'Có ít nhất một chữ số',met:/\d/.test(passwords.newPassword)},
    {label:'Có ít nhất một ký tự đặc biệt',met:/[^A-Za-z0-9]/.test(passwords.newPassword)},
  ];
  const passwordStrong=requirements.every(item=>item.met);
  const passwordMatches=Boolean(passwords.confirmPassword)&&passwords.newPassword===passwords.confirmPassword;
  const canSubmit=Boolean(passwords.currentPassword)&&passwordStrong&&passwordMatches&&passwords.currentPassword!==passwords.newPassword;

  function update(field:PasswordField,value:string){
    setPasswords(current=>({...current,[field]:value}));
    setError('');
    setSuccess('');
  }

  function toggle(field:PasswordField){
    setVisible(current=>({...current,[field]:!current[field]}));
  }

  function validate(){
    if(!passwords.currentPassword)return 'Vui lòng nhập mật khẩu hiện tại.';
    if(!passwordStrong)return 'Mật khẩu mới chưa đáp ứng đầy đủ các yêu cầu bảo mật.';
    if(passwords.newPassword===passwords.currentPassword)return 'Mật khẩu mới phải khác mật khẩu hiện tại.';
    if(!passwords.confirmPassword)return 'Vui lòng xác nhận mật khẩu mới.';
    if(!passwordMatches)return 'Mật khẩu xác nhận chưa trùng khớp.';
    return '';
  }

  async function submit(event:FormEvent){
    event.preventDefault();
    const validationError=validate();
    if(validationError){setError(validationError);return}
    setSaving(true);setError('');setSuccess('');
    try{
      const result=await api<ChangePasswordResponse>('/auth/change-password',{
        method:'POST',
        body:JSON.stringify({currentPassword:passwords.currentPassword,newPassword:passwords.newPassword}),
      });
      auth.set(result);
      setUser(result.user);
      setPasswords(initialPasswords);
      setVisible({currentPassword:false,newPassword:false,confirmPassword:false});
      setSuccess('Mật khẩu đã được thay đổi. Phiên hiện tại được cấp lại; các phiên đăng nhập cũ đã bị thu hồi.');
    }catch(reason){
      setError(reason instanceof Error?reason.message:'Không thể đổi mật khẩu lúc này. Vui lòng thử lại.');
    }finally{setSaving(false)}
  }

  if(!user)return <section className="panel profile-unavailable" role="alert"><CircleUserRound/><h3>Không thể đọc thông tin tài khoản</h3><p>Vui lòng đăng nhập lại để tiếp tục.</p></section>;

  const scopeName=user.role==='ADMIN'?'Toàn hệ thống':user.department?.name||'Chưa gán phòng ban';

  return <div className="profile-page">
    <PageHead eyebrow="TÀI KHOẢN CÁ NHÂN" title="Hồ sơ & bảo mật" description="Kiểm tra phạm vi tài khoản và chủ động bảo vệ phiên làm việc của bạn."/>
    <div className="profile-layout">
      <section className="panel profile-card" aria-labelledby="profile-heading">
        <div className="profile-identity">
          <div className="profile-avatar" aria-hidden="true"><UserRound/></div>
          <div><span>TÀI KHOẢN ĐANG ĐĂNG NHẬP</span><h3 id="profile-heading">{user.fullName}</h3><p>@{user.username}</p></div>
          <i className={user.isActive?'active':'inactive'}>{user.isActive?'Đang hoạt động':'Đã khóa'}</i>
        </div>
        <dl className="profile-details">
          <div><dt><ShieldCheck/>Vai trò</dt><dd>{roleLabels[user.role]}</dd></div>
          <div><dt><Building2/>Phạm vi đơn vị</dt><dd>{scopeName}{user.department?.code&&<small>{user.department.code}</small>}</dd></div>
          <div><dt><Mail/>Email</dt><dd>{user.email||'Chưa cập nhật'}</dd></div>
          <div><dt><Clock3/>Lần đăng nhập gần nhất</dt><dd>{formatDateTime(user.lastLoginAt)}</dd></div>
        </dl>
        <div className="profile-note"><CircleUserRound/><p>Thông tin họ tên, email, vai trò và phòng ban do quản trị viên quản lý. Hãy liên hệ quản trị viên nếu cần điều chỉnh.</p></div>
      </section>

      <section className="panel security-card" aria-labelledby="security-heading">
        <div className="security-heading"><div><LockKeyhole/></div><div><h3 id="security-heading">Đổi mật khẩu</h3><p>Sau khi đổi, hệ thống cấp lại phiên hiện tại và thu hồi các phiên đăng nhập cũ.</p></div></div>
        {error&&<div className="notice error" role="alert"><LockKeyhole/>{error}</div>}
        {success&&<div className="notice success" role="status"><CheckCircle2/>{success}</div>}
        <form className="profile-password-form" onSubmit={submit} noValidate>
          <label htmlFor="current-password">Mật khẩu hiện tại</label>
          <div className="profile-password-input">
            <KeyRound/>
            <input id="current-password" required maxLength={128} type={visible.currentPassword?'text':'password'} value={passwords.currentPassword} onChange={event=>update('currentPassword',event.target.value)} autoComplete="current-password" placeholder="Nhập mật khẩu đang sử dụng" aria-invalid={Boolean(error&&!passwords.currentPassword)}/>
            <button type="button" onClick={()=>toggle('currentPassword')} aria-label={visible.currentPassword?'Ẩn mật khẩu hiện tại':'Hiện mật khẩu hiện tại'} aria-controls="current-password">{visible.currentPassword?<EyeOff/>:<Eye/>}</button>
          </div>

          <label htmlFor="new-password">Mật khẩu mới</label>
          <div className="profile-password-input">
            <LockKeyhole/>
            <input id="new-password" required minLength={10} maxLength={128} type={visible.newPassword?'text':'password'} value={passwords.newPassword} onChange={event=>update('newPassword',event.target.value)} autoComplete="new-password" placeholder="Tối thiểu 10 ký tự và đủ 4 nhóm ký tự" aria-describedby="password-requirements"/>
            <button type="button" onClick={()=>toggle('newPassword')} aria-label={visible.newPassword?'Ẩn mật khẩu mới':'Hiện mật khẩu mới'} aria-controls="new-password">{visible.newPassword?<EyeOff/>:<Eye/>}</button>
          </div>
          <ul className="password-requirements" id="password-requirements" aria-live="polite">
            {requirements.map(item=><li key={item.label} className={item.met?'met':''}><Check/>{item.label}</li>)}
          </ul>

          <label htmlFor="confirm-password">Xác nhận mật khẩu mới</label>
          <div className={`profile-password-input ${passwords.confirmPassword?(passwordMatches?'valid':'invalid'):''}`}>
            <ShieldCheck/>
            <input id="confirm-password" required minLength={10} maxLength={128} type={visible.confirmPassword?'text':'password'} value={passwords.confirmPassword} onChange={event=>update('confirmPassword',event.target.value)} autoComplete="new-password" placeholder="Nhập lại mật khẩu mới" aria-invalid={Boolean(passwords.confirmPassword&&!passwordMatches)}/>
            <button type="button" onClick={()=>toggle('confirmPassword')} aria-label={visible.confirmPassword?'Ẩn mật khẩu xác nhận':'Hiện mật khẩu xác nhận'} aria-controls="confirm-password">{visible.confirmPassword?<EyeOff/>:<Eye/>}</button>
          </div>
          {passwords.confirmPassword&&<small className={passwordMatches?'match-message valid':'match-message invalid'}>{passwordMatches?'Mật khẩu xác nhận đã trùng khớp.':'Mật khẩu xác nhận chưa trùng khớp.'}</small>}

          <div className="profile-form-actions">
            <span><ShieldCheck/>Không chia sẻ mật khẩu hoặc mã phiên cho người khác.</span>
            <button className="btn primary" disabled={saving||!canSubmit}><Save/>{saving?'Đang cập nhật...':'Đổi mật khẩu'}</button>
          </div>
        </form>
      </section>
    </div>
  </div>;
}
