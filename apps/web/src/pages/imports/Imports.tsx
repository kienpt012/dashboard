import { CheckOutlined, DownloadOutlined, FileSearchOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Col, Flex, Row, Select, Steps, Table, Tag, Tooltip, Upload, type UploadFile } from 'antd';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/session';
import { Metric, YearSelect } from '@/components/Data';
import { Page } from '@/components/Page';
import { LoadError, NoData } from '@/components/States';
import { ReviewTag } from '@/components/Tags';
import { useAction, useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { errorText, http, query, saveBlob } from '@/lib/api';
import { currentYear, dateTime, fromNow, num } from '@/lib/format';
import { can, isGlobal, LEADERSHIP } from '@/lib/roles';

type RowError = { row: number; code: string; field?: string; message: string };
type Change = { row: number; targetId: string; code: string; departmentId: string; baseVersion: number; oldValue: number; newValue: number; note?: string | null };
type Batch = {
  id: string;
  fileName: string;
  totalRows: number;
  successRows: number;
  errorRows: number;
  errors?: RowError[] | null;
  changes?: Change[] | null;
  createdBy: string;
  departmentId?: string | null;
  department?: { id: string; code: string; name: string } | null;
  status: 'PREVIEWED' | 'SUBMITTED' | 'PARTIALLY_REVIEWED' | 'PARTIALLY_APPROVED' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'FAILED';
  submittedAt?: string | null;
  appliedAt?: string | null;
  createdAt: string;
  reviewCounts?: { pending: number; approved: number; rejected: number };
};
type Preview = Batch & { summary: { totalRows: number; changedRows: number; unchangedRows: number; errorRows: number }; canApply: boolean };
type Applied = Batch & { reviewStatus?: 'PENDING' | 'APPROVED'; idempotent: boolean };
type BatchDetail = Batch & {
  updates: { id: string; value: number; note?: string | null; reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED'; reviewNote?: string | null; createdAt: string; reviewedAt?: string | null; target: { id: string; code: string; title: string; unit: string }; reviewer?: { fullName: string } | null }[];
};

const STATUS: Record<Batch['status'], { label: string; color: string }> = {
  PREVIEWED: { label: 'Đã đối soát, chưa ghi', color: 'default' },
  SUBMITTED: { label: 'Chờ duyệt', color: 'gold' },
  PARTIALLY_REVIEWED: { label: 'Đang duyệt', color: 'gold' },
  PARTIALLY_APPROVED: { label: 'Duyệt một phần', color: 'blue' },
  APPROVED: { label: 'Đã duyệt', color: 'green' },
  REJECTED: { label: 'Bị trả lại', color: 'red' },
  APPLIED: { label: 'Đã ghi nhận', color: 'green' },
  FAILED: { label: 'Lỗi', color: 'red' },
};

function BatchUpdates({ id }: { id: string }) {
  const detail = useApi<BatchDetail>(`/imports/batch/${id}`);
  if (detail.error) return <LoadError error={detail.error} retry={() => void detail.refetch()} />;
  return (
    <Table
      size="small"
      rowKey="id"
      loading={detail.isLoading}
      pagination={false}
      dataSource={detail.data?.updates ?? []}
      locale={{ emptyText: 'Không có dòng cập nhật' }}
      columns={[
        { title: 'Chỉ tiêu', key: 'target', render: (_, row) => <Link to={`/admin/targets/${row.target.id}`}>{row.target.code} · {row.target.title}</Link> },
        { title: 'Giá trị', key: 'value', width: 140, align: 'right', render: (_, row) => `${num(row.value)} ${row.target.unit}` },
        { title: 'Kết quả', key: 'status', width: 120, render: (_, row) => <ReviewTag status={row.reviewStatus} /> },
        { title: 'Người duyệt', key: 'reviewer', width: 200, render: (_, row) => (row.reviewer ? `${row.reviewer.fullName}${row.reviewedAt ? ` · ${fromNow(row.reviewedAt)}` : ''}` : '—') },
        { title: 'Ghi chú', dataIndex: 'reviewNote', render: value => value || '—' },
      ]}
    />
  );
}

export default function Imports() {
  const user = useMe();
  const { message } = App.useApp();
  const global = isGlobal(user);
  const leader = can(user, LEADERSHIP);
  const departments = useDepartments();
  const [year, setYear] = useState(currentYear());
  const [departmentId, setDepartmentId] = useState<string | undefined>(global ? undefined : user.departmentId ?? undefined);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [downloading, setDownloading] = useState(false);
  const history = useApi<Batch[]>(`/imports${query({ departmentId: global ? departmentId : undefined })}`, { keepPrevious: true });

  const step = applied ? 2 : preview ? 1 : 0;

  async function template() {
    if (global && !departmentId) {
      message.warning('Chọn phòng ban để tải phiếu');
      return;
    }
    setDownloading(true);
    try {
      const blob = await http.blob(`/imports/template${query({ year, departmentId })}`);
      const code = (departments.data ?? []).find(item => item.id === departmentId)?.code ?? 'phong';
      saveBlob(blob, `phieu-cap-nhat-${code}-${year}.xlsx`);
    } catch (error) {
      message.error(errorText(error, 'Không tạo được phiếu'));
    } finally {
      setDownloading(false);
    }
  }

  const check = useAction(
    () => {
      const body = new FormData();
      body.append('file', file!);
      return http.post<Preview>('/imports/targets/preview', body);
    },
    {
      refresh: ['/imports'],
      onDone: result => {
        setPreview(result);
        setApplied(null);
      },
    },
  );

  const apply = useAction(() => http.post<Applied>(`/imports/${preview!.id}/apply`), {
    refresh: ['/imports', '/targets', '/ioc', '/my-work'],
    onDone: result => {
      setApplied(result);
      message.success(result.reviewStatus === 'PENDING' ? 'Đã gửi số liệu, chờ duyệt' : 'Đã ghi nhận số liệu chính thức');
    },
  });

  const rows = useMemo(() => {
    if (!preview) return [];
    return [
      ...(preview.errors ?? []).map(error => ({ key: `e${error.row}-${error.field ?? ''}`, row: error.row, kind: 'error' as const, error })),
      ...(preview.changes ?? []).map(change => ({ key: `c${change.row}`, row: change.row, kind: 'change' as const, change })),
    ].sort((a, b) => a.row - b.row);
  }, [preview]);

  const list: UploadFile[] = file ? [{ uid: '1', name: file.name, status: 'done' }] : [];

  return (
    <Page title={global ? 'Nhập số liệu Excel' : 'Nộp báo cáo Excel'} wide>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Card title="Các bước" style={{ height: '100%' }}>
            <Steps
              orientation="vertical"
              current={step}
              items={[
                {
                  title: 'Tải phiếu hiện trạng',
                  content: (
                    <Flex vertical gap={10} style={{ margin: '10px 0 18px' }}>
                      <Flex gap={8} wrap>
                        <YearSelect value={year} onChange={setYear} />
                        {global && (
                          <Select allowClear placeholder="Phòng ban" value={departmentId} onChange={setDepartmentId} options={departmentOptions(departments.data)} style={{ minWidth: 220, flex: 1 }} popupMatchSelectWidth={false} />
                        )}
                      </Flex>
                      <Button icon={<DownloadOutlined />} loading={downloading} onClick={() => void template()}>
                        Tải phiếu Excel
                      </Button>
                    </Flex>
                  ),
                },
                {
                  title: 'Tải lên và đối soát',
                  content: (
                    <Flex vertical gap={10} style={{ margin: '10px 0 18px' }}>
                      <Upload.Dragger
                        accept=".xlsx"
                        maxCount={1}
                        fileList={list}
                        beforeUpload={value => {
                          setFile(value);
                          setPreview(null);
                          setApplied(null);
                          return false;
                        }}
                        onRemove={() => {
                          setFile(null);
                          setPreview(null);
                          setApplied(null);
                        }}
                      >
                        <p className="ant-upload-drag-icon">
                          <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Kéo phiếu đã điền vào đây</p>
                      </Upload.Dragger>
                      <Button icon={<FileSearchOutlined />} disabled={!file} loading={check.isPending} onClick={() => check.mutate()}>
                        Đối soát
                      </Button>
                    </Flex>
                  ),
                },
                {
                  title: leader ? 'Ghi nhận' : 'Gửi duyệt',
                  content: (
                    <Flex vertical gap={10} style={{ marginTop: 10 }}>
                      <Button type="primary" icon={<CheckOutlined />} disabled={!preview?.canApply || Boolean(applied)} loading={apply.isPending} onClick={() => apply.mutate()}>
                        {leader ? 'Ghi nhận số liệu' : 'Gửi số liệu'}
                      </Button>
                      {applied && (
                        <Alert type="success" showIcon title={applied.reviewStatus === 'PENDING' ? `Đã gửi ${num(applied.successRows)} dòng, chờ duyệt` : `Đã ghi nhận ${num(applied.successRows)} dòng`} />
                      )}
                    </Flex>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={15}>
          <Card title={preview ? `Kết quả đối soát · ${preview.fileName}` : 'Kết quả đối soát'} className="card-flush" style={{ height: '100%' }}>
            {preview ? (
              <>
                <div className="metric-grid">
                  <Metric label="Tổng dòng" value={num(preview.summary.totalRows)} />
                  <Metric label="Có thay đổi" value={num(preview.summary.changedRows)} tone={preview.summary.changedRows ? 'info' : undefined} />
                  <Metric label="Không đổi" value={num(preview.summary.unchangedRows)} />
                  <Metric label="Lỗi" value={num(preview.summary.errorRows)} tone={preview.summary.errorRows ? 'bad' : undefined} />
                </div>
                {!preview.canApply && !applied && <Alert type="warning" showIcon banner title={preview.summary.errorRows ? 'Sửa các dòng lỗi trong tệp rồi đối soát lại' : 'Không có thay đổi để ghi nhận'} />}
                <Table
                  size="small"
                  rowKey="key"
                  pagination={rows.length > 50 ? { pageSize: 50 } : false}
                  dataSource={rows}
                  scroll={{ x: 640, y: 480 }}
                  columns={[
                    { title: 'Dòng', dataIndex: 'row', width: 70, align: 'center' },
                    {
                      title: 'Chỉ tiêu',
                      key: 'code',
                      render: (_, item) => (item.kind === 'change' ? <Link to={`/admin/targets/${item.change.targetId}`}>{item.change.code}</Link> : item.error.code || '—'),
                    },
                    {
                      title: 'Thay đổi',
                      key: 'value',
                      render: (_, item) =>
                        item.kind === 'change' ? (
                          <span className="num">
                            {num(item.change.oldValue)} → <b>{num(item.change.newValue)}</b>
                          </span>
                        ) : (
                          <span className="tone-bad">
                            {item.error.field ? `${item.error.field}: ` : ''}
                            {item.error.message}
                          </span>
                        ),
                    },
                    { title: 'Ghi chú', key: 'note', width: 220, render: (_, item) => (item.kind === 'change' ? item.change.note || '—' : '') },
                  ]}
                />
              </>
            ) : (
              <NoData text="Chưa có tệp đối soát" />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="Lịch sử nhập" className="card-flush" style={{ marginTop: 16 }}>
        {history.error && !history.data ? (
          <LoadError error={history.error} retry={() => void history.refetch()} />
        ) : (
          <Table
            rowKey="id"
            loading={history.isLoading}
            dataSource={history.data ?? []}
            scroll={{ x: 900 }}
            pagination={{ defaultPageSize: 10 }}
            locale={{ emptyText: 'Chưa có lượt nhập' }}
            expandable={{ expandedRowRender: batch => <BatchUpdates id={batch.id} />, rowExpandable: batch => batch.status !== 'PREVIEWED' }}
            columns={[
              { title: 'Tệp', key: 'file', render: (_, batch) => <Tooltip title={dateTime(batch.createdAt)}>{batch.fileName}</Tooltip> },
              { title: 'Phòng', key: 'dept', width: 220, render: (_, batch) => batch.department?.name ?? '—' },
              { title: 'Dòng', key: 'rows', width: 150, render: (_, batch) => `${num(batch.successRows)} hợp lệ · ${num(batch.errorRows)} lỗi` },
              {
                title: 'Trạng thái',
                key: 'status',
                width: 220,
                render: (_, batch) => (
                  <Flex gap={6} wrap>
                    <Tag color={STATUS[batch.status].color}>{STATUS[batch.status].label}</Tag>
                    {batch.reviewCounts && batch.reviewCounts.pending > 0 && <span className="entry-meta">{batch.reviewCounts.pending} chờ duyệt</span>}
                  </Flex>
                ),
              },
              { title: 'Thời gian', dataIndex: 'createdAt', width: 150, render: value => fromNow(value) },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}
