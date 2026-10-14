import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Descriptions, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { TitleCell } from '@/components/Data';
import { ReasonModal } from '@/components/ReasonModal';
import { DeptTag } from '@/components/Tags';
import { useAction } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { dateTime, fromNow, msUntil, num, until } from '@/lib/format';

export type PendingUpdate = {
  id: string;
  value: number;
  valueText?: string | null;
  periodKey?: string | null;
  periodLabel?: string | null;
  note?: string | null;
  explanation?: string | null;
  dataSource?: string | null;
  createdAt: string;
  user: { id: string; fullName: string };
  target: { id: string; code: string; title: string; unit: string; targetValue: number; targetText?: string | null; department: { id: string; name: string; color: string } };
  evidenceCount: number;
  autoApproveAt?: string | null;
  canReview: boolean;
};

const DAY = 86_400_000;

/** Bảng báo cáo chờ duyệt: duyệt / trả lại ngay tại chỗ, mở rộng dòng để xem nguồn, giải trình. */
export function PendingReviews({ rows, loading, compact }: { rows: PendingUpdate[]; loading?: boolean; compact?: boolean }) {
  const [rejecting, setRejecting] = useState<PendingUpdate | null>(null);
  const review = useAction(
    ({ id, decision, reviewNote }: { id: string; decision: 'APPROVE' | 'REJECT'; reviewNote?: string }) => http.patch(`/targets/updates/${id}/review`, { decision, reviewNote }),
    {
      success: () => 'Đã xử lý báo cáo',
      refresh: ['/targets', '/my-work', '/ioc', '/notifications'],
      onDone: () => setRejecting(null),
    },
  );

  return (
    <>
      <Table
        rowKey="id"
        size={compact ? 'small' : 'middle'}
        loading={loading}
        dataSource={rows}
        scroll={{ x: 980 }}
        pagination={rows.length > 20 ? { pageSize: 20 } : false}
        locale={{ emptyText: 'Không có báo cáo chờ duyệt' }}
        expandable={{
          expandedRowRender: row => (
            <Descriptions
              size="small"
              column={1}
              colon={false}
              items={[
                { label: 'Chỉ tiêu giao', children: row.target.targetText || `${num(row.target.targetValue)} ${row.target.unit}` },
                { label: 'Nguồn số liệu', children: row.dataSource || '—' },
                ...(row.explanation ? [{ label: 'Giải trình', children: <span className="pre-line">{row.explanation}</span> }] : []),
                ...(row.note ? [{ label: 'Ghi chú', children: <span className="pre-line">{row.note}</span> }] : []),
                { label: 'Minh chứng', children: row.evidenceCount ? `${row.evidenceCount} tệp — xem trong hồ sơ` : 'Không có' },
              ]}
            />
          ),
        }}
        columns={[
          {
            title: 'Chỉ tiêu',
            key: 'target',
            render: (_, row) => <TitleCell title={row.target.title} sub={`${row.target.code}${row.periodLabel ? ` · ${row.periodLabel}` : ''}`} to={`/admin/targets/${row.target.id}`} />,
          },
          { title: 'Phòng', key: 'dept', width: 190, render: (_, row) => <DeptTag name={row.target.department.name} color={row.target.department.color} /> },
          {
            title: 'Giá trị báo cáo',
            key: 'value',
            width: 150,
            align: 'right',
            render: (_, row) => <span className="num">{row.valueText || `${num(row.value)} ${row.target.unit}`}</span>,
          },
          {
            title: 'Người gửi',
            key: 'user',
            width: 170,
            render: (_, row) => (
              <Tooltip title={dateTime(row.createdAt)}>
                <div className="cell-title">
                  <strong>{row.user.fullName}</strong>
                  <span>{fromNow(row.createdAt)}</span>
                </div>
              </Tooltip>
            ),
          },
          {
            title: 'Tự thông qua',
            key: 'auto',
            width: 130,
            render: (_, row) => {
              if (!row.autoApproveAt) return <span className="muted">—</span>;
              const left = msUntil(row.autoApproveAt);
              return (
                <Tooltip title={dateTime(row.autoApproveAt)}>
                  <Tag color={left <= DAY ? 'red' : left <= 2 * DAY ? 'orange' : 'default'}>{left > 0 ? until(row.autoApproveAt) : 'Đến hạn'}</Tag>
                </Tooltip>
              );
            },
          },
          {
            key: 'actions',
            width: 190,
            fixed: 'right',
            render: (_, row) =>
              row.canReview ? (
                <Space>
                  <Button size="small" icon={<CloseOutlined />} onClick={() => setRejecting(row)}>
                    Trả lại
                  </Button>
                  <Button size="small" type="primary" icon={<CheckOutlined />} loading={review.isPending && review.variables?.id === row.id} onClick={() => review.mutate({ id: row.id, decision: 'APPROVE' })}>
                    Duyệt
                  </Button>
                </Space>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Báo cáo của bạn
                </Typography.Text>
              ),
          },
        ]}
      />
      <ReasonModal
        open={Boolean(rejecting)}
        title="Trả lại báo cáo"
        label="Lý do trả lại"
        okText="Trả lại"
        danger
        min={3}
        loading={review.isPending}
        extra={
          rejecting && (
            <Typography.Paragraph type="secondary">
              {rejecting.target.code} · {rejecting.periodLabel} · {rejecting.user.fullName}
            </Typography.Paragraph>
          )
        }
        onCancel={() => setRejecting(null)}
        onSubmit={reason => rejecting && review.mutate({ id: rejecting.id, decision: 'REJECT', reviewNote: reason })}
      />
    </>
  );
}
