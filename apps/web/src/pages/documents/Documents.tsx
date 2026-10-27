import { CloudUploadOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, FileSearchOutlined, InboxOutlined, MoreOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Badge, Button, Card, DatePicker, Dropdown, Form, Input, InputNumber, Modal, Select, Switch, Table, Tag, Tooltip, Upload, type UploadFile } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMe } from '@/app/session';
import { TitleCell } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { errorText, http, query, saveBlob } from '@/lib/api';
import { currentYear, date, dateTime, fileSize, fromNow, num } from '@/lib/format';
import { ADMINS, can, WORKING } from '@/lib/roles';
import { documentTypeLabels, type DocumentStatus, type DocumentType, type SourceDocument } from '@/types/core';
import { DOC_STATUS } from './labels';

const ACCEPT = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp';
const MAX = 25 * 1024 * 1024;

/** Các trường thông tin văn bản dùng chung cho tải lên và sửa thông tin. */
function DocumentFields() {
  const departments = useDepartments();
  return (
    <>
      <Form.Item name="title" label="Trích yếu" className="span-2" rules={[{ min: 3, max: 300, whitespace: true, message: 'Từ 3 đến 300 ký tự' }]}>
        <Input />
      </Form.Item>
      <Form.Item name="docType" label="Loại văn bản">
        <Select allowClear placeholder="Chưa phân loại" options={(Object.keys(documentTypeLabels) as DocumentType[]).map(key => ({ value: key, label: documentTypeLabels[key] }))} />
      </Form.Item>
      <Form.Item name="docNumber" label="Số hiệu">
        <Input maxLength={80} placeholder="125/KH-UBND" />
      </Form.Item>
      <Form.Item name="issuedBy" label="Cơ quan ban hành">
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item name="issuedDate" label="Ngày ban hành">
        <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="year" label="Năm áp dụng">
        <InputNumber min={2000} max={2100} style={{ width: '100%' }} />
      </Form.Item>
      <Form.Item name="departmentId" label="Phòng liên quan">
        <Select allowClear options={departmentOptions(departments.data)} />
      </Form.Item>
      <Form.Item name="description" label="Ghi chú" className="span-2">
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} />
      </Form.Item>
    </>
  );
}

type EditValues = { title?: string; docType?: DocumentType; docNumber?: string; issuedBy?: string; issuedDate?: Dayjs | null; year?: number; departmentId?: string; description?: string };

/** Ngày theo giờ Việt Nam ("YYYY-MM-DD") của mốc thời gian lưu trên máy chủ — không lệch ngày khi máy đặt múi giờ khác. */
function vietnamDate(iso?: string | null) {
  return iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso)) : '';
}

/** Sửa thông tin văn bản (trích yếu, số hiệu, cơ quan, ngày ban hành…) — không đổi tệp. Chỉ gửi trường đã đổi. */
function EditDocumentModal({ document, onClose }: { document: SourceDocument | null; onClose: () => void }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<EditValues>();
  useEffect(() => {
    if (!document) return;
    form.resetFields();
    form.setFieldsValue({
      title: document.title,
      docType: document.docType,
      docNumber: document.docNumber ?? '',
      issuedBy: document.issuedBy ?? '',
      issuedDate: document.issuedDate ? dayjs(vietnamDate(document.issuedDate)) : null,
      year: document.year ?? undefined,
      departmentId: document.departmentId ?? undefined,
      description: document.description ?? '',
    });
  }, [document, form]);
  const save = useAction(
    (changes: Record<string, unknown>) => http.patch<SourceDocument>(`/documents/${document!.id}`, { expectedVersion: document!.version, ...changes }),
    { success: 'Đã cập nhật thông tin văn bản', refresh: ['/documents', '/frameworks', '/targets'], onDone: onClose },
  );
  function submit(values: EditValues) {
    const before: Record<string, unknown> = {
      title: document!.title, docType: document!.docType, docNumber: document!.docNumber ?? '', issuedBy: document!.issuedBy ?? '',
      issuedDate: vietnamDate(document!.issuedDate), year: document!.year ?? null, departmentId: document!.departmentId ?? '', description: document!.description ?? '',
    };
    const after: Record<string, unknown> = {
      title: values.title?.trim() ?? '', docType: values.docType ?? 'KHAC', docNumber: values.docNumber?.trim() ?? '', issuedBy: values.issuedBy?.trim() ?? '',
      issuedDate: values.issuedDate ? values.issuedDate.format('YYYY-MM-DD') : '', year: values.year ?? null, departmentId: values.departmentId ?? '', description: values.description?.trim() ?? '',
    };
    const changes = Object.fromEntries(Object.entries(after).filter(([key, value]) => value !== before[key]));
    if (!Object.keys(changes).length) {
      message.info('Chưa có thay đổi');
      onClose();
      return;
    }
    save.mutate(changes);
  }
  return (
    <Modal
      title={document ? `Sửa thông tin ${document.code}` : 'Sửa thông tin văn bản'}
      open={Boolean(document)}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Lưu"
      confirmLoading={save.isPending}
      width={680}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={submit} className="form-grid">
        <DocumentFields />
      </Form>
    </Modal>
  );
}

