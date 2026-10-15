import { CheckOutlined, CloseOutlined, EditOutlined, PlusOutlined, RobotOutlined, SearchOutlined, SendOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, DatePicker, Descriptions, Drawer, Flex, Form, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMe } from '@/app/session';
import { TitleCell } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { ReasonModal } from '@/components/ReasonModal';
import { LoadError } from '@/components/States';
import { KindTag } from '@/components/Tags';
import { useAction, useApi } from '@/hooks/useApi';
import { departmentOptions, frameworkOptions, useDepartments, useFrameworks } from '@/hooks/useRefs';
import { http, query } from '@/lib/api';
import { currentYear, date, dateTime, fromNow, msUntil, num, pct, until } from '@/lib/format';
import { frequencyLabel } from '@/lib/periods';
import { can, isGlobal, WORKING } from '@/lib/roles';
import type { FrameworkKind, Frequency, IssuingLevel, Proposal as BaseProposal } from '@/types/domain';
import { DIRECTION_OPTIONS, FREQUENCY_OPTIONS, KIND_OPTIONS } from '../targets/TargetForm';

export type Proposal = BaseProposal & { targetKind?: FrameworkKind; issuingLevel?: IssuingLevel | null; standardCode?: string | null };

const STATUS: Record<Proposal['status'], { label: string; color: string }> = {
  PROPOSED: { label: 'Chưa trình', color: 'default' },
  SUBMITTED: { label: 'Chờ duyệt', color: 'gold' },
  APPROVED: { label: 'Đã duyệt', color: 'green' },
  REJECTED: { label: 'Từ chối', color: 'red' },
};

const ISSUING_OPTIONS = [
  { value: 'CENTRAL', label: 'Trung ương giao' },
  { value: 'PROVINCE', label: 'Tỉnh/Thành phố giao' },
  { value: 'LOCAL', label: 'Địa phương tự đặt' },
];

const DAY = 86_400_000;

function targetOf(item: Proposal) {
  if (item.targetText) return item.targetText;
  if (item.targetValue !== null && item.targetValue !== undefined) return `${num(item.targetValue)}${item.unit ? ` ${item.unit}` : ''}`;
  return '—';
}

type FormValues = {
  name: string;
  description?: string;
  targetKind: FrameworkKind;
  frameworkId?: string;
  unit?: string;
  targetValue?: number | null;
  targetText?: string;
  targetYear?: number;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  frequency?: Frequency;
  deadline?: Dayjs | null;
  responsibleDepartmentId?: string;
  issuingLevel?: IssuingLevel;
  standardCode?: string;
  legalBasis?: string;
  sourceQuote?: string;
};

