import { FilterOutlined } from '@ant-design/icons';
import { Badge, Breadcrumb, Button, Drawer, Flex, Grid, Typography } from 'antd';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PinPage } from '@/pages/desk/PinPage';

type Crumb = { label: ReactNode; to?: string };

type PageProps = {
  title: ReactNode;
  /** Thẻ nhỏ cạnh tiêu đề: mã, tình trạng… */
  tags?: ReactNode;
  /** Dòng thông tin ngắn dưới tiêu đề (dữ liệu, không phải lời giải thích). */
  meta?: ReactNode;
  extra?: ReactNode;
  breadcrumb?: Crumb[];
  children: ReactNode;
  /** Bỏ giới hạn chiều rộng cho bảng nhiều cột. */
  wide?: boolean;
};

/** Khung chung của mọi màn hình quản trị: tiêu đề, thao tác chính, nội dung. */
export function Page({ title, tags, meta, extra, breadcrumb, children, wide }: PageProps) {
  return (
    <div className={`page${wide ? ' page-wide' : ''}`}>
      {breadcrumb && (
        <Breadcrumb
          className="page-crumbs"
          items={breadcrumb.map(item => ({ title: item.to ? <Link to={item.to}>{item.label}</Link> : item.label }))}
        />
      )}
      <Flex className="page-head" align="flex-start" justify="space-between" gap={16} wrap>
        <div className="page-title">
          <Flex align="center" gap={10} wrap>
            <Typography.Title level={1}>{title}</Typography.Title>
            {tags}
            <PinPage title={typeof title === 'string' ? title : undefined} />
          </Flex>
          {meta && <div className="page-meta">{meta}</div>}
        </div>
        {extra && (
          <Flex className="page-extra" gap={8} wrap align="center">
            {extra}
          </Flex>
        )}
      </Flex>
      {children}
    </div>
  );
}

/** Thanh lọc phía trên bảng. */
export function Toolbar({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <Flex className="toolbar" gap={8} wrap align="center" justify="space-between">
      <Flex gap={8} wrap align="center" style={{ flex: 1, minWidth: 0 }}>
        {children}
      </Flex>
      {extra && (
        <Flex gap={8} wrap align="center">
          {extra}
        </Flex>
      )}
    </Flex>
  );
}

/** Thanh lọc co giãn: màn hình rộng hiện hết; màn hình hẹp chỉ còn ô tìm kiếm và nút mở ngăn bộ lọc. */
export function FilterBar({ search, filters, extra, active = 0 }: { search?: ReactNode; filters: ReactNode; extra?: ReactNode; active?: number }) {
  const screens = Grid.useBreakpoint();
  const [open, setOpen] = useState(false);
  if (screens.md) {
    return (
      <Toolbar extra={extra}>
        {search}
        {filters}
      </Toolbar>
    );
  }
  return (
    <>
      <Flex className="toolbar" gap={8} align="center">
        <div style={{ flex: 1, minWidth: 0 }}>{search}</div>
        <Badge count={active} size="small">
          <Button icon={<FilterOutlined />} onClick={() => setOpen(true)}>
            Lọc
          </Button>
        </Badge>
      </Flex>
      <Drawer title="Bộ lọc" placement="bottom" open={open} onClose={() => setOpen(false)} size="auto" styles={{ body: { paddingBottom: 24 } }}>
        <Flex vertical gap={12} className="filter-stack">
          {filters}
          {extra}
        </Flex>
      </Drawer>
    </>
  );
}