function UploadModal({ open, onClose, docNumber }: { open: boolean; onClose: () => void; docNumber?: string }) {
  const user = useMe();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ year: currentYear(), departmentId: user.departmentId ?? undefined, docNumber, autoExtract: true });
      setFile(null);
    }
  }, [open, form, user.departmentId, docNumber]);

  const upload = useAction(
    (values: Record<string, unknown>) => {
      const body = new FormData();
      body.append('file', file!);
      for (const [key, value] of Object.entries(values)) {
        if (value === undefined || value === null || value === '') continue;
        body.append(key, key === 'issuedDate' ? (value as { format: (pattern: string) => string }).format('YYYY-MM-DD') : String(value).trim());
      }
      return http.post<SourceDocument>('/documents', body);
    },
    {
      refresh: ['/documents'],
      onDone: created => {
        message.success(`Đã tải lên ${created.code}`);
        onClose();
        navigate(`/admin/documents/${created.id}`);
      },
    },
  );

  const list: UploadFile[] = file ? [{ uid: '1', name: file.name, size: file.size, status: 'done' }] : [];

  return (
    <Modal
      title="Tải văn bản lên"
      open={open}
      onCancel={onClose}
      onOk={() => {
        if (!file) {
          message.warning('Chọn tệp văn bản');
          return;
        }
        form.submit();
      }}
      okText="Tải lên"
      confirmLoading={upload.isPending}
      width={680}
      destroyOnHidden
      mask={{ closable: false }}
    >
      <Upload.Dragger
        accept={ACCEPT}
        maxCount={1}
        fileList={list}
        beforeUpload={value => {
          if (value.size > MAX) {
            message.warning('Tệp vượt quá 25MB');
            return Upload.LIST_IGNORE;
          }
          setFile(value);
          const name = value.name.replace(/\.[^.]+$/, '').trim();
          if (!form.getFieldValue('title') && name.length >= 3) form.setFieldValue('title', name);
          return false;
        }}
        onRemove={() => setFile(null)}
        style={{ marginBottom: 16 }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Kéo tệp vào đây hoặc bấm để chọn</p>
        <p className="ant-upload-hint">PDF, Word, Excel hoặc ảnh chụp; tối đa 25MB</p>
      </Upload.Dragger>
      <Form form={form} layout="vertical" onFinish={values => upload.mutate(values)} className="form-grid">
        <DocumentFields />
        <Form.Item
          name="autoExtract"
          label="AI tự đề xuất chỉ tiêu từ văn bản này"
          valuePropName="checked"
          className="span-2"
          extra="Tắt khi văn bản chỉ để lưu, tra cứu và định vị nguồn (ví dụ phụ lục giao chỉ tiêu cho nhiều xã, phường). Có thể chạy trích xuất sau trong trang văn bản."
        >
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function Documents() {
  const user = useMe();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState<string>();
  const [departmentId, setDepartmentId] = useState<string>();
  const [uploading, setUploading] = useState(params.get('tai-len') === '1');
  const [editing, setEditing] = useState<SourceDocument | null>(null);
  const presetNumber = params.get('so') ?? undefined;
  const departments = useDepartments();

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(text.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [text]);

  const list = useApi<SourceDocument[]>(`/documents${query({ search, status, departmentId })}`, { keepPrevious: true });
  const busy = (list.data ?? []).some(item => item.status === 'PROCESSING' || item.status === 'UPLOADED');
  const live = useApi<SourceDocument[]>(busy ? `/documents${query({ search, status, departmentId })}` : null, { refetchInterval: 5000 });
  const rows = live.data ?? list.data ?? [];

  const remove = useAction((item: SourceDocument) => http.delete(`/documents/${item.id}`), { success: 'Đã xoá văn bản', refresh: ['/documents', '/candidates'] });

  async function download(item: SourceDocument) {
    try {
      saveBlob(await http.blob(`/documents/${item.id}/download`), item.originalName);
    } catch (error) {
      message.error(errorText(error, 'Không tải được tệp'));
    }
  }

  return (
    <Page
      title="Kho văn bản"
      meta={list.data && <span>{num(list.data.length)} văn bản</span>}
      extra={
        can(user, WORKING) && (
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setUploading(true)}>
            Tải văn bản lên
          </Button>
        )
      }
      wide
    >
      <Card className="card-flush">
        <div className="table-filters">
          <FilterBar
            active={[status, departmentId].filter(Boolean).length}
            search={<Input allowClear prefix={<SearchOutlined />} placeholder="Trích yếu, số hiệu, mã, tên tệp" value={text} onChange={event => setText(event.target.value)} style={{ width: '100%', maxWidth: 300 }} />}
            filters={
              <>
                <Select allowClear placeholder="Trạng thái" value={status} onChange={setStatus} options={(Object.keys(DOC_STATUS) as DocumentStatus[]).map(key => ({ value: key, label: DOC_STATUS[key].label }))} style={{ width: 160 }} />
                <Select allowClear placeholder="Phòng liên quan" value={departmentId} onChange={setDepartmentId} options={departmentOptions(departments.data, false)} style={{ width: 220 }} popupMatchSelectWidth={false} />
              </>
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
            scroll={{ x: 1100 }}
            pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: total => `${num(total)} văn bản` }}
            onRow={item => ({ onClick: () => navigate(`/admin/documents/${item.id}`), className: 'link-row' })}
            locale={{ emptyText: 'Chưa có văn bản' }}
            columns={[
              {
                title: 'Văn bản',
                key: 'title',
                sorter: (a, b) => a.title.localeCompare(b.title, 'vi'),
                render: (_, item) => <TitleCell title={item.title} sub={[item.code, item.docNumber, item.originalName].filter(Boolean).join(' · ')} to={`/admin/documents/${item.id}`} />,
              },
              { title: 'Loại', dataIndex: 'docType', width: 120, sorter: (a, b) => (documentTypeLabels[a.docType] ?? '').localeCompare(documentTypeLabels[b.docType] ?? '', 'vi'), render: (value: DocumentType) => <Tag>{documentTypeLabels[value] ?? value}</Tag> },
              {
                title: 'Ban hành',
                key: 'issued',
                sorter: (a, b) => (a.issuedDate ?? '').localeCompare(b.issuedDate ?? '') || (a.issuedBy ?? '').localeCompare(b.issuedBy ?? '', 'vi'),
                width: 190,
                render: (_, item) => (
                  <div className="cell-title">
                    <span style={{ color: 'var(--ioc-color-text)', fontSize: 13 }}>{item.issuedBy || '—'}</span>
                    {item.issuedDate && <span>{date(item.issuedDate)}</span>}
                  </div>
                ),
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                sorter: (a, b) => ['FAILED', 'UPLOADED', 'PROCESSING', 'PROCESSED'].indexOf(a.status) - ['FAILED', 'UPLOADED', 'PROCESSING', 'PROCESSED'].indexOf(b.status),
                width: 150,
                render: (value: DocumentStatus, item) => (
                  <Tooltip title={item.processingError || undefined}>
                    <Badge status={DOC_STATUS[value].badge} text={DOC_STATUS[value].label} />
                  </Tooltip>
                ),
              },
              { title: 'Đề xuất', dataIndex: 'candidateCount', width: 108, align: 'center', sorter: (a, b) => a.candidateCount - b.candidateCount, sortDirections: ['descend', 'ascend'], render: value => (value ? <Tag color="purple">{value}</Tag> : <span className="muted">0</span>) },
              {
                title: 'Tải lên',
                key: 'uploaded',
                sorter: (a, b) => a.createdAt.localeCompare(b.createdAt) || a.uploadedBy.fullName.localeCompare(b.uploadedBy.fullName, 'vi'),
                defaultSortOrder: 'descend',
                width: 170,
                render: (_, item) => (
                  <Tooltip title={`${dateTime(item.createdAt)} · ${fileSize(item.size)}`}>
                    <div className="cell-title">
                      <span style={{ color: 'var(--ioc-color-text)', fontSize: 13 }}>{item.uploadedBy.fullName}</span>
                      <span>{fromNow(item.createdAt)}</span>
                    </div>
                  </Tooltip>
                ),
              },
              {
                key: 'actions',
                width: 52,
                fixed: 'right',
                render: (_, item) => (
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'open', icon: <FileSearchOutlined />, label: 'Xác minh trích xuất', onClick: () => navigate(`/admin/documents/${item.id}`) },
                        { key: 'download', icon: <DownloadOutlined />, label: 'Tải tệp gốc', onClick: () => void download(item) },
                        ...(can(user, WORKING) ? [{ key: 'edit', icon: <EditOutlined />, label: 'Sửa thông tin', onClick: () => setEditing(item) }] : []),
                        ...(can(user, ADMINS)
                          ? [
                              { type: 'divider' as const },
                              {
                                key: 'delete',
                                icon: <DeleteOutlined />,
                                danger: true,
                                label: 'Xoá văn bản',
                                onClick: () =>
                                  modal.confirm({
                                    title: `Xoá văn bản ${item.code}?`,
                                    content: 'Văn bản, nội dung đã đọc và các đề xuất chưa duyệt sẽ bị xoá.',
                                    okText: 'Xoá',
                                    okButtonProps: { danger: true },
                                    onOk: () => remove.mutateAsync(item),
                                  }),
                              },
                            ]
                          : []),
                      ],
                      onClick: info => info.domEvent.stopPropagation(),
                    }}
                  >
                    <Button type="text" icon={<MoreOutlined />} onClick={event => event.stopPropagation()} aria-label="Thao tác" />
                  </Dropdown>
                ),
              },
            ]}
          />
        )}
      </Card>
      <EditDocumentModal document={editing} onClose={() => setEditing(null)} />
      <UploadModal
        open={uploading}
        docNumber={presetNumber}
        onClose={() => {
          setUploading(false);
          if (params.has('tai-len')) setParams({}, { replace: true });
        }}
      />
    </Page>
  );
}
