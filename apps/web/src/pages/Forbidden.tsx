import { ArrowLeft, ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { auth } from '../api';
import { roleLabels } from '../authz';
import { PageHead } from '../components/UI';

export default function Forbidden(){
  const user=auth.user;
  return <>
    <PageHead eyebrow="QUYỀN TRUY CẬP" title="Bạn không có quyền mở trang này" description="Hệ thống đã giữ nguyên dữ liệu và không thực hiện thao tác nào."/>
    <section className="panel">
      <ShieldX size={34}/>
      <h3>Phạm vi tài khoản hiện tại</h3>
      <p>{user?`${roleLabels[user.role]} · ${user.department?.name||'Chưa gán phòng ban'}`:'Phiên đăng nhập không hợp lệ'}</p>
      <Link className="btn primary" to="/admin"><ArrowLeft/>Về tổng quan</Link>
    </section>
  </>;
}
