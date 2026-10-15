import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Result } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loading } from '@/components/States';
import { ApiError, errorText, http, session } from '@/lib/api';
import { can } from '@/lib/roles';
import type { CurrentUser, Role } from '@/types/auth';
import { useUser } from './session';

type MeResponse = CurrentUser | { user: CurrentUser };

/** Bắt buộc đăng nhập; xác thực lại phiên với máy chủ khi mở ứng dụng. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useUser();
  const location = useLocation();
  const token = session.token;
  const me = useQuery({
    queryKey: ['/auth/me', token],
    queryFn: () => http.get<MeResponse>('/auth/me'),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
  });

  useEffect(() => {
    if (!me.data) return;
    const fresh = 'user' in me.data ? me.data.user : me.data;
    session.setUser(fresh);
  }, [me.data]);

  if (!token || !user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?next=${next}`} replace />;
  }
  if (me.isLoading) return <Loading tall />;
  if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) {
    return (
      <Result
        status="warning"
        title="Không xác thực được phiên làm việc"
        subTitle={errorText(me.error)}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => void me.refetch()}>
            Thử lại
          </Button>
        }
      />
    );
  }
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const user = useUser();
  if (!can(user, roles)) {
    return <Result status="403" title="Không có quyền truy cập" subTitle="Tài khoản của bạn không được phân quyền cho màn hình này." extra={<Button href="/admin">Về trung tâm điều hành</Button>} />;
  }
  return <>{children}</>;
}
