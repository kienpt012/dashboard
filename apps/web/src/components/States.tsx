import { ReloadOutlined } from '@ant-design/icons';
import { Button, Empty, Flex, Result, Skeleton, Spin } from 'antd';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorText } from '@/lib/api';

export function Loading({ tall }: { tall?: boolean }) {
  return (
    <Flex align="center" justify="center" style={{ minHeight: tall ? '60vh' : 200 }}>
      <Spin />
    </Flex>
  );
}

export function PageSkeleton() {
  return (
    <div className="page">
      <Skeleton active title={{ width: 280 }} paragraph={{ rows: 1, width: 180 }} />
      <Skeleton active paragraph={{ rows: 8 }} style={{ marginTop: 24 }} />
    </div>
  );
}

export function LoadError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Result
      status="warning"
      title="Không tải được dữ liệu"
      subTitle={errorText(error)}
      extra={
        retry && (
          <Button icon={<ReloadOutlined />} onClick={retry}>
            Thử lại
          </Button>
        )
      }
    />
  );
}

export function NoData({ text = 'Chưa có dữ liệu', children }: { text?: ReactNode; children?: ReactNode }) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={text} style={{ margin: '24px 0' }}>
      {children}
    </Empty>
  );
}

type QueryLike<T> = { data: T | undefined; error: unknown; isLoading: boolean; refetch: () => unknown };

/** Hiển thị khung chờ / lỗi / nội dung cho một truy vấn. */
export function Query<T>({ query, children, skeleton }: { query: QueryLike<T>; children: (data: T) => ReactNode; skeleton?: ReactNode }) {
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.error) return <LoadError error={query.error} retry={() => void query.refetch()} />;
  return <>{skeleton ?? <Loading />}</>;
}

type BoundaryState = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /dynamically imported module|Failed to fetch|Loading chunk/i.test(this.state.error.message);
    return (
      <Result
        status="error"
        title={chunk ? 'Hệ thống vừa được cập nhật' : 'Màn hình gặp lỗi'}
        subTitle={chunk ? 'Tải lại trang để dùng phiên bản mới.' : this.state.error.message}
        extra={
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => (chunk ? window.location.reload() : this.setState({ error: null }))}>
            {chunk ? 'Tải lại trang' : 'Thử lại'}
          </Button>
        }
      />
    );
  }
}
