import { EyeOutlined, LockOutlined, PaperClipOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Alert, App, Button, Card, Checkbox, DatePicker, Descriptions, Drawer, Empty, Flex, Form, Input, Modal, Segmented, Select, Space, Table, Tabs, Tag, Timeline, Tooltip, Typography } from 'antd';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMe } from '@/app/session';
import { Metric, TitleCell } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { LoadError, PageSkeleton } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { errorText, http, query, saveBlob } from '@/lib/api';
import { dateTime, fileSize, fromNow, msUntil, num, until } from '@/lib/format';
import { can, isGlobal, LEADERSHIP } from '@/lib/roles';
import type { Feedback, FeedbackListResponse, FeedbackStats, User } from '@/types/core';
import { FEEDBACK_CATEGORY, FEEDBACK_EVENT, FEEDBACK_PRIORITY, FEEDBACK_STATUS, options } from './labels';

type Action = 'triage' | 'assign' | 'start' | 'request' | 'contact' | 'message' | 'submit' | 'approve' | 'return' | 'close' | 'closeNoResponse' | 'reject' | 'reopen' | 'rejectReopen' | 'publish' | 'unpublish';

const ACTION_TITLE: Record<Action, string> = {
  triage: 'Phân loại phản ánh',
  assign: 'Phân công xử lý',
  start: 'Bắt đầu xử lý',
  request: 'Yêu cầu bổ sung thông tin',
  contact: 'Ghi nhận lần liên hệ',
  message: 'Thêm trao đổi',
  submit: 'Trình duyệt kết quả',
  approve: 'Duyệt kết quả',
  return: 'Trả lại để hoàn thiện',
  close: 'Đóng hồ sơ',
  closeNoResponse: 'Kết thúc do quá hạn bổ sung',
  reject: 'Không tiếp nhận',
  reopen: 'Mở lại hồ sơ',
  rejectReopen: 'Từ chối đề nghị xem xét lại',
  publish: 'Công khai kết quả',
  unpublish: 'Gỡ công khai',
};

const DONE = ['RESOLVED', 'CLOSED', 'REJECTED'];

function deadline(item: Feedback) {
  return item.status === 'WAITING_CITIZEN' ? item.citizenResponseDueAt || item.dueAt : item.firstResponseAt ? item.dueAt : item.firstResponseDueAt || item.dueAt;
}

function overdue(item: Feedback) {
  const at = deadline(item);
  return Boolean(at && msUntil(at) < 0 && !DONE.includes(item.status));
}

