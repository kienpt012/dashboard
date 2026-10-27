import { ApartmentOutlined, LockOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Select } from 'antd';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/session';
import { errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { isGlobal } from '@/lib/roles';
import type { DepartmentSnapshot } from '../types';
import { useDesk } from '../useDesk';
import { WidgetSkeleton } from '../WidgetFrame';
import { useWidget } from './context';
import { useDepartmentData } from './useDepartmentData';
import './widgets.css';

// Mảnh dùng chung của các widget: lời nhắn trạng thái, cổng số liệu phòng (chưa chọn phòng / không có quyền / lỗi /
// đang tải), dòng danh sách, liên kết "xem tất cả".

export function Note({ icon, children, action, tone }: { icon?: ReactNode; children: ReactNode; action?: ReactNode; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`wn${tone ? ` wn-${tone}` : ''}`}>
      {icon && <span className="wn-icon">{icon}</span>}
      <span className="wn-text">{children}</span>
      {action}
    </div>
  );
}

function PickDepartment() {
  const user = useMe();
  const desk = useDesk();
  const { spaceId } = useWidget();
  if (!isGlobal(user)) return <Note icon={<ApartmentOutlined />}>Tài khoản chưa thuộc phòng nào</Note>;
  if (!desk.focusDepartments.length) return <Note icon={<ApartmentOutlined />}>Chưa có phòng ban</Note>;
  return (
    <Note
      icon={<ApartmentOutlined />}
      action={
        <Select
          size="small"
          placeholder="Chọn phòng"
          showSearch
          optionFilterProp="label"
          popupMatchSelectWidth={false}
          style={{ minWidth: 170 }}
          options={desk.focusDepartments.map(department => ({ value: department.id, label: department.name }))}
          onChange={(value: string) => desk.store.updateSpace(spaceId, config => ({ ...config, focusDepartmentId: value }))}
        />
      }
    >
      Chọn phòng cần xem cho không gian này
    </Note>
  );
}

/** Vẽ con khi đã có số liệu phòng; lo các trạng thái còn lại. Khi tải lại lỗi vẫn hiện bản cũ kèm dòng báo. */
export function DepartmentGate({ children }: { children: (data: DepartmentSnapshot) => ReactNode }) {
  const result = useDepartmentData();
  if (result.missing) return <PickDepartment />;
  if (result.forbidden) return <Note icon={<LockOutlined />}>Bạn không xem được số liệu của phòng này</Note>;
  if (!result.data) {
    if (!result.isError) return <WidgetSkeleton />;
    return (
      <Note
        icon={<WarningOutlined />}
        tone="warn"
        action={
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void result.refetch()}>
            Thử lại
          </Button>
        }
      >
        {errorText(result.error, 'Không tải được số liệu của phòng')}
      </Note>
    );
  }
  return (
    <>
      {children(result.data)}
      {result.isError && (
        <button type="button" className="ws-stale" onClick={() => void result.refetch()}>
          <WarningOutlined /> Số liệu lúc {dateTime(result.data.dataAsOf ?? result.data.generatedAt)} · Thử lại
        </button>
      )}
    </>
  );
}

/** Một dòng danh sách: vạch màu bên trái (mức độ), tiêu đề (bấm được), dòng phụ, phần cuối (số, hạn…). */
export function Row({ tone, title, to, meta, trail, compact, titleHint }: { tone?: string; title: ReactNode; to?: string; meta?: ReactNode; trail?: ReactNode; compact?: boolean; titleHint?: string }) {
  return (
    <div className={`wr${compact ? ' compact' : ''}`}>
      {tone && <i className={`wr-tone ${tone}`} aria-hidden />}
      <div className="wr-main">
        {to ? (
          <Link to={to} className="wr-title" title={titleHint}>
            {title}
          </Link>
        ) : (
          <span className="wr-title" title={titleHint}>
            {title}
          </span>
        )}
        {meta && !compact && <span className="wr-meta">{meta}</span>}
      </div>
      {trail && <span className="wr-trail">{trail}</span>}
    </div>
  );
}

export function MoreLink({ to, children, onClick }: { to?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div className="wmore">
      {to ? (
        <Link to={to}>{children}</Link>
      ) : (
        <button type="button" onClick={onClick}>
          {children}
        </button>
      )}
    </div>
  );
}

/** Tham số lọc theo phòng và năm cho đường dẫn danh mục chỉ tiêu. */
export const scopeQuery = (data: Pick<DepartmentSnapshot, 'department' | 'year'>) => `departmentId=${data.department.id}&year=${data.year}`;
