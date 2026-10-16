import { FileSearchOutlined, FormOutlined } from '@ant-design/icons';
import { Breadcrumb, Button, Card, Result, Skeleton, Space, Tag, Timeline, type ButtonProps } from 'antd';
import type { ReactNode } from 'react';
import { Link, useHref, useLinkClickHandler, useParams, type To } from 'react-router-dom';
import { LoadError, NoData } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { ApiError } from '@/lib/api';
import { dateTime } from '@/lib/format';
import type { PublicFeedbackEvent, PublicFeedbackMessage, PublishedFeedbackDetail } from '@/types/core';
import { FEEDBACK_CATEGORY, FEEDBACK_EVENT, FEEDBACK_STATUS } from '../feedback/labels';
import { PublicShell } from './PublicShell';
import './feedback-public.css';

function LinkButton({ to, ...props }: Omit<ButtonProps, 'href' | 'onClick'> & { to: To }) {
  const href = useHref(to);
  const onClick = useLinkClickHandler<HTMLElement>(to);
  return <Button {...props} href={href} onClick={onClick} />;
}

export function withoutResultEcho(messages: PublicFeedbackMessage[], summary?: string | null) {
  const result = summary?.trim();
  return result ? messages.filter(message => !(message.authorName !== 'Người dân' && message.body.trim() === result)) : messages;
}

// Nhãn mốc xử lý theo cách người dân đọc; phần còn lại dùng chung với trang quản trị.
const EVENT_LABEL: Record<string, string> = {
  ...FEEDBACK_EVENT,
  CREATED: 'Tiếp nhận phản ánh',
  FEEDBACK_ASSIGNED: 'Chuyển đơn vị xử lý',
  CONTACT_ATTEMPT_LOGGED: 'Đơn vị xử lý liên hệ xác minh',
  INFORMATION_REQUESTED: 'Đề nghị người dân bổ sung thông tin',
  PUBLIC_MESSAGE_ADDED: 'Đơn vị xử lý phản hồi',
  CITIZEN_ATTACHMENTS_ADDED: 'Người dân bổ sung tệp minh chứng',
  RESOLUTION_APPROVED: 'Kết quả xử lý được phê duyệt',
  RESOLUTION_RETURNED: 'Kết quả được trả lại để hoàn thiện',
  CITIZEN_REOPEN_REQUEST_REJECTED: 'Đề nghị xem xét lại không được chấp nhận',
  FEEDBACK_PUBLISHED: 'Công khai kết quả',
  FEEDBACK_UNPUBLISHED: 'Tạm gỡ khỏi trang công khai',
};

const EVENT_COLOR: Record<string, string> = {
  FEEDBACK_REJECTED: 'red',
  FEEDBACK_CLOSED_NO_RESPONSE: 'red',
  CITIZEN_REOPEN_REQUEST_REJECTED: 'red',
  RESOLUTION_APPROVED: 'green',
  FEEDBACK_CLOSED: 'green',
  FEEDBACK_PUBLISHED: 'green',
};

/** Các mốc xử lý theo thời gian; mốc mới nhất tô màu chính. */
export function EventTimeline({ events }: { events: PublicFeedbackEvent[] }) {
  if (!events.length) return <NoData text="Chưa có mốc xử lý" />;
  return (
    <Timeline
      className="fbp-timeline"
      items={events.map((event, index) => ({
        key: `${event.createdAt}-${event.action}-${index}`,
        color: index === events.length - 1 ? 'blue' : (EVENT_COLOR[event.action] ?? 'gray'),
        content: (
          <div className="fbp-event">
            <b>{EVENT_LABEL[event.action] ?? 'Cập nhật hồ sơ'}</b>
            <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time>
          </div>
        ),
      }))}
    />
  );
}

