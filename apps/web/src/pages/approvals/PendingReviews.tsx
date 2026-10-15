import { CheckOutlined, CloseOutlined, WarningOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Descriptions, Form, Input, Modal, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { TitleCell } from '@/components/Data';
import { ReasonModal } from '@/components/ReasonModal';
import { DeptTag } from '@/components/Tags';
import { invalidate } from '@/hooks/useApi';
import { ApiError, errorText, http } from '@/lib/api';
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
  baseVersion: number;
  createdAt: string;
  user: { id: string; fullName: string };
  target: {
    id: string;
    code: string;
    title: string;
    unit: string;
    version: number;
    currentValue: number;
    lastReportedAt?: string | null;
    targetValue: number;
    targetText?: string | null;
    department: { id: string; name: string; color: string };
  };
  evidenceCount: number;
  autoApproveAt?: string | null;
  canReview: boolean;
};

const DAY = 86_400_000;
const REFRESH = ['/targets', '/my-work', '/ioc', '/notifications'];

function proposed(row: PendingUpdate) {
  return row.valueText || `${num(row.value)} ${row.target.unit}`;
}

/** Số liệu chính thức đã đổi kể từ lúc người gửi lập báo cáo thì không duyệt được nữa. */
const isStale = (row: PendingUpdate) => row.baseVersion !== row.target.version;

function ApproveModal({ row, onClose, onDone }: { row: PendingUpdate | null; onClose: () => void; onDone: () => void }) {
  const [form] = Form.useForm<{ note?: string }>();
  const [busy, setBusy] = useState(false);
  const { message } = App.useApp();
  const client = useQueryClient();
  useEffect(() => {
    if (row) form.resetFields();
  }, [row, form]);

  async function submit(values: { note?: string }) {
    if (!row) return;
    setBusy(true);
    try {
      await http.patch(`/targets/updates/${row.id}/review`, { decision: 'APPROVE', reviewNote: values.note?.trim() || undefined });
      message.success('Đã duyệt số liệu');
      onDone();
    } catch (error) {
      message.error(errorText(error));
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) onDone();
    } finally {
      setBusy(false);
      await invalidate(client, REFRESH);
    }
  }

  return (
    <Modal title="Duyệt số liệu" open={Boolean(row)} onCancel={onClose} onOk={() => form.submit()} okText="Duyệt" confirmLoading={busy} width={560} destroyOnHidden>
      {row && (
        <>
          <Descriptions
            bordered
            size="small"
            column={1}
            style={{ marginBottom: 16 }}
            items={[
              { label: 'Chỉ tiêu', children: `${row.target.code} · ${row.target.title}` },
              { label: 'Kỳ', children: row.periodLabel ?? '—' },
              { label: 'Số hiện tại', children: row.target.lastReportedAt ? `${num(row.target.currentValue)} ${row.target.unit}` : 'Chưa có' },
              { label: 'Số đề xuất', children: <b>{proposed(row)}</b> },
              { label: 'Người gửi', children: `${row.user.fullName} · ${dateTime(row.createdAt)}` },
            ]}
          />
          <Form form={form} layout="vertical" onFinish={values => void submit(values)}>
            <Form.Item name="note" label="Ghi chú duyệt">
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}

/** Bảng báo cáo chờ duyệt: duyệt / trả lại ngay tại chỗ, mở rộng dòng để xem nguồn, giải trình. */
export function PendingReviews({ rows, loading, compact }: { rows: PendingUpdate[]; loading?: boolean; compact?: boolean }) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [approving, setApproving] = useState<PendingUpdate | null>(null);
  const [rejecting, setRejecting] = useState<PendingUpdate | null>(null);
  const [busy, setBusy] = useState(false);

  async function reject(reason: string) {
    if (!rejecting) return;
    setBusy(true);
    try {
      await http.patch(`/targets/updates/${rejecting.id}/review`, { decision: 'REJECT', reviewNote: reason });
      message.success('Đã trả lại báo cáo');
      setRejecting(null);
    } catch (error) {
      message.error(errorText(error));
      if (error instanceof ApiError && (error.status === 409 || error.status === 404)) setRejecting(null);
    } finally {
      setBusy(false);
      await invalidate(client, REFRESH);
    }
  }

  return (
    <>
      <Table
        rowKey="id"
        size={compact ? 'small' : 'middle'}
        loading={loading}
        dataSource={rows}
        scroll={{ x: 1040 }}
        pagination={rows.length > 20 ? { pageSize: 20, showTotal: total => `${num(total)} báo cáo` } : false}
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
            sorter: (a, b) => a.target.code.localeCompare(b.target.code, 'vi'),
            render: (_, row) => <TitleCell title={row.target.title} sub={`${row.target.code}${row.periodLabel ? ` · ${row.periodLabel}` : ''}`} to={`/admin/targets/${row.target.id}`} />,
          },
          {
            title: 'Phòng',
            key: 'dept',
            width: 190,
            sorter: (a, b) => a.target.department.name.localeCompare(b.target.department.name, 'vi'),
            render: (_, row) => <DeptTag name={row.target.department.name} color={row.target.department.color} />,
          },
          {
            title: 'Hiện tại → Đề xuất',
            key: 'value',
            width: 190,
            align: 'right',
            render: (_, row) => (
              <div className="cell-title" style={{ alignItems: 'flex-end' }}>
                <span className="num" style={{ color: 'var(--ioc-color-text)', fontSize: 14, fontWeight: 600 }}>
                  {proposed(row)}
                </span>
                <span className="num">Hiện tại: {row.target.lastReportedAt ? `${num(row.target.currentValue)} ${row.target.unit}` : 'chưa có'}</span>
              </div>
            ),
          },
          {
            title: 'Người gửi',
            key: 'user',
            width: 170,
            sorter: (a, b) => a.createdAt.localeCompare(b.createdAt),
            defaultSortOrder: 'ascend',
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
            width: 136,
            align: 'center',
            sorter: (a, b) => msUntil(a.autoApproveAt) - msUntil(b.autoApproveAt),
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
            width: 196,
            fixed: 'right',
            render: (_, row) =>
              row.canReview ? (
                <Space>
                  <Button size="small" icon={<CloseOutlined />} onClick={() => setRejecting(row)}>
                    Trả lại
                  </Button>
                  {isStale(row) ? (
                    <Tooltip title="Chỉ tiêu đã có số liệu mới sau lúc gửi báo cáo; trả lại để người gửi đối chiếu">
                      <Tag icon={<WarningOutlined />} color="orange" style={{ marginInlineEnd: 0 }}>
                        Dữ liệu đã đổi
                      </Tag>
                    </Tooltip>
                  ) : (
                    <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => setApproving(row)}>
                      Duyệt
                    </Button>
                  )}
                </Space>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Báo cáo của bạn
                </Typography.Text>
              ),
          },
        ]}
      />
      <ApproveModal row={approving} onClose={() => setApproving(null)} onDone={() => setApproving(null)} />
      <ReasonModal
        open={Boolean(rejecting)}
        title="Trả lại báo cáo"
        label="Lý do trả lại"
        okText="Trả lại"
        danger
        min={3}
        loading={busy}
        extra={
          rejecting && (
            <Typography.Paragraph type="secondary">
              {rejecting.target.code} · {rejecting.periodLabel} · {rejecting.user.fullName}
            </Typography.Paragraph>
          )
        }
        onCancel={() => setRejecting(null)}
        onSubmit={reason => void reject(reason)}
      />
    </>
  );
}
