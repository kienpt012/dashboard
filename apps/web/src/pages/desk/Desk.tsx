import { ReloadOutlined } from '@ant-design/icons';
import { Button, Result } from 'antd';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageSkeleton } from '@/components/States';
import { DeskProvider, useActiveSpace, useDesk } from './useDesk';
import type { DeskProfileConfig } from './types';
import './desk.css';

// Bàn làm việc số (DH-00): trang chủ cá nhân của từng cán bộ.

const START_PATHS: Record<DeskProfileConfig['startPage'], string | null> = { desk: null, ops: '/admin/dieu-hanh', work: '/admin/viec-cua-toi' };

/** Ngay sau đăng nhập, chuyển tới trang mở đầu người dùng đã chọn (một lần). */
function useStartPage(profile: DeskProfileConfig | undefined) {
  const navigate = useNavigate();
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !profile) return;
    checked.current = true;
    let fresh = false;
    try {
      fresh = sessionStorage.getItem('ioc_fresh_login') === '1';
      sessionStorage.removeItem('ioc_fresh_login');
    } catch {
      return;
    }
    const target = START_PATHS[profile.startPage];
    if (fresh && target) navigate(target, { replace: true });
  }, [profile, navigate]);
}

function DeskView() {
  const desk = useDesk();
  const space = useActiveSpace();
  useStartPage(desk.profile?.config);

  if (desk.status === 'loading') return <PageSkeleton />;
  if (desk.status === 'error') {
    return (
      <Result
        status="warning"
        title="Không tải được bàn làm việc"
        subTitle={desk.error}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void desk.store.load()}>
            Thử lại
          </Button>
        }
      />
    );
  }
  return (
    <div className="desk">
      <div className="desk-body">
        <h2>{space?.name}</h2>
        <ul>
          {space?.config.widgets.map(widget => (
            <li key={widget.id}>{desk.store.widgetDef(widget.type)?.title ?? widget.type}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function Desk() {
  return (
    <DeskProvider>
      <DeskView />
    </DeskProvider>
  );
}
