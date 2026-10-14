import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Empty, Flex, Popover, Spin, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invalidate, useApi } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { fromNow } from '@/lib/format';
import type { NotificationItem } from '@/types/domain';

export function Notifications() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  const count = useApi<{ unreadCount: number }>('/notifications/count', { refetchInterval: 60_000 });
  const list = useApi<{ items: NotificationItem[]; unreadCount: number }>('/notifications?take=30', { enabled: open });
  const unread = count.data?.unreadCount ?? 0;

  const refresh = () => invalidate(client, ['/notifications']);

  async function openItem(item: NotificationItem) {
    if (!item.readAt) await http.post(`/notifications/${item.id}/read`).catch(() => undefined);
    void refresh();
    setOpen(false);
    if (item.link) navigate(item.link);
  }

  async function readAll() {
    await http.post('/notifications/read-all').catch(() => undefined);
    void refresh();
  }

  const content = (
    <div className="notif-panel">
      <Flex justify="space-between" align="center" className="notif-head">
        <Typography.Text strong>Thông báo</Typography.Text>
        {unread > 0 && (
          <Button size="small" type="link" icon={<CheckOutlined />} onClick={() => void readAll()}>
            Đánh dấu đã đọc
          </Button>
        )}
      </Flex>
      <div className="notif-list">
        {list.isLoading ? (
          <Flex justify="center" style={{ padding: 32 }}>
            <Spin />
          </Flex>
        ) : !list.data?.items.length ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có thông báo" />
        ) : (
          list.data.items.map(item => (
            <button key={item.id} type="button" className={`notif-item${item.readAt ? '' : ' unread'}`} onClick={() => void openItem(item)}>
              <span className="notif-title">{item.title}</span>
              {item.body && <span className="notif-body">{item.body}</span>}
              <span className="notif-time">{fromNow(item.createdAt)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" open={open} onOpenChange={setOpen} placement="bottomRight" arrow={false} styles={{ container: { padding: 0 } }}>
      <Badge count={unread} size="small" overflowCount={99} offset={[-4, 4]}>
        <Button type="text" icon={<BellOutlined />} aria-label="Thông báo" className="head-btn" />
      </Badge>
    </Popover>
  );
}