function ActionModal({ item, action, onClose }: { item: Feedback; action: Action | null; onClose: () => void }) {
  const user = useMe();
  const [form] = Form.useForm();
  const departments = useDepartments();
  const departmentId = Form.useWatch('departmentId', form);
  const assignees = useApi<Pick<User, 'id' | 'fullName' | 'departmentId'>[]>(action === 'assign' && departmentId ? `/feedbacks/assignees?departmentId=${departmentId}` : null);
  const preview = useApi<{ title: string; content: string; resolutionSummary: string | null; messages: { body: string; authorName: string; createdAt: string }[] }>(action === 'publish' ? `/feedbacks/${item.id}/publication-preview` : null);
  const canPublic = ['IN_PROGRESS', 'WAITING_CITIZEN', 'REOPENED'].includes(item.status);

  useEffect(() => {
    if (!action) return;
    form.resetFields();
    form.setFieldsValue({
      departmentId: item.departmentId ?? user.departmentId ?? undefined,
      assignedToId: item.assignedToId ?? undefined,
      category: item.category,
      priority: item.priority,
      dueAt: item.dueAt ? dayjs(item.dueAt) : undefined,
      visibility: canPublic ? 'PUBLIC' : 'INTERNAL',
      channel: item.preferredContact,
      outcome: 'REACHED',
    });
  }, [action, item, form, user.departmentId, canPublic]);

  const run = useAction(
    (values: Record<string, unknown>) => {
      const base = { expectedVersion: item.version };
      const text = (key: string) => (typeof values[key] === 'string' ? (values[key] as string).trim() : undefined);
      const map: Record<Action, [string, Record<string, unknown>]> = {
        triage: ['triage', { category: values.category, priority: values.priority, note: text('note') }],
        assign: [
          'assign',
          {
            departmentId: values.departmentId,
            assignedToId: values.assignedToId || undefined,
            priority: values.priority,
            dueAt: values.dueAt && (!item.dueAt || !dayjs(item.dueAt).isSame(values.dueAt as dayjs.Dayjs)) ? (values.dueAt as dayjs.Dayjs).toISOString() : undefined,
            note: text('note'),
          },
        ],
        start: ['start', {}],
        request: ['request-information', { message: text('message') }],
        contact: ['contact-attempt', { channel: values.channel, outcome: values.outcome, note: text('note') }],
        message: ['messages', { body: text('message'), visibility: values.visibility }],
        submit: ['submit-resolution', { summary: text('summary') }],
        approve: ['review', { decision: 'APPROVE', note: text('note') || undefined }],
        return: ['review', { decision: 'RETURN', note: text('note') }],
        close: ['close', { note: text('note') || undefined }],
        closeNoResponse: ['close-no-response', { note: text('note') || undefined }],
        reject: ['reject', { reason: text('reason') }],
        reopen: ['reopen', { reason: text('reason') }],
        rejectReopen: ['reopen-request/reject', { reason: text('reason') }],
        publish: ['publish', { publish: true, confirmAnonymized: Boolean(values.confirmAnonymized) }],
        unpublish: ['publish', { publish: false }],
      };
      const [path, body] = map[action!];
      return http.post(`/feedbacks/${item.id}/${path}`, { ...base, ...body });
    },
    { success: action ? `${ACTION_TITLE[action]}: đã thực hiện` : undefined, refresh: ['/feedbacks'], onDone: onClose },
  );

  if (!action) return null;
  const textArea = (name: string, label: string, min: number, max: number, required = true) => (
    <Form.Item name={name} label={label} rules={[{ required, min: required ? min : undefined, max, transform: value => typeof value === 'string' ? value.trim() : value, message: required ? `Từ ${min} đến ${max} ký tự` : `Tối đa ${max} ký tự` }]}>
      <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} maxLength={max} showCount />
    </Form.Item>
  );

  return (
    <Modal
      title={ACTION_TITLE[action]}
      open
      onCancel={onClose}
      onOk={() => form.submit()}
      okText="Xác nhận"
      okButtonProps={{ danger: ['reject', 'return', 'rejectReopen', 'closeNoResponse', 'unpublish'].includes(action), disabled: action === 'publish' && !preview.data }}
      confirmLoading={run.isPending}
      width={action === 'publish' ? 720 : 560}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        {item.code} · {item.title}
      </Typography.Paragraph>
      <Form form={form} layout="vertical" requiredMark={false} onFinish={values => run.mutate(values)}>
        {action === 'triage' && (
          <>
            <Form.Item name="category" label="Nhóm vấn đề" rules={[{ required: true }]}>
              <Select options={options(FEEDBACK_CATEGORY)} />
            </Form.Item>
            <Form.Item name="priority" label="Mức ưu tiên" rules={[{ required: true }]}>
              <Select options={options(FEEDBACK_PRIORITY)} />
            </Form.Item>
            {textArea('note', 'Ghi chú', 3, 1000)}
          </>
        )}
        {action === 'assign' && (
          <>
            <Form.Item name="departmentId" label="Đơn vị xử lý" rules={[{ required: true, message: 'Chọn đơn vị' }]}>
              <Select options={departmentOptions(departments.data)} onChange={() => form.setFieldValue('assignedToId', undefined)} />
            </Form.Item>
            <Form.Item name="assignedToId" label="Cán bộ xử lý">
              <Select allowClear loading={assignees.isLoading} options={(assignees.data ?? []).filter(person => person.departmentId === departmentId).map(person => ({ value: person.id, label: person.fullName }))} />
            </Form.Item>
            <div className="form-grid">
              <Form.Item name="priority" label="Mức ưu tiên">
                <Select options={options(FEEDBACK_PRIORITY)} />
              </Form.Item>
              <Form.Item name="dueAt" label="Hạn xử lý" rules={[{ validator: (_, value: dayjs.Dayjs | undefined) => !value || value.isAfter(dayjs()) ? Promise.resolve() : Promise.reject(new Error('Hạn xử lý phải ở tương lai')) }]}>
                <DatePicker disabledDate={current => current.isBefore(dayjs(), 'day')} showTime={{ format: 'HH:mm' }} format="HH:mm DD/MM/YYYY" style={{ width: '100%' }} />
              </Form.Item>
            </div>
            {textArea('note', 'Ghi chú phân công', 3, 1000)}
          </>
        )}
        {action === 'start' && <Typography.Paragraph>Chuyển hồ sơ sang trạng thái đang xử lý.</Typography.Paragraph>}
        {action === 'request' && textArea('message', 'Nội dung cần người dân bổ sung', 5, 3000)}
        {action === 'contact' && (
          <>
            <div className="form-grid">
              <Form.Item name="channel" label="Kênh">
                <Select
                  options={[
                    { value: 'PHONE', label: 'Điện thoại' },
                    { value: 'EMAIL', label: 'Email' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="outcome" label="Kết quả">
                <Select
                  options={[
                    { value: 'REACHED', label: 'Đã liên hệ được' },
                    { value: 'NO_ANSWER', label: 'Không bắt máy' },
                    { value: 'MESSAGE_SENT', label: 'Đã gửi tin nhắn' },
                    { value: 'INVALID_CONTACT', label: 'Thông tin liên hệ sai' },
                  ]}
                />
              </Form.Item>
            </div>
            {textArea('note', 'Ghi chú', 3, 1000)}
          </>
        )}
        {action === 'message' && (
          <>
            <Form.Item name="visibility" label="Phạm vi">
              <Segmented
                options={[
                  ...(canPublic ? [{ value: 'PUBLIC', label: 'Gửi người dân', icon: <EyeOutlined /> }] : []),
                  { value: 'INTERNAL', label: 'Ghi chú nội bộ', icon: <LockOutlined /> },
                ]}
              />
            </Form.Item>
            {textArea('message', 'Nội dung', 2, 3000)}
          </>
        )}
        {action === 'submit' && textArea('summary', 'Kết quả xử lý', 10, 5000)}
        {(action === 'approve' || action === 'close' || action === 'closeNoResponse') && textArea('note', 'Ghi chú', 0, action === 'approve' ? 2000 : 1000, false)}
        {action === 'return' && textArea('note', 'Lý do trả lại', 3, 2000)}
        {(action === 'reject' || action === 'reopen' || action === 'rejectReopen') && textArea('reason', 'Lý do', 10, 2000)}
        {action === 'publish' &&
          (preview.error ? (
            <LoadError error={preview.error} retry={() => void preview.refetch()} />
          ) : !preview.data ? (
            <PageSkeleton />
          ) : (
            <>
              <Descriptions
                bordered
                size="small"
                column={1}
                items={[
                  { label: 'Tiêu đề', children: preview.data.title },
                  { label: 'Nội dung', children: <span className="pre-line">{preview.data.content}</span> },
                  { label: 'Kết quả', children: <span className="pre-line">{preview.data.resolutionSummary || '—'}</span> },
                  {
                    label: 'Trao đổi công khai',
                    children: preview.data.messages.length ? (
                      <Flex vertical gap={12} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                        {preview.data.messages.map((entry, index) => (
                          <div key={`${entry.createdAt}-${index}`}>
                            <Typography.Text strong>{entry.authorName}</Typography.Text>
                            <div className="entry-meta">{dateTime(entry.createdAt)}</div>
                            <div className="pre-line">{entry.body}</div>
                          </div>
                        ))}
                      </Flex>
                    ) : <span className="muted">Không có trao đổi công khai</span>,
                  },
                ]}
              />
              <Form.Item name="confirmAnonymized" valuePropName="checked" rules={[{ validator: (_, value) => (value ? Promise.resolve() : Promise.reject(new Error('Cần xác nhận'))) }]} style={{ marginTop: 16 }}>
                <Checkbox>Đã kiểm tra, nội dung không còn thông tin cá nhân</Checkbox>
              </Form.Item>
            </>
          ))}
        {action === 'unpublish' && <Typography.Paragraph>Gỡ kết quả khỏi trang công khai.</Typography.Paragraph>}
      </Form>
    </Modal>
  );
}

function FeedbackDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const user = useMe();
  const { message } = App.useApp();
  const detail = useApi<Feedback>(id ? `/feedbacks/${id}` : null);
  const [action, setAction] = useState<Action | null>(null);
  const item = detail.data;
  const leader = can(user, LEADERSHIP);
  const canReview = can(user, ['ADMIN', 'LEADER', 'MANAGER']);
  const canTriage = can(user, ['ADMIN', 'LEADER', 'CLERK', 'MANAGER']);
  const handle = (row: Feedback) => leader || (user.role === 'MANAGER' && row.departmentId === user.departmentId) || (user.role === 'STAFF' && row.departmentId === user.departmentId && row.assignedToId === user.id);

  async function download(attachmentId: string, name: string) {
    try {
      saveBlob(await http.blob(`/feedbacks/${id}/attachments/${attachmentId}/download`), name || 'minh-chung');
    } catch (error) {
      message.error(errorText(error, 'Không tải được tệp'));
    }
  }

  const buttons: { key: Action; label: string; primary?: boolean; danger?: boolean }[] = [];
  if (item) {
    const s = item.status;
    if (canTriage && ['RECEIVED', 'ASSIGNED'].includes(s)) buttons.push({ key: 'triage', label: 'Phân loại' });
    if (canTriage && ['RECEIVED', 'ASSIGNED', 'REOPENED', 'IN_PROGRESS', 'WAITING_CITIZEN'].includes(s)) buttons.push({ key: 'assign', label: 'Phân công', primary: s === 'RECEIVED' });
    if (handle(item) && ['ASSIGNED', 'REOPENED'].includes(s)) buttons.push({ key: 'start', label: 'Bắt đầu xử lý', primary: true });
    if (handle(item) && ['IN_PROGRESS', 'REOPENED'].includes(s)) buttons.push({ key: 'request', label: 'Yêu cầu bổ sung' });
    if (handle(item) && !DONE.includes(s)) buttons.push({ key: 'contact', label: 'Ghi nhận liên hệ' });
    if (handle(item) && !['CLOSED', 'REJECTED'].includes(s)) buttons.push({ key: 'message', label: 'Thêm trao đổi' });
    if (handle(item) && ['IN_PROGRESS', 'REOPENED'].includes(s)) buttons.push({ key: 'submit', label: 'Trình duyệt kết quả', primary: true });
    if (canReview && s === 'PENDING_REVIEW' && item.submittedForReviewBy !== user.id) {
      buttons.push({ key: 'return', label: 'Trả lại', danger: true });
      buttons.push({ key: 'approve', label: 'Duyệt kết quả', primary: true });
    }
    if (canReview && s === 'RESOLVED') buttons.push({ key: 'close', label: 'Đóng hồ sơ' });
    if (canReview && s === 'WAITING_CITIZEN' && item.citizenResponseDueAt && msUntil(item.citizenResponseDueAt) <= 0) buttons.push({ key: 'closeNoResponse', label: 'Kết thúc do quá hạn bổ sung', danger: true });
    if (leader && ['RECEIVED', 'ASSIGNED'].includes(s)) buttons.push({ key: 'reject', label: 'Không tiếp nhận', danger: true });
    if (canReview && DONE.includes(s) && item.reopenRequestedAt) {
      buttons.push({ key: 'rejectReopen', label: 'Từ chối đề nghị', danger: true });
      buttons.push({ key: 'reopen', label: 'Chấp nhận mở lại', primary: true });
    }
    if (canReview && DONE.includes(s) && !item.reopenRequestedAt) buttons.push({ key: 'reopen', label: s === 'REJECTED' ? 'Khôi phục hồ sơ' : 'Mở lại' });
    if (leader && ['RESOLVED', 'CLOSED'].includes(s) && (item.isPublic || (!item.reopenRequestedAt && item.closureReason === 'RESOLVED'))) buttons.push({ key: item.isPublic ? 'unpublish' : 'publish', label: item.isPublic ? 'Gỡ công khai' : 'Công khai' });
  }

  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      size={760}
      title={item ? `${item.code}` : 'Phản ánh'}
      extra={item && <Tag color={FEEDBACK_STATUS[item.status].color}>{FEEDBACK_STATUS[item.status].label}</Tag>}
      footer={
        buttons.length > 0 && (
          <Flex gap={8} wrap justify="flex-end">
            {buttons.map(button => (
              <Button key={button.key} type={button.primary ? 'primary' : 'default'} danger={button.danger} onClick={() => setAction(button.key)}>
                {button.label}
              </Button>
            ))}
          </Flex>
        )
      }
    >
      {detail.error ? (
        <LoadError error={detail.error} retry={() => void detail.refetch()} />
      ) : !item ? (
        <PageSkeleton />
      ) : (
        <Flex vertical gap={16}>
          <div>
            <Typography.Title level={5} style={{ margin: '0 0 8px' }}>
              {item.title}
            </Typography.Title>
            <Space size={[6, 6]} wrap>
              <Tag color={FEEDBACK_PRIORITY[item.priority].color}>{FEEDBACK_PRIORITY[item.priority].label}</Tag>
              <Tag>{FEEDBACK_CATEGORY[item.category]}</Tag>
              {overdue(item) && <Tag color="red">{item.status === 'WAITING_CITIZEN' ? 'Quá hạn bổ sung' : 'Quá hạn xử lý'}</Tag>}
              {item.isPublic && <Tag color="cyan">Đang công khai</Tag>}
              {item.rating ? <Tag color="gold">Đánh giá {item.rating}/5</Tag> : null}
            </Space>
          </div>
          <Descriptions
            bordered
            size="small"
            column={1}
            items={[
              {
                label: 'Người gửi',
                children:
                  user.role === 'VIEWER' ? (
                    <span className="muted">Đã ẩn</span>
                  ) : (
                    <span>
                      {item.submitterName} · {item.submitterPhone}
                      {item.submitterEmail ? ` · ${item.submitterEmail}` : ''} <span className="muted">(liên hệ qua {item.preferredContact === 'EMAIL' ? 'email' : 'điện thoại'})</span>
                    </span>
                  ),
              },
              ...(item.address ? [{ label: 'Địa điểm', children: item.address }] : []),
              { label: 'Đơn vị xử lý', children: `${item.department?.name ?? 'Chưa phân công'}${item.assignedTo ? ` · ${item.assignedTo.fullName}` : ''}` },
              {
                label: item.status === 'WAITING_CITIZEN' ? 'Hạn bổ sung' : item.firstResponseAt ? 'Hạn xử lý' : 'Hạn phản hồi',
                children: deadline(item) ? <span className={overdue(item) ? 'tone-bad' : undefined}>{dateTime(deadline(item))} · {until(deadline(item))}</span> : '—',
              },
              { label: 'Tiếp nhận', children: dateTime(item.createdAt) },
            ]}
          />
          <div>
            <Typography.Text type="secondary">Nội dung</Typography.Text>
            <div className="quote" style={{ marginTop: 6 }}>
              {item.content}
            </div>
          </div>
          {item.resolutionSummary && <Alert type="success" showIcon title="Kết quả xử lý" description={<span className="pre-line">{item.resolutionSummary}</span>} />}
          {item.rejectionReason && <Alert type="error" showIcon title="Lý do không tiếp nhận" description={item.rejectionReason} />}
          {item.reopenRequestedAt && (
            <Alert type="warning" showIcon title={`Người dân đề nghị xem xét lại (lần ${item.reopenRequestCount}/3)`} description={`${item.reopenRequestReason ?? ''} — ${dateTime(item.reopenRequestedAt)}`} />
          )}
          {item.ratingComment && <Alert type="info" showIcon title={`Đánh giá ${item.rating}/5`} description={item.ratingComment} />}
          <Tabs
            items={[
              {
                key: 'messages',
                label: `Trao đổi (${item.messages?.length ?? 0})`,
                children: item.messages?.length ? (
                  <Flex vertical gap={10}>
                    {item.messages.map(entry => (
                      <div key={entry.id} className={`fb-msg${entry.visibility === 'INTERNAL' ? ' internal' : ''}`}>
                        <Flex justify="space-between" gap={8} wrap>
                          <Space size={6}>
                            <b>{entry.authorName}</b>
                            {entry.visibility === 'INTERNAL' ? (
                              <Tag icon={<LockOutlined />}>Nội bộ</Tag>
                            ) : (
                              <Tag icon={<EyeOutlined />} color="blue">
                                Người dân thấy
                              </Tag>
                            )}
                          </Space>
                          <span className="entry-meta">{dateTime(entry.createdAt)}</span>
                        </Flex>
                        <div className="pre-line" style={{ marginTop: 4 }}>
                          {entry.body}
                        </div>
                      </div>
                    ))}
                  </Flex>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có trao đổi" />
                ),
              },
              {
                key: 'files',
                label: `Tệp (${item.attachments?.length ?? 0})`,
                children: item.attachments?.length ? (
                  <Flex vertical gap={6}>
                    {item.attachments.map(file => (
                      <Button key={file.id} icon={<PaperClipOutlined />} onClick={() => void download(file.id, file.originalName)} style={{ justifyContent: 'flex-start' }}>
                        {file.originalName} <span className="muted">· {fileSize(file.size)}</span>
                      </Button>
                    ))}
                  </Flex>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có tệp" />
                ),
              },
              {
                key: 'events',
                label: 'Lịch sử',
                children: (
                  <Timeline
                    items={(item.events ?? []).map(event => ({
                      key: event.id,
                      content: (
                        <div className="timeline-item">
                          <b>{FEEDBACK_EVENT[event.action] ?? event.action}</b>
                          {event.actorName && <span className="secondary">{event.actorName}</span>}
                          {event.note && <span className="secondary pre-line">{event.note}</span>}
                          <span className="entry-meta">{dateTime(event.createdAt)}</span>
                        </div>
                      ),
                    }))}
                  />
                ),
              },
            ]}
          />
        </Flex>
      )}
      {item && <ActionModal item={item} action={action} onClose={() => setAction(null)} />}
    </Drawer>
  );
}

