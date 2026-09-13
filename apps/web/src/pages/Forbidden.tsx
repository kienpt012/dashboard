import { ArrowLeft, ShieldX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { auth } from '../api';
import { roleLabels } from '../authz';
import { StateCard } from '../components/UI';
import '../styles/auth.css';

export default function Forbidden() {
  const user = auth.user;
  const scope = user
    ? `Tài khoản của bạn đang ở phạm vi ${roleLabels[user.role].toLowerCase()} · ${
        user.department?.name || 'chưa gán phòng ban'
      }. Nếu cần mở rộng quyền, vui lòng liên hệ quản trị hệ thống.`
    : 'Phiên đăng nhập không còn hợp lệ. Vui lòng đăng nhập lại để tiếp tục làm việc.';

  return (
    <StateCard
      icon={<ShieldX />}
      title="Bạn không có quyền mở trang này"
      description={`${scope} Hệ thống đã giữ nguyên dữ liệu và không thực hiện thao tác nào.`}
      action={
        <Link className="btn primary" to="/admin">
          <ArrowLeft />
          Về tổng quan điều hành
        </Link>
      }
    />
  );
}
