import { PictureOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Drawer, Flex, Form, Image, Input, Segmented, Select, Table, Tag, Tooltip } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { FilterBar, Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { errorText, http } from '@/lib/api';
import { dateTime, fromNow, num } from '@/lib/format';
import { byDate, byNumber, byRank, byText, NUMBER_FIRST } from '@/lib/sort';

type Status = 'NEW' | 'IN_PROGRESS' | 'RESOLVED' | 'WONT_FIX';
const STATUS_RANK: Status[] = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX'];
type Report = {
  id: string;
  reporterName: string;
  url: string;
  pageTitle?: string | null;
  screenCode?: string | null;
  viewport?: string | null;
  userAgent?: string | null;
  description: string;
  status: Status;
  adminNote?: string | null;
  resolvedAt?: string | null;
  version: number;
  createdAt: string;
  hasScreenshot: boolean;
};

const STATUS: Record<Status, { label: string; color: string }> = {
  NEW: { label: 'Mới', color: 'red' },
  IN_PROGRESS: { label: 'Đang xử lý', color: 'gold' },
  RESOLVED: { label: 'Đã sửa', color: 'green' },
  WONT_FIX: { label: 'Không sửa', color: 'default' },
};

function ReportDrawer({ item, onClose }: { item: Report | null; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<{ status: Status; adminNote?: string }>();
  const [shot, setShot] = useState<{ reportId: string; url: string } | null>(null);
  useEffect(() => {
    setShot(null);
    if (!item) return;
    form.setFieldsValue({ status: item.status, adminNote: item.adminNote ?? '' });
    if (!item.hasScreenshot) return;
    let active = true;
    let url = '';
    http
      .blob(`/bug-reports/${item.id}/screenshot`)
      .then(blob => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setShot({ reportId: item.id, url });
      })
      .catch(error => {
        if (active) message.error(errorText(error, 'Không tải được ảnh'));
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item, form, message]);

  const save = useAction((values: { status: Status; adminNote?: string }) => http.patch(`/bug-reports/${item!.id}`, { expectedVersion: item!.version, status: values.status, adminNote: values.adminNote?.trim() || undefined }), {
    success: 'Đã cập nhật',
    refresh: ['/bug-reports'],
    onDone: onClose,
  });

  return (
    <Drawer
      title="Báo lỗi"
      open={Boolean(item)}
      onClose={onClose}
      size={640}
      destroyOnHidden
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onClose}>Đóng</Button>
          <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>
            Lưu
          </Button>
        </Flex>
      }
    >
      {item && (
        <Flex vertical gap={16}>
          <Descriptions
            bordered
            size="small"
            column={1}
            items={[
              { label: 'Người gửi', children: `${item.reporterName} · ${dateTime(item.createdAt)}` },
              { label: 'Màn hình', children: `${item.screenCode ?? '—'}${item.pageTitle ? ` · ${item.pageTitle}` : ''}` },
              {
                label: 'Địa chỉ',
                children: (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="break-all">
                    {item.url}
                  </a>
                ),
              },
              { label: 'Khung nhìn', children: item.viewport ?? '—' },
              { label: 'Trình duyệt', children: <span className="break-all muted">{item.userAgent ?? '—'}</span> },
            ]}
          />
          <div className="quote">{item.description}</div>
          {item.hasScreenshot && (shot?.reportId === item.id ? <Image src={shot.url} alt="Ảnh chụp màn hình" /> : <Tag icon={<PictureOutlined />}>Đang tải ảnh</Tag>)}
          <Form form={form} layout="vertical" onFinish={values => save.mutate(values)}>
            <Form.Item name="status" label="Trạng thái">
              <Select options={(Object.keys(STATUS) as Status[]).map(value => ({ value, label: STATUS[value].label }))} />
            </Form.Item>
            <Form.Item name="adminNote" label="Ghi chú xử lý">
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={2000} />
            </Form.Item>
          </Form>
        </Flex>
      )}
    </Drawer>
  );
}

export default function BugReports() {
  const list = useApi<Report[]>('/bug-reports');
  const [status, setStatus] = useState<Status | 'ALL'>('ALL');
  const [text, setText] = useState('');
  const [open, setOpen] = useState<Report | null>(null);
  const rows = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase('vi');
    return (list.data ?? []).filter(item => (status === 'ALL' || item.status === status) && (!needle || `${item.description} ${item.url} ${item.screenCode ?? ''} ${item.reporterName}`.toLocaleLowerCase('vi').includes(needle)));
  }, [list.data, status, text]);
  const count = (value: Status) => (list.data ?? []).filter(item => item.status === value).length;

  return (
    <Page title="Báo lỗi" meta={list.data && <span>{num(count('NEW'))} mới · {num(list.data.length)} báo lỗi</span>} wide>
      <Card className="card-flush">
        <div className="table-filters">
          <FilterBar
            active={status === 'ALL' ? 0 : 1}
            search={<Input allowClear prefix={<SearchOutlined />} placeholder="Nội dung, địa chỉ, mã màn hình" value={text} onChange={event => setText(event.target.value)} style={{ width: '100%', maxWidth: 300 }} />}
            filters={
              <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
                <Segmented
                  style={{ minWidth: 'max-content' }}
                  value={status}
                  onChange={value => setStatus(value as Status | 'ALL')}
                  options={[{ value: 'ALL', label: 'Tất cả' }, ...(Object.keys(STATUS) as Status[]).map(value => ({ value, label: `${STATUS[value].label} ${count(value)}` }))]}
                />
              </div>
            }
          />
        </div>
        {list.error && !list.data ? (
          <LoadError error={list.error} retry={() => void list.refetch()} />
        ) : (
          <Table
            rowKey="id"
            loading={list.isLoading}
            dataSource={rows}
            scroll={{ x: 900 }}
            pagination={{ defaultPageSize: 20 }}
            onRow={item => ({ onClick: () => setOpen(item), className: 'link-row' })}
            locale={{ emptyText: 'Chưa có báo lỗi' }}
            columns={[
              { title: 'Mô tả', dataIndex: 'description', sorter: byText(item => item.description), render: value => <span className="clamp-2">{value}</span> },
              { title: 'Màn hình', dataIndex: 'screenCode', width: 128, sorter: byText(item => item.screenCode), render: (value, item) => <Tooltip title={item.url}>{value ?? '—'}</Tooltip> },
              { title: 'Người gửi', dataIndex: 'reporterName', width: 180, sorter: byText(item => item.reporterName) },
              { title: 'Ảnh', dataIndex: 'hasScreenshot', width: 70, align: 'center', sorter: byNumber(item => Number(item.hasScreenshot)), sortDirections: NUMBER_FIRST, render: value => (value ? <PictureOutlined /> : null) },
              { title: 'Trạng thái', dataIndex: 'status', width: 130, sorter: byRank(STATUS_RANK, item => item.status), render: (value: Status) => <Tag color={STATUS[value].color}>{STATUS[value].label}</Tag> },
              { title: 'Gửi lúc', dataIndex: 'createdAt', width: 130, sorter: byDate(item => item.createdAt), defaultSortOrder: 'descend', render: value => <Tooltip title={dateTime(value)}>{fromNow(value)}</Tooltip> },
            ]}
          />
        )}
      </Card>
      <ReportDrawer item={open} onClose={() => setOpen(null)} />
    </Page>
  );
}