export default function FeedbackAdmin() {
  const user = useMe();
  const global = isGlobal(user);
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>();
  const [priority, setPriority] = useState<string>();
  const [category, setCategory] = useState<string>();
  const [departmentId, setDepartmentId] = useState<string>();
  const [scope, setScope] = useState<'all' | 'mine' | 'reopen' | 'expired'>('all');
  // Sắp xếp do máy chủ thực hiện trên toàn bộ kết quả, không chỉ trang đang xem.
  const [sort, setSort] = useState<{ key: string; order: 'ascend' | 'descend' | null }>({ key: 'createdAt', order: 'descend' });
  const departments = useDepartments();
  const selectedId = params.get('id');

  const filters = {
    status,
    priority,
    category,
    departmentId: global ? departmentId : undefined,
    search: search || undefined,
    assignedToMe: scope === 'mine' ? true : undefined,
    reopenRequested: scope === 'reopen' ? true : undefined,
    waitingCitizenExpired: scope === 'expired' ? true : undefined,
  };
  const list = useApi<FeedbackListResponse>(`/feedbacks${query({ ...filters, page, pageSize: 20, sort: sort.order ? `${sort.key}:${sort.order === 'ascend' ? 'asc' : 'desc'}` : undefined })}`, {
    keepPrevious: true,
    refetchInterval: 120_000,
  });
  const sortOrder = (key: string) => (sort.key === key ? sort.order : null);
  const stats = useApi<FeedbackStats>(`/feedbacks/stats${query({ departmentId: global ? departmentId : undefined })}`, { refetchInterval: 120_000 });
  const s = stats.data;

  function reset() {
    setPage(1);
  }

  return (
    <Page
      title={global ? 'Phản ánh người dân' : 'Phản ánh của phòng'}
      meta={list.data && <span>{num(list.data.total)} hồ sơ</span>}
      extra={
        <Tooltip title="Tải lại">
          <Button
            icon={<ReloadOutlined spin={list.isFetching} />}
            onClick={() => {
              void list.refetch();
              void stats.refetch();
            }}
            aria-label="Tải lại"
          />
        </Tooltip>
      }
      wide
    >
      <Card className="card-flush" style={{ marginBottom: 16 }}>
        <div className="metric-grid metric-grid-6">
          <Metric label="Tổng hồ sơ" value={num(s?.total)} foot={`${num(s?.received ?? 0)} mới tiếp nhận`} />
          <Metric label="Đang xử lý" value={num(s?.inProgress)} foot={`${num(s?.dueSoon ?? 0)} sắp đến hạn · ${num(s?.awaitingCitizen ?? 0)} chờ dân`} />
          <Metric label="Chờ duyệt kết quả" value={num(s?.pendingReview)} tone={s?.pendingReview ? 'warn' : undefined} />
          <Metric label="Đề nghị xem xét lại" value={num(s?.reopenRequested)} tone={s?.reopenRequested ? 'warn' : undefined} />
          <Metric label="Quá hạn" value={num(s?.overdue)} tone={s?.overdue ? 'bad' : undefined} foot={`${num(s?.waitingCitizenExpired ?? 0)} quá hạn bổ sung`} />
          <Metric label="Hài lòng" value={s?.averageRating ? `${s.averageRating.toFixed(1).replace('.', ',')}/5` : '—'} foot={`${num(s?.ratingCount ?? 0)} lượt đánh giá`} />
        </div>
      </Card>
      <Card className="card-flush">
        <div className="table-filters">
          <FilterBar
            active={[status, priority, category, departmentId].filter(Boolean).length + (scope === 'all' ? 0 : 1)}
            search={
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder={user.role === 'VIEWER' ? 'Mã phản ánh' : 'Mã, tiêu đề, nội dung'}
                value={text}
                onChange={event => {
                  setText(event.target.value);
                  if (!event.target.value) {
                    setSearch('');
                    reset();
                  }
                }}
                onPressEnter={() => {
                  setSearch(text.trim());
                  reset();
                }}
                style={{ width: '100%', maxWidth: 280 }}
              />
            }
            filters={
              <>
                <div style={{ minWidth: 0, maxWidth: '100%', overflowX: 'auto' }}><Segmented
                  value={scope}
                  onChange={value => {
                    setScope(value as typeof scope);
                    reset();
                  }}
                  options={[
                    { value: 'all', label: 'Tất cả' },
                    { value: 'mine', label: 'Giao cho tôi' },
                    { value: 'reopen', label: 'Xem xét lại' },
                    { value: 'expired', label: 'Quá hạn bổ sung' },
                  ]}
                /></div>
                <Select allowClear placeholder="Trạng thái" value={status} onChange={value => { setStatus(value); reset(); }} options={options(FEEDBACK_STATUS)} style={{ width: 190 }} popupMatchSelectWidth={false} />
                <Select allowClear placeholder="Ưu tiên" value={priority} onChange={value => { setPriority(value); reset(); }} options={options(FEEDBACK_PRIORITY)} style={{ width: 130 }} />
                <Select allowClear placeholder="Nhóm vấn đề" value={category} onChange={value => { setCategory(value); reset(); }} options={options(FEEDBACK_CATEGORY)} style={{ width: 180 }} popupMatchSelectWidth={false} />
                {global && <Select allowClear placeholder="Đơn vị" value={departmentId} onChange={value => { setDepartmentId(value); reset(); }} options={departmentOptions(departments.data, false)} style={{ width: 200 }} popupMatchSelectWidth={false} />}
              </>
            }
          />
        </div>
        {list.error && !list.data ? (
          <LoadError error={list.error} retry={() => void list.refetch()} />
        ) : (
          <Table
            rowKey="id"
            loading={list.isLoading || list.isPlaceholderData}
            dataSource={list.data?.items ?? []}
            scroll={{ x: 1100 }}
            pagination={{ current: page, pageSize: 20, total: list.data?.total ?? 0, onChange: setPage, showSizeChanger: false, showTotal: total => `${num(total)} hồ sơ` }}
            onRow={item => ({ onClick: () => setParams({ id: item.id }, { replace: true }), className: 'link-row' })}
            locale={{ emptyText: 'Không có phản ánh' }}
            onChange={(_pagination, _filters, sorter, extra) => {
              if (extra.action !== 'sort') return;
              const next = Array.isArray(sorter) ? sorter[0] : sorter;
              setSort({ key: String(next?.columnKey ?? 'createdAt'), order: next?.order ?? null });
              setPage(1);
            }}
            columns={[
              { title: 'Phản ánh', key: 'title', sorter: true, sortOrder: sortOrder('title'), render: (_, item) => <TitleCell title={item.title} sub={`${item.code} · ${FEEDBACK_CATEGORY[item.category]}`} /> },
              { title: 'Ưu tiên', key: 'priority', dataIndex: 'priority', width: 110, sorter: true, sortOrder: sortOrder('priority'), sortDirections: ['descend', 'ascend'], render: (value: Feedback['priority']) => <Tag color={FEEDBACK_PRIORITY[value].color}>{FEEDBACK_PRIORITY[value].label}</Tag> },
              { title: 'Trạng thái', key: 'status', dataIndex: 'status', width: 190, sorter: true, sortOrder: sortOrder('status'), render: (value: Feedback['status'], item) => <Flex vertical align="start" gap={4}><Tag color={FEEDBACK_STATUS[value].color}>{FEEDBACK_STATUS[value].label}</Tag>{item.reopenRequestedAt && <Tag color="orange">Đề nghị xem xét lại</Tag>}</Flex> },
              {
                title: 'Đơn vị xử lý',
                key: 'dept',
                width: 220,
                render: (_, item) => (
                  <div className="cell-title">
                    <span style={{ color: 'var(--ioc-color-text)', fontSize: 13 }}>{item.department?.name ?? 'Chưa phân công'}</span>
                    {item.assignedTo && <span>{item.assignedTo.fullName}</span>}
                  </div>
                ),
              },
              {
                title: 'Hạn',
                key: 'due',
                width: 150,
                render: (_, item) => {
                  const at = deadline(item);
                  if (!at || DONE.includes(item.status)) return <span className="muted">—</span>;
                  return (
                    <Tooltip title={dateTime(at)}>
                      <span className={overdue(item) ? 'tone-bad' : msUntil(at) < 2 * 86_400_000 ? 'tone-warn' : undefined}>{until(at)}</span>
                    </Tooltip>
                  );
                },
              },
              { title: 'Tiếp nhận', key: 'createdAt', dataIndex: 'createdAt', width: 130, sorter: true, sortOrder: sortOrder('createdAt'), sortDirections: ['descend', 'ascend'], render: value => <Tooltip title={dateTime(value)}>{fromNow(value)}</Tooltip> },
            ]}
          />
        )}
      </Card>
      <FeedbackDrawer id={selectedId} onClose={() => setParams({}, { replace: true })} />
    </Page>
  );
}
