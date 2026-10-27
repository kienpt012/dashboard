import { BellOutlined, CheckCircleOutlined, CheckOutlined, FileTextOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { invalidate, useApi } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { fromNow, num, until } from '@/lib/format';
import type { MyWork, NotificationItem } from '@/types/domain';
import { DOC_STATUS } from '../../documents/labels';
import { WidgetSkeleton } from '../WidgetFrame';
import { useSettings, useWidget } from './context';
import { workSections, type WorkSection } from './logic';
import { DepartmentGate, MoreLink, Note, Row } from './parts';

// Nhóm "Việc của tôi": việc đang chờ mình (đếm và vài dòng đầu mỗi mục), thông báo (đọc ngay tại chỗ), văn bản mới
// của phòng.

const SECTION: Record<WorkSection, { label: string; tab: string }> = {
  needReport: { label: 'Cần báo cáo', tab: 'bao-cao' },
  toReview: { label: 'Chờ tôi duyệt', tab: 'cho-duyet' },
  explanations: { label: 'Giải trình', tab: 'giai-trinh' },
  proposals: { label: 'Đề xuất chờ xử lý', tab: 'de-xuat' },
};

function sectionRows(data: MyWork, key: WorkSection, take: number) {
  switch (key) {
    case 'needReport':
      return data.needReport.slice(0, take).map(target => (
        <Row
          key={target.id}
          tone={target.missingPeriods.length && !target.pendingReport ? 'warning' : undefined}
          title={target.title}
          titleHint={`${target.code} · ${target.title}`}
          to={target.pendingReport ? `/admin/targets/${target.id}` : `/admin/targets/${target.id}?bao-cao=${target.missingPeriodKeys?.[0] ?? target.currentPeriodKey ?? 1}`}
          meta={target.pendingReport ? `${target.code} · có báo cáo chờ duyệt` : `${target.code} · ${target.missingPeriods.length ? `thiếu ${target.missingPeriods.join(', ')}` : target.currentPeriod}`}
        />
      ));
    case 'toReview':
      return data.toReview.slice(0, take).map(item => (
        <Row
          key={item.id}
          tone={item.days >= 3 ? 'critical' : 'warning'}
          title={item.target.title}
          titleHint={`${item.target.code} · ${item.target.title}`}
          to={`/admin/targets/${item.target.id}`}
          meta={`${item.target.code} · gửi ${fromNow(item.createdAt)}`}
        />
      ));
    case 'explanations':
      return data.explanations.slice(0, take).map(target => (
        <Row
          key={target.request.id}
          tone={new Date(target.request.dueAt).getTime() < Date.now() ? 'critical' : 'warning'}
          title={target.title}
          titleHint={target.request.message}
          to={`/admin/targets/${target.id}`}
          meta={`${target.code} · hạn trả lời ${until(target.request.dueAt)}`}
        />
      ));
    case 'proposals':
      return data.proposals.slice(0, take).map(item => (
        <Row
          key={item.id}
          tone={item.autoApproveAt ? 'warning' : undefined}
          title={item.name}
          titleHint={item.name}
          to={`/admin/proposals?id=${encodeURIComponent(item.id)}`}
          meta={[item.responsibleDepartment?.name, item.autoApproveAt ? `tự thông qua ${until(item.autoApproveAt)}` : null].filter(Boolean).join(' · ') || undefined}
        />
      ));
  }
}

export function MyWorkWidget() {
  const { sections = [] } = useSettings<{ sections: string[] }>();
  const { refreshMs, maximized } = useWidget();
  const work = useApi<MyWork>('/my-work', { refetchInterval: refreshMs });
  if (!work.data) return work.isError ? <Note>Không tải được việc của bạn</Note> : <WidgetSkeleton />;
  const data = work.data;
  const counts: Record<WorkSection, number> = {
    needReport: data.needReport.length,
    toReview: data.counts.toReview,
    explanations: data.explanations.length,
    proposals: data.proposals.length,
  };
  const shown = workSections(counts, sections);
  if (!shown.some(key => counts[key] > 0)) {
    return (
      <Note icon={<CheckCircleOutlined />} tone="ok">
        Bạn đã xử lý hết việc
      </Note>
    );
  }
  const take = maximized ? 20 : 3;
  return (
    <div className="dws-work">
      {shown.map(key => (
        <section key={key} className="dws-work-section">
          <Link className="dws-work-head" to={`/admin/viec-cua-toi?tab=${SECTION[key].tab}`}>
            <span>{SECTION[key].label}</span>
            <Badge count={counts[key]} showZero color={counts[key] ? undefined : '#c5cad3'} overflowCount={999} />
          </Link>
          {counts[key] ? sectionRows(data, key, take) : <span className="wr-meta dws-work-empty">Không có</span>}
          {counts[key] > take && <MoreLink to={`/admin/viec-cua-toi?tab=${SECTION[key].tab}`}>Xem cả {num(counts[key])}</MoreLink>}
        </section>
      ))}
    </div>
  );
}

export function MyNotifications() {
  const { maxItems = 8 } = useSettings<{ maxItems: number }>();
  const { refreshMs, maximized } = useWidget();
  const navigate = useNavigate();
  const client = useQueryClient();
  const take = maximized ? 30 : maxItems;
  const list = useApi<{ items: NotificationItem[]; unreadCount: number }>(`/notifications?take=${take}`, { refetchInterval: refreshMs, keepPrevious: true });
  const refresh = () => invalidate(client, ['/notifications']);

  const open = async (item: NotificationItem) => {
    if (!item.readAt) await http.post(`/notifications/${item.id}/read`).catch(() => undefined);
    void refresh();
    if (item.link) navigate(item.link);
  };

  if (!list.data) return list.isError ? <Note>Không tải được thông báo</Note> : <WidgetSkeleton />;
  if (!list.data.items.length) return <Note icon={<BellOutlined />}>Không có thông báo</Note>;
  return (
    <div className="dws-notifs">
      {list.data.unreadCount > 0 && (
        <div className="dws-notifs-bar">
          <span>{num(list.data.unreadCount)} chưa đọc</span>
          <Button
            size="small"
            type="link"
            icon={<CheckOutlined />}
            onClick={async () => {
              await http.post('/notifications/read-all').catch(() => undefined);
              void refresh();
            }}
          >
            Đánh dấu đã đọc
          </Button>
        </div>
      )}
      {list.data.items.map(item => (
        <button key={item.id} type="button" className={`dws-notif${item.readAt ? '' : ' unread'}`} onClick={() => void open(item)}>
          <span className="wr-title">{item.title}</span>
          {item.body && <span className="dws-notif-body">{item.body}</span>}
          <span className="wr-meta">{fromNow(item.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

export function RecentDocuments() {
  const { maxItems = 6 } = useSettings<{ maxItems: number }>();
  const { maximized } = useWidget();
  return (
    <DepartmentGate>
      {data =>
        data.documents.length ? (
          <div className="wl">
            {data.documents.slice(0, maximized ? 8 : maxItems).map(document => (
              <Row
                key={document.id}
                title={document.title}
                titleHint={`${document.code} · ${document.title}`}
                to={`/admin/documents/${document.id}`}
                meta={`${document.code} · ${fromNow(document.createdAt)}`}
                trail={<span className={`dws-doc-status ${document.status.toLowerCase()}`}>{DOC_STATUS[document.status as keyof typeof DOC_STATUS]?.label ?? document.status}</span>}
              />
            ))}
            <MoreLink to="/admin/documents">Mở Kho văn bản</MoreLink>
          </div>
        ) : (
          <Note icon={<FileTextOutlined />}>Chưa có văn bản</Note>
        )
      }
    </DepartmentGate>
  );
}