export function ProposalForm({ open, item, onClose }: { open: boolean; item?: Proposal | null; onClose: () => void }) {
  const user = useMe();
  const [form] = Form.useForm<FormValues>();
  const departments = useDepartments();
  const frameworks = useFrameworks();
  const [submitMode, setSubmitMode] = useState(false);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (item) {
      form.setFieldsValue({
        name: item.name,
        description: item.description ?? '',
        targetKind: item.targetKind ?? 'PLAN',
        frameworkId: item.frameworkId ?? undefined,
        unit: item.unit ?? '',
        targetValue: item.targetValue ?? undefined,
        targetText: item.targetText ?? '',
        targetYear: item.targetYear ?? undefined,
        direction: item.direction ?? 'HIGHER_IS_BETTER',
        frequency: item.frequency ?? undefined,
        deadline: item.deadline ? dayjs(item.deadline) : undefined,
        responsibleDepartmentId: item.responsibleDepartmentId ?? undefined,
        issuingLevel: item.issuingLevel ?? undefined,
        standardCode: item.standardCode ?? '',
        legalBasis: item.legalBasis ?? '',
      });
    } else {
      const year = currentYear();
      form.setFieldsValue({
        targetKind: 'PLAN',
        direction: 'HIGHER_IS_BETTER',
        targetYear: year,
        frequency: 'YEARLY',
        deadline: dayjs(`${year}-12-31`),
        responsibleDepartmentId: isGlobal(user) ? undefined : user.departmentId ?? undefined,
      });
    }
  }, [open, item, form, user]);

  const save = useAction(
    async ({ values, submit }: { values: FormValues; submit: boolean }) => {
      const body = {
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        unit: values.unit?.trim() || undefined,
        targetValue: typeof values.targetValue === 'number' ? values.targetValue : undefined,
        targetText: values.targetText?.trim() || undefined,
        targetYear: values.targetYear ?? undefined,
        frequency: values.frequency ?? undefined,
        deadline: values.deadline ? values.deadline.format('YYYY-MM-DD') : undefined,
        direction: values.direction,
        responsibleDepartmentId: values.responsibleDepartmentId || undefined,
        frameworkId: values.frameworkId || undefined,
        targetKind: values.targetKind,
        issuingLevel: values.issuingLevel || undefined,
        standardCode: values.standardCode?.trim() || undefined,
        legalBasis: values.legalBasis?.trim() || undefined,
      };
      if (item) {
        await http.patch(`/candidates/${item.id}`, { ...body, expectedVersion: item.version });
        if (submit && item.status === 'PROPOSED') {
          const fresh = await http.get<Proposal>(`/candidates/${item.id}`);
          await http.post(`/candidates/${item.id}/submit`, { expectedVersion: fresh.version });
        }
        return;
      }
      await http.post('/candidates', { ...body, sourceQuote: values.sourceQuote?.trim() || undefined, submit });
    },
    {
      success: () => (submitMode ? 'Đã trình đề xuất' : 'Đã lưu đề xuất'),
      refresh: ['/candidates', '/my-work', '/ioc'],
      onDone: onClose,
    },
  );

  const canSubmit = !item || item.status === 'PROPOSED';

  return (
    <Modal
      title={item ? 'Sửa đề xuất' : 'Đề xuất chỉ tiêu mới'}
      open={open}
      onCancel={onClose}
      width={760}
      destroyOnHidden
      mask={{ closable: false }}
      footer={
        <Space>
          <Button onClick={onClose}>Huỷ</Button>
          <Button
            loading={save.isPending && !submitMode}
            onClick={() => {
              setSubmitMode(false);
              form.validateFields().then(values => save.mutate({ values, submit: false }));
            }}
          >
            Lưu
          </Button>
          {canSubmit && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={save.isPending && submitMode}
              onClick={() => {
                setSubmitMode(true);
                form.validateFields().then(values => save.mutate({ values, submit: true }));
              }}
            >
              Lưu và trình
            </Button>
          )}
        </Space>
      }
    >
      <Form form={form} layout="vertical" requiredMark="optional" className="form-grid">
        <Form.Item name="name" label="Tên chỉ tiêu" className="span-2" rules={[{ required: true, min: 3, max: 300, message: '3–300 ký tự' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="description" label="Mô tả" className="span-2">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} maxLength={1000} />
        </Form.Item>
        <Form.Item name="targetKind" label="Loại">
          <Select options={KIND_OPTIONS} />
        </Form.Item>
        <Form.Item name="frameworkId" label="Bộ chỉ tiêu">
          <Select allowClear options={frameworkOptions(frameworks.data)} showSearch={{ optionFilterProp: 'label' }} />
        </Form.Item>
        <Form.Item name="targetValue" label="Giá trị mục tiêu">
          <InputNumber min={0} style={{ width: '100%' }} decimalSeparator="," />
        </Form.Item>
        <Form.Item name="unit" label="Đơn vị tính">
          <Input maxLength={50} />
        </Form.Item>
        <Form.Item name="targetText" label="Mục tiêu ghi bằng chữ">
          <Input maxLength={300} />
        </Form.Item>
        <Form.Item name="direction" label="Chiều đánh giá">
          <Select options={DIRECTION_OPTIONS} />
        </Form.Item>
        <Form.Item name="targetYear" label="Năm">
          <InputNumber min={2000} max={2100} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="frequency" label="Kỳ báo cáo">
          <Select allowClear options={FREQUENCY_OPTIONS} />
        </Form.Item>
        <Form.Item name="deadline" label="Hạn hoàn thành">
          <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="responsibleDepartmentId" label="Phòng chủ trì">
          <Select allowClear options={departmentOptions(departments.data)} showSearch={{ optionFilterProp: 'label' }} />
        </Form.Item>
        <Form.Item name="issuingLevel" label="Cấp giao">
          <Select allowClear options={ISSUING_OPTIONS} />
        </Form.Item>
        <Form.Item name="standardCode" label="Mã theo văn bản">
          <Input maxLength={40} />
        </Form.Item>
        <Form.Item name="legalBasis" label="Căn cứ" className="span-2">
          <Input maxLength={200} />
        </Form.Item>
        {!item && (
          <Form.Item name="sourceQuote" label="Trích dẫn nguồn" className="span-2">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

export function ApproveModal({ item, onClose }: { item: Proposal | null; onClose: () => void }) {
  const { modal } = App.useApp();
  const [weight, setWeight] = useState<number | null>(1);
  const approve = useAction((target: Proposal) => http.post<{ target?: { id: string; code: string } }>(`/candidates/${target.id}/approve`, { expectedVersion: target.version, weight: weight ?? undefined }), {
    refresh: ['/candidates', '/targets', '/my-work', '/ioc', '/frameworks'],
    onDone: result => {
      onClose();
      if (result?.target)
        modal.success({
          title: `Đã tạo chỉ tiêu ${result.target.code}`,
          content: <Link to={`/admin/targets/${result.target.id}`}>Mở hồ sơ chỉ tiêu</Link>,
        });
    },
  });
  return (
    <Modal title="Duyệt thành chỉ tiêu" open={Boolean(item)} onCancel={onClose} onOk={() => item && approve.mutate(item)} okText="Duyệt" confirmLoading={approve.isPending} width={480} destroyOnHidden>
      {item && (
        <Flex vertical gap={16}>
          <Typography.Text strong>{item.name}</Typography.Text>
          <div>
            <Typography.Text type="secondary">Trọng số</Typography.Text>
            <InputNumber min={0.1} max={10} step={0.1} value={weight} onChange={setWeight} style={{ width: '100%', marginTop: 4 }} decimalSeparator="," />
          </div>
        </Flex>
      )}
    </Modal>
  );
}

function ProposalDrawer({ item, onClose, onEdit, onApprove, onReject }: { item: Proposal | null; onClose: () => void; onEdit: () => void; onApprove: () => void; onReject: () => void }) {
  const submit = useAction((target: Proposal) => http.post(`/candidates/${target.id}/submit`, { expectedVersion: target.version }), {
    success: 'Đã trình đề xuất',
    refresh: ['/candidates', '/my-work'],
  });
  if (!item) return null;
  const actions = item.canEdit || item.canDecide;
  return (
    <Drawer
      title="Đề xuất chỉ tiêu"
      open={Boolean(item)}
      onClose={onClose}
      size={620}
      footer={
        actions && (
          <Flex gap={8} justify="flex-end" wrap>
            {item.canEdit && (
              <Button icon={<EditOutlined />} onClick={onEdit}>
                Sửa
              </Button>
            )}
            {item.canEdit && item.status === 'PROPOSED' && (
              <Button icon={<SendOutlined />} loading={submit.isPending} onClick={() => submit.mutate(item)}>
                Trình lãnh đạo
              </Button>
            )}
            {item.canDecide && (
              <Button danger icon={<CloseOutlined />} onClick={onReject}>
                Từ chối
              </Button>
            )}
            {item.canDecide && (
              <Button type="primary" icon={<CheckOutlined />} onClick={onApprove}>
                Duyệt thành chỉ tiêu
              </Button>
            )}
          </Flex>
        )
      }
    >
      <Flex vertical gap={16}>
        <div>
          <Space size={6} wrap style={{ marginBottom: 6 }}>
            <Tag color={STATUS[item.status].color}>{STATUS[item.status].label}</Tag>
            {item.origin === 'AI' ? (
              <Tag icon={<RobotOutlined />} color="purple">
                AI trích xuất · tin cậy {pct(item.confidence * 100)}
              </Tag>
            ) : (
              <Tag>Cán bộ đề xuất</Tag>
            )}
            {item.targetKind && <KindTag kind={item.targetKind} />}
          </Space>
          <Typography.Title level={5} style={{ margin: 0 }}>
            {item.name}
          </Typography.Title>
        </div>
        {item.isDuplicateSuspect && <Alert type="warning" showIcon icon={<WarningOutlined />} title="Có thể trùng với chỉ tiêu đã có" />}
        {item.status === 'SUBMITTED' && item.autoApproveAt && (
          <Alert type={msUntil(item.autoApproveAt) <= DAY ? 'error' : 'info'} showIcon title={`Tự thông qua ${until(item.autoApproveAt)} (${dateTime(item.autoApproveAt)})`} />
        )}
        <Descriptions
          size="small"
          column={1}
          bordered
          items={[
            { label: 'Mục tiêu', children: targetOf(item) },
            { label: 'Năm', children: item.targetYear ?? '—' },
            { label: 'Kỳ báo cáo', children: item.frequency ? frequencyLabel[item.frequency] : '—' },
            { label: 'Hạn', children: item.deadline ? date(item.deadline) : '—' },
            { label: 'Phòng chủ trì', children: item.responsibleDepartment?.name ?? item.responsibleDepartmentName ?? '—' },
            { label: 'Bộ chỉ tiêu', children: item.framework?.name ?? '—' },
            { label: 'Căn cứ', children: item.legalBasis ?? '—' },
            ...(item.description ? [{ label: 'Mô tả', children: <span className="pre-line">{item.description}</span> }] : []),
            ...(item.document
              ? [
                  {
                    label: 'Văn bản nguồn',
                    children: <Link to={`/admin/documents/${item.document.id}`}>{item.document.docNumber || item.document.code} — {item.document.title}</Link>,
                  },
                ]
              : []),
            { label: 'Người đề xuất', children: `${item.origin === 'AI' ? 'AI trích xuất' : item.proposedByName ?? '—'} · ${dateTime(item.createdAt)}` },
            ...(item.submittedAt ? [{ label: 'Trình lúc', children: dateTime(item.submittedAt) }] : []),
            ...(item.reviewedAt
              ? [{ label: item.status === 'REJECTED' ? 'Từ chối' : 'Duyệt', children: `${item.autoApproved ? 'Hệ thống tự thông qua' : item.reviewedBy?.fullName ?? '—'} · ${dateTime(item.reviewedAt)}` }]
              : []),
            ...(item.reviewNote ? [{ label: 'Ghi chú', children: <span className="tone-bad">{item.reviewNote}</span> }] : []),
            ...(item.createdTarget ? [{ label: 'Chỉ tiêu đã tạo', children: <Link to={`/admin/targets/${item.createdTarget.id}`}>{item.createdTarget.code}</Link> }] : []),
          ]}
        />
        {item.sourceQuote && (
          <div>
            <Typography.Text type="secondary">Trích dẫn nguồn</Typography.Text>
            <div className="quote" style={{ marginTop: 6 }}>
              {item.sourceQuote}
            </div>
          </div>
        )}
      </Flex>
    </Drawer>
  );
}

export default function Proposals() {
  const user = useMe();
  const global = isGlobal(user);
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? 'OPEN';
  const origin = params.get('origin') ?? '';
  const departmentId = params.get('departmentId') ?? '';
  const selectedId = params.get('id');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<Proposal | null | undefined>(undefined);
  const [approving, setApproving] = useState<Proposal | null>(null);
  const [rejecting, setRejecting] = useState<Proposal | null>(null);
  const departments = useDepartments();
  const list = useApi<Proposal[]>(`/candidates${query({ origin: origin || undefined, departmentId: global ? departmentId || undefined : undefined })}`, { keepPrevious: true });

  function update(next: Record<string, string | null>) {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    setParams(copy, { replace: true });
  }

  const counts = useMemo(() => {
    const result: Record<string, number> = { OPEN: 0, PROPOSED: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0, ALL: 0 };
    for (const item of list.data ?? []) {
      result[item.status] += 1;
      result.ALL += 1;
      if (item.status === 'PROPOSED' || item.status === 'SUBMITTED') result.OPEN += 1;
    }
    return result;
  }, [list.data]);

  const rows = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase('vi');
    return (list.data ?? []).filter(item => {
      if (status === 'OPEN' && item.status !== 'PROPOSED' && item.status !== 'SUBMITTED') return false;
      if (status !== 'OPEN' && status !== 'ALL' && item.status !== status) return false;
      return !needle || `${item.name} ${item.document?.code ?? ''} ${item.legalBasis ?? ''}`.toLocaleLowerCase('vi').includes(needle);
    });
  }, [list.data, status, text]);

  const selected = (list.data ?? []).find(item => item.id === selectedId) ?? null;
  const missing = Boolean(selectedId && list.data && !selected);
  const single = useApi<Proposal>(missing ? `/candidates/${selectedId}` : null);
  const drawerItem = selected ?? (missing ? single.data ?? null : null);

  const reject = useAction(({ item, reason }: { item: Proposal; reason: string }) => http.post(`/candidates/${item.id}/reject`, { expectedVersion: item.version, reason }), {
    success: 'Đã từ chối đề xuất',
    refresh: ['/candidates', '/my-work', '/ioc'],
    onDone: () => setRejecting(null),
  });

  return (
    <Page
      title="Đề xuất chỉ tiêu"
      meta={list.data && <span>{num(counts.OPEN)} đang chờ xử lý · {num(counts.ALL)} đề xuất</span>}
      extra={
        can(user, WORKING) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>
            Đề xuất mới
          </Button>
        )
      }
      wide
    >
      <Card className="card-flush">
        <div className="table-filters">
          <FilterBar
            active={[origin, departmentId].filter(Boolean).length}
            search={<Input allowClear prefix={<SearchOutlined />} placeholder="Tên đề xuất, văn bản" value={text} onChange={event => setText(event.target.value)} style={{ width: '100%', maxWidth: 280 }} />}
            filters={
              <>
                <Segmented
                  value={status}
                  onChange={value => update({ status: value === 'OPEN' ? null : String(value) })}
                  options={[
                    { value: 'OPEN', label: `Đang xử lý ${counts.OPEN}` },
                    { value: 'APPROVED', label: `Đã duyệt ${counts.APPROVED}` },
                    { value: 'REJECTED', label: `Từ chối ${counts.REJECTED}` },
                    { value: 'ALL', label: 'Tất cả' },
                  ]}
                />
                <Select
                  allowClear
                  placeholder="Nguồn"
                  value={origin || undefined}
                  onChange={value => update({ origin: value ?? null })}
                  options={[
                    { value: 'AI', label: 'AI trích xuất' },
                    { value: 'HUMAN', label: 'Cán bộ đề xuất' },
                  ]}
                  style={{ width: 160 }}
                />
                {global && (
                  <Select allowClear placeholder="Phòng chủ trì" value={departmentId || undefined} onChange={value => update({ departmentId: value ?? null })} options={departmentOptions(departments.data, false)} style={{ width: 210 }} popupMatchSelectWidth={false} />
                )}
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
            scroll={{ x: 1000 }}
            pagination={{ defaultPageSize: 20, showSizeChanger: true, showTotal: total => `${num(total)} đề xuất` }}
            onRow={item => ({ onClick: () => update({ id: item.id }), className: 'link-row' })}
            locale={{ emptyText: 'Không có đề xuất' }}
            columns={[
              {
                title: 'Đề xuất',
                key: 'name',
                render: (_, item) => (
                  <TitleCell
                    title={
                      <Space size={6}>
                        {item.name}
                        {item.isDuplicateSuspect && (
                          <Tooltip title="Có thể trùng chỉ tiêu đã có">
                            <WarningOutlined className="tone-warn" />
                          </Tooltip>
                        )}
                      </Space>
                    }
                    sub={[item.document ? item.document.docNumber || item.document.code : null, item.legalBasis, item.framework?.name].filter(Boolean).join(' · ') || undefined}
                  />
                ),
              },
              {
                title: 'Nguồn',
                key: 'origin',
                width: 170,
                render: (_, item) =>
                  item.origin === 'AI' ? (
                    <Tooltip title={`Độ tin cậy ${pct(item.confidence * 100)}`}>
                      <Tag icon={<RobotOutlined />} color="purple">
                        AI · {pct(item.confidence * 100)}
                      </Tag>
                    </Tooltip>
                  ) : (
                    <span className="secondary">{item.proposedByName ?? 'Cán bộ'}</span>
                  ),
              },
              { title: 'Mục tiêu', key: 'target', width: 170, render: (_, item) => <span className="num">{targetOf(item)}</span> },
              { title: 'Phòng chủ trì', key: 'dept', width: 200, render: (_, item) => item.responsibleDepartment?.name ?? item.responsibleDepartmentName ?? <span className="muted">—</span> },
              {
                title: 'Trạng thái',
                key: 'status',
                width: 170,
                render: (_, item) => (
                  <Flex vertical gap={2} align="flex-start">
                    <Tag color={STATUS[item.status].color}>{item.autoApproved ? 'Tự thông qua' : STATUS[item.status].label}</Tag>
                    {item.status === 'SUBMITTED' && item.autoApproveAt && (
                      <span className={`entry-meta${msUntil(item.autoApproveAt) <= DAY ? ' tone-bad' : ''}`}>Tự thông qua {until(item.autoApproveAt)}</span>
                    )}
                  </Flex>
                ),
              },
              { title: 'Tạo', dataIndex: 'createdAt', width: 120, render: value => <Tooltip title={dateTime(value)}>{fromNow(value)}</Tooltip> },
            ]}
          />
        )}
      </Card>

      <ProposalDrawer
        item={drawerItem}
        onClose={() => update({ id: null })}
        onEdit={() => setEditing(drawerItem)}
        onApprove={() => setApproving(drawerItem)}
        onReject={() => setRejecting(drawerItem)}
      />
      <ProposalForm open={editing !== undefined} item={editing} onClose={() => setEditing(undefined)} />
      <ApproveModal item={approving} onClose={() => setApproving(null)} />
      <ReasonModal
        open={Boolean(rejecting)}
        title="Từ chối đề xuất"
        label="Lý do từ chối"
        okText="Từ chối"
        danger
        max={500}
        loading={reject.isPending}
        onCancel={() => setRejecting(null)}
        onSubmit={reason => rejecting && reject.mutate({ item: rejecting, reason })}
      />
    </Page>
  );
}