/** Trao đổi công khai giữa người dân và đơn vị xử lý. */
export function MessageThread({ messages, selfLabel = 'Người dân' }: { messages: PublicFeedbackMessage[]; selfLabel?: string }) {
  return (
    <div className="fbp-thread">
      {messages.map((message, index) => {
        const citizen = message.authorName === 'Người dân';
        return (
          <div key={`${message.createdAt}-${index}`} className={`fbp-msg${citizen ? ' mine' : ''}`}>
            <div className="fbp-msg-head">
              <b>{citizen ? selfLabel : 'Đơn vị xử lý'}</b>
              <time dateTime={message.createdAt}>{dateTime(message.createdAt)}</time>
            </div>
            <div className="fbp-msg-body">{message.body}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Lưới thông tin ngắn: nhãn trên, giá trị dưới. */
export function MetaGrid({ items }: { items: { label: string; value: ReactNode; hint?: ReactNode }[] }) {
  return (
    <dl className="fbp-meta">
      {items.map(item => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>
            {item.value}
            {item.hint ? <small>{item.hint}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSkeleton() {
  return (
    <div className="fbp-layout">
      <div className="fbp-stack">
        <Card>
          <Skeleton active title={{ width: '70%' }} paragraph={{ rows: 3 }} />
        </Card>
        <Card>
          <Skeleton active paragraph={{ rows: 5 }} />
        </Card>
      </div>
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    </div>
  );
}

export default function PublishedFeedback() {
  const { code = '' } = useParams();
  const detail = useApi<PublishedFeedbackDetail>(code ? `/public/feedbacks/published/${encodeURIComponent(code)}` : null);
  const item = detail.data;
  const notFound = !code || (detail.error instanceof ApiError && detail.error.status === 404);
  const status = item ? FEEDBACK_STATUS[item.status] : null;
  const thread = item ? withoutResultEcho(item.messages, item.resolutionSummary) : [];

  return (
    <PublicShell title={item?.title || 'Kết quả phản ánh'}>
      <div className="pub-container fbp-body">
        <Breadcrumb
          className="fbp-crumbs"
          items={[
            { title: <Link to="/">Trang chủ</Link> },
            { title: <Link to="/phan-anh?tab=cong-khai">Kết quả phản ánh</Link> },
            { title: <span className="fbp-mono">{item?.code ?? code.toUpperCase()}</span> },
          ]}
        />
        {notFound ? (
          <Card>
            <Result
              status="404"
              title="Không tìm thấy phản ánh"
              subTitle="Phản ánh không tồn tại hoặc đã gỡ khỏi trang công khai."
              extra={<LinkButton to="/phan-anh?tab=cong-khai" type="primary">Xem kết quả khác</LinkButton>}
            />
          </Card>
        ) : detail.error ? (
          <Card>
            <LoadError error={detail.error} retry={() => void detail.refetch()} />
          </Card>
        ) : !item ? (
          <DetailSkeleton />
        ) : (
          <div className="fbp-layout">
            <div className="fbp-stack">
              <Card>
                <Space size={[6, 6]} wrap>
                  {status && (
                    <Tag color={status.color} variant="filled" style={{ marginInlineEnd: 0 }}>
                      {status.label}
                    </Tag>
                  )}
                  <Tag style={{ marginInlineEnd: 0 }}>{FEEDBACK_CATEGORY[item.category] ?? 'Nội dung khác'}</Tag>
                  <span className="fbp-mono fbp-code-text">{item.code}</span>
                </Space>
                <h1 className="fbp-title">{item.title}</h1>
                <MetaGrid
                  items={[
                    { label: 'Đơn vị xử lý', value: item.departmentName || '—' },
                    { label: 'Tiếp nhận', value: dateTime(item.createdAt) },
                    { label: 'Hoàn thành', value: dateTime(item.resolvedAt || item.closedAt) },
                    { label: 'Công khai', value: dateTime(item.publishedAt) },
                  ]}
                />
              </Card>
              <Card title="Nội dung phản ánh">
                <div className="fbp-text">{item.content}</div>
              </Card>
              <Card title="Kết quả xử lý">
                <div className="fbp-result">{item.resolutionSummary || 'Chưa cập nhật'}</div>
              </Card>
              {thread.length > 0 && (
                <Card title="Trao đổi công khai">
                  <MessageThread messages={thread} />
                </Card>
              )}
            </div>
            <div className="fbp-stack">
              <Card title="Quá trình xử lý">
                <EventTimeline events={item.timeline} />
              </Card>
              <Card>
                <div className="fbp-cta">
                  <LinkButton to="/phan-anh" type="primary" block icon={<FormOutlined />}>
                    Gửi phản ánh
                  </LinkButton>
                  <LinkButton to="/phan-anh?tab=tra-cuu" block icon={<FileSearchOutlined />}>
                    Tra cứu hồ sơ đã gửi
                  </LinkButton>
                  <LinkButton to="/phan-anh?tab=cong-khai" block type="text">
                    Xem kết quả khác
                  </LinkButton>
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </PublicShell>
  );
}
