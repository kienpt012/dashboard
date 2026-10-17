import { EditOutlined } from '@ant-design/icons';
import { Avatar, Button, Card, Descriptions, Flex, Form, Input, InputNumber, Modal, Select, Space, Tag, Timeline, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { NoData } from '@/components/States';
import { LegalBasis } from '@/components/LegalBasis';
import { TargetSource } from '@/components/TargetSource';
import { DeptTag } from '@/components/Tags';
import { http } from '@/lib/api';
import { dateTime, fromNow, msUntil, until } from '@/lib/format';
import { initials } from '@/lib/roles';
import type { ExplanationRequest } from '@/types/domain';
import { useDossier, useDossierRun } from './context';

export type PeopleAction = 'assign' | 'transfer' | 'return';

const ACTION_TITLE: Record<PeopleAction, string> = { assign: 'Giao chuyên viên phụ trách', transfer: 'Chuyển cho đồng nghiệp', return: 'Trả về trưởng phòng' };

export function PeopleModal({ action, onClose }: { action: PeopleAction | null; onClose: () => void }) {
  const { d, me } = useDossier();
  const run = useDossierRun();
  const [form] = Form.useForm<{ userId?: string; text?: string }>();
  const [saving, setSaving] = useState(false);
  const candidates = d.staff.filter(person => (action === 'transfer' ? person.id !== me.id : true));
  const transfersLeft = Math.max(0, d.maxTransfers - d.transferCount);

  useEffect(() => {
    if (action) form.setFieldsValue({ userId: action === 'assign' ? d.assignee?.id ?? undefined : undefined, text: '' });
  }, [action, d.assignee?.id, form]);

  async function submit(values: { userId?: string; text?: string }) {
    if (!action) return;
    setSaving(true);
    const body = action === 'assign' ? { assigneeId: values.userId, note: values.text?.trim() || undefined } : action === 'transfer' ? { toUserId: values.userId, reason: values.text?.trim() } : { reason: values.text?.trim() };
    const done = await run(() => http.post(`/targets/${d.id}/${action}`, body), action === 'assign' ? 'Đã giao việc' : action === 'transfer' ? 'Đã chuyển việc' : 'Đã trả về trưởng phòng');
    setSaving(false);
    if (done !== undefined) onClose();
  }

  return (
    <Modal title={action ? ACTION_TITLE[action] : ''} open={Boolean(action)} onCancel={onClose} onOk={() => form.submit()} okText="Xác nhận" confirmLoading={saving} width={520} destroyOnHidden>
      {action === 'transfer' && (
        <Typography.Paragraph type="secondary">Còn {transfersLeft} lượt chuyển. Hết lượt chỉ được trả về trưởng phòng.</Typography.Paragraph>
      )}
      <Form form={form} layout="vertical" requiredMark={false} onFinish={values => void submit(values)}>
        {action !== 'return' && (
          <Form.Item name="userId" label={action === 'assign' ? 'Người phụ trách' : 'Chuyển cho'} rules={[{ required: true, message: 'Chọn người' }]}>
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              notFoundContent="Phòng chưa có cán bộ khác"
              options={candidates.map(person => ({ value: person.id, label: `${person.fullName}${person.position ? ` — ${person.position}` : ''}` }))}
            />
          </Form.Item>
        )}
        <Form.Item
          name="text"
          label={action === 'assign' ? 'Lời nhắn' : 'Lý do'}
          rules={action === 'assign' ? [] : [{ required: true, min: 5, message: 'Ít nhất 5 ký tự' }]}
        >
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function ExplanationRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { d } = useDossier();
  const run = useDossierRun();
  const [form] = Form.useForm<{ message: string; dueDays?: number }>();
  const [saving, setSaving] = useState(false);
  return (
    <Modal title="Yêu cầu giải trình" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Gửi yêu cầu" confirmLoading={saving} width={560} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
       
        onFinish={async values => {
          setSaving(true);
          const done = await run(() => http.post(`/targets/${d.id}/explanations`, { message: values.message.trim(), dueDays: values.dueDays ?? undefined }), 'Đã gửi yêu cầu giải trình');
          setSaving(false);
          if (done !== undefined) {
            form.resetFields();
            onClose();
          }
        }}
      >
        <Form.Item name="message" label="Nội dung yêu cầu" rules={[{ required: true, min: 5, message: 'Ít nhất 5 ký tự' }]}>
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={1000} showCount />
        </Form.Item>
        <Form.Item name="dueDays" label="Thời hạn trả lời (ngày)" extra="Để trống theo cấu hình hệ thống">
          <InputNumber min={1} max={30} style={{ width: 160 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function RespondModal({ request, onClose }: { request: ExplanationRequest | null; onClose: () => void }) {
  const { d } = useDossier();
  const run = useDossierRun();
  const [form] = Form.useForm<{ response: string }>();
  const [saving, setSaving] = useState(false);
  return (
    <Modal title="Trả lời giải trình" open={Boolean(request)} onCancel={onClose} onOk={() => form.submit()} okText="Gửi giải trình" confirmLoading={saving} width={600} destroyOnHidden>
      {request && (
        <div className="quote" style={{ marginBottom: 16 }}>
          {request.message}
        </div>
      )}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={async values => {
          if (!request) return;
          setSaving(true);
          const done = await run(() => http.post(`/targets/${d.id}/explanations/${request.id}/respond`, { response: values.response.trim(), expectedVersion: request.version }), 'Đã gửi giải trình');
          setSaving(false);
          if (done !== undefined) onClose();
        }}
      >
        <Form.Item name="response" label="Nội dung giải trình" rules={[{ required: true, min: 10, message: 'Ít nhất 10 ký tự' }]}>
          <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} maxLength={4000} showCount placeholder="Nguyên nhân, việc đã làm, lộ trình đạt chỉ tiêu" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function SourceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { d } = useDossier();
  const run = useDossierRun();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open)
      form.setFieldsValue({
        dataSourceSystem: d.dataSourceSystem ?? '',
        dataSourceAgency: d.dataSourceAgency ?? '',
        collectionGuide: d.collectionGuide ?? '',
        dataSourceUrl: d.dataSourceUrl ?? '',
        evidenceRequirement: d.evidenceRequirement ?? '',
        reportDueDay: d.reportDueDay ?? undefined,
      });
  }, [open, d, form]);
  return (
    <Modal title="Nguồn số liệu" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" confirmLoading={saving} width={640} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        onFinish={async values => {
          setSaving(true);
          const done = await run(() => http.patch(`/targets/${d.id}/source-card`, { ...values, reportDueDay: values.reportDueDay ?? null, expectedVersion: d.version }), 'Đã lưu nguồn số liệu');
          setSaving(false);
          if (done !== undefined) onClose();
        }}
        className="form-grid"
      >
        <Form.Item name="dataSourceSystem" label="Hệ thống / nguồn số liệu">
          <Input maxLength={500} />
        </Form.Item>
        <Form.Item name="dataSourceAgency" label="Cơ quan, bộ phận cung cấp">
          <Input maxLength={500} />
        </Form.Item>
        <Form.Item name="collectionGuide" label="Cách lấy số liệu" className="span-2">
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={4000} />
        </Form.Item>
        <Form.Item name="dataSourceUrl" label="Đường dẫn tra cứu" className="span-2">
          <Input maxLength={1000} />
        </Form.Item>
        <Form.Item name="evidenceRequirement" label="Yêu cầu minh chứng" className="span-2">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={1000} />
        </Form.Item>
        <Form.Item name="reportDueDay" label="Hạn báo cáo (ngày trong tháng cuối kỳ)">
          <InputNumber min={1} max={31} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function ResponsibilityCard({ onAction }: { onAction: (action: PeopleAction) => void }) {
  const { d, me } = useDossier();
  const p = d.permissions;
  return (
    <Card title="Trách nhiệm" size="small" className="side-card">
      <Flex gap={12} align="center" className="person">
        {d.assignee ? (
          <>
            <Avatar size={40} className="user-avatar">
              {initials(d.assignee.fullName)}
            </Avatar>
            <div>
              <Typography.Text strong>
                {d.assignee.fullName}
                {d.assignee.id === me.id ? ' (bạn)' : ''}
              </Typography.Text>
              <div className="muted" style={{ fontSize: 12 }}>
                {d.assignee.position || 'Chuyên viên phụ trách'}
                {d.assignedAt ? ` · giao ${fromNow(d.assignedAt)}` : ''}
              </div>
            </div>
          </>
        ) : (
          <Typography.Text type="warning" strong>
            Chưa giao người phụ trách
          </Typography.Text>
        )}
      </Flex>
      <Descriptions
        size="small"
        column={1}
        className="side-desc" colon={false}
        items={[
          { label: 'Phòng chủ trì', children: <DeptTag name={d.department.name} color={d.department.color} /> },
          ...(d.managers.length
            ? [
                {
                  label: 'Trưởng phòng',
                  children: d.managers.map(manager => manager.fullName).join(', '),
                },
              ]
            : []),
          ...(d.coordinators.length ? [{ label: 'Phối hợp', children: d.coordinators.map(item => item.department.name).join(', ') }] : []),
          ...(d.transferCount || d.bounceCount
            ? [
                {
                  label: 'Chuyển / trả',
                  children: (
                    <Space size={6} wrap>
                      <span>
                        Chuyển {d.transferCount}/{d.maxTransfers} · qua lại {d.bounceCount} lần
                      </span>
                      {d.bounceCount >= 3 && <Tag color="red">Bị treo</Tag>}
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />
      {(p.canAssign || p.canTransfer || p.canReturn) && !d.isArchived && (
        <Flex gap={8} wrap style={{ marginTop: 12 }}>
          {p.canAssign && (
            <Button size="small" type="primary" onClick={() => onAction('assign')}>
              {d.assignee ? 'Giao lại' : 'Giao chuyên viên'}
            </Button>
          )}
          {p.canTransfer && (
            <Button size="small" onClick={() => onAction('transfer')}>
              Chuyển đồng nghiệp
            </Button>
          )}
          {p.canReturn && (
            <Button size="small" onClick={() => onAction('return')}>
              Trả về trưởng phòng
            </Button>
          )}
        </Flex>
      )}
    </Card>
  );
}

export function ExplanationsCard({ onRequest }: { onRequest: () => void }) {
  const { d } = useDossier();
  const [responding, setResponding] = useState<ExplanationRequest | null>(null);
  const open = d.explanationRequests.find(item => item.status === 'OPEN');
  if (!d.explanationRequests.length && !d.permissions.canRequestExplanation) return null;
  return (
    <Card
      title="Giải trình"
      size="small"
      className={`side-card${open ? ' side-card-warn' : ''}`}
      extra={
        d.permissions.canRequestExplanation &&
        !open &&
        !d.isArchived && (
          <Button size="small" type="link" onClick={onRequest}>
            Yêu cầu
          </Button>
        )
      }
    >
      {d.explanationRequests.length ? (
        <Flex vertical gap={12}>
          {d.explanationRequests.map(item => {
            const late = item.status === 'OPEN' && msUntil(item.dueAt) < 0;
            return (
              <div key={item.id} className="explain">
                <Flex justify="space-between" align="center" gap={8}>
                  <Tag color={item.status === 'OPEN' ? (late ? 'red' : 'gold') : item.status === 'ANSWERED' ? 'green' : 'default'}>
                    {item.status === 'OPEN' ? (late ? 'Quá hạn trả lời' : 'Chờ trả lời') : item.status === 'ANSWERED' ? 'Đã giải trình' : 'Đã huỷ'}
                  </Tag>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {item.status === 'OPEN' ? until(item.dueAt) : `Hạn ${dateTime(item.dueAt)}`}
                  </span>
                </Flex>
                <div className="explain-text">{item.message}</div>
                <div className="entry-meta">
                  {item.requestedBy.fullName}
                  {item.requestedBy.position ? ` (${item.requestedBy.position})` : ''} · {dateTime(item.createdAt)}
                </div>
                {item.response && (
                  <div className="quote" style={{ marginTop: 8 }}>
                    <b>{item.responderName ?? 'Phòng chủ trì'}:</b> {item.response}
                    {item.respondedAt && <div className="entry-meta">{dateTime(item.respondedAt)}</div>}
                  </div>
                )}
                {item.status === 'OPEN' && d.permissions.canRespondExplanation && (
                  <Button size="small" type="primary" style={{ marginTop: 8 }} onClick={() => setResponding(item)}>
                    Trả lời
                  </Button>
                )}
              </div>
            );
          })}
        </Flex>
      ) : (
        <Typography.Text type="secondary">Chưa có yêu cầu giải trình</Typography.Text>
      )}
      <RespondModal request={responding} onClose={() => setResponding(null)} />
    </Card>
  );
}

export function SourceCard() {
  const { d } = useDossier();
  const [editing, setEditing] = useState(false);
  const rows = [
    { label: 'Hệ thống / nguồn', value: d.dataSourceSystem },
    { label: 'Cơ quan cung cấp', value: d.dataSourceAgency },
    { label: 'Cách lấy số liệu', value: d.collectionGuide },
    {
      label: 'Tra cứu',
      value: d.dataSourceUrl ? (
        /^https?:\/\//i.test(d.dataSourceUrl) ? (
          <a href={d.dataSourceUrl} target="_blank" rel="noopener noreferrer" className="break-all">
            {d.dataSourceUrl}
          </a>
        ) : (
          d.dataSourceUrl
        )
      ) : null,
    },
    { label: 'Yêu cầu minh chứng', value: d.evidenceRequirement },
    { label: 'Hạn báo cáo', value: `Ngày ${d.reportDueDay ?? 20} tháng cuối kỳ` },
  ].filter(row => row.value);
  return (
    <Card
      title="Nguồn số liệu"
      size="small"
      className="side-card"
      extra={
        d.permissions.canEditSourceCard &&
        !d.isArchived && (
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => setEditing(true)}>
            Sửa
          </Button>
        )
      }
    >
      <Descriptions size="small" column={1} className="side-desc" colon={false} items={rows.map(row => ({ label: row.label, children: <span className="pre-line">{row.value}</span> }))} />
      <SourceModal open={editing} onClose={() => setEditing(false)} />
    </Card>
  );
}

export function BasisCard() {
  const { d } = useDossier();
  const legal = d.legalBasis || d.framework?.legalBasis;
  return (
    <Card title="Căn cứ" size="small" className="side-card">
      <Descriptions
        size="small"
        column={1}
        className="side-desc" colon={false}
        items={[
          { label: 'Văn bản giao', children: <TargetSource targetId={d.id} targetTitle={d.title} canEdit={d.permissions.canEditSourceCard && !d.isArchived} /> },
          ...(legal ? [{ label: 'Căn cứ pháp lý', children: <LegalBasis text={legal} /> }] : []),
          ...(d.scoringRule ? [{ label: 'Thang chấm', children: <span className="pre-line">{d.scoringRule}</span> }] : []),
          ...(d.description ? [{ label: 'Mô tả', children: <span className="pre-line">{d.description}</span> }] : []),
        ]}
      />
    </Card>
  );
}

export function TimelineTab() {
  const { d } = useDossier();
  if (!d.workEvents.length) return <NoData text="Chưa có hoạt động" />;
  return (
    <div className="tab-body">
      <Timeline
        items={d.workEvents.map(event => ({
          key: event.id,
          content: (
            <div className="timeline-item">
              <span>
                <b>{event.actorName}</b> <span className="secondary">{event.label.toLocaleLowerCase('vi')}</span>
              </span>
              {event.note && <div className="secondary pre-line">{event.note}</div>}
              <div className="entry-meta">{dateTime(event.createdAt)}</div>
            </div>
          ),
        }))}
      />
    </div>
  );
}
