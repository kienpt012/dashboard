import {
  CheckCircleFilled,
  CopyOutlined,
  DownloadOutlined,
  FileSearchOutlined,
  FormOutlined,
  InboxOutlined,
  PaperClipOutlined,
  PrinterOutlined,
  RedoOutlined,
  SendOutlined,
  SearchOutlined,
  StarFilled,
} from '@ant-design/icons';
import { Alert, App, Button, Card, Checkbox, Col, Empty, Form, Grid, Input, Modal, Radio, Rate, Result, Row, Select, Skeleton, Space, Steps, Tabs, Tag, Upload, type UploadFile } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { localityTitle, useLocality } from '@/app/locality';
import { useApi } from '@/hooks/useApi';
import { ApiError, errorText, http, saveBlob } from '@/lib/api';
import { date, dateTime, fileSize, until } from '@/lib/format';
import type { FeedbackCategory, PublicFeedbackDetail, PublishedFeedback } from '@/types/core';
import { FEEDBACK_CATEGORY, FEEDBACK_STATUS, options } from '../feedback/labels';
import { EventTimeline, MessageThread, MetaGrid, withoutResultEcho } from './PublishedFeedback';
import { PublicShell } from './PublicShell';
import './feedback-public.css';

// ---------------------------------------------------------------- Mã bảo mật do trình duyệt sinh, chỉ người gửi biết

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const PENDING_KEY = 'ioc_feedback_pending';
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const APPEAL_MS = 30 * 86_400_000;

function randomSecret() {
  const out: string[] = [];
  const bytes = new Uint8Array(64);
  while (out.length < 25) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      // Bỏ phần dư để mỗi ký tự có xác suất như nhau.
      if (byte < 240 && out.length < 25) out.push(ALPHABET[byte % ALPHABET.length]);
    }
  }
  return out.join('').match(/.{5}/g)!.join('-');
}

/** Chuẩn hoá mã bảo mật người dân nhập lại: bỏ khoảng trắng, chữ hoa, tự chèn gạch nối nếu đúng định dạng. */
function normalizeSecret(raw: string) {
  const compact = raw.toUpperCase().replace(/[\s-]/g, '');
  if (compact.length === 25 && [...compact].every(char => ALPHABET.includes(char))) return compact.match(/.{5}/g)!.join('-');
  return raw.trim();
}

type Pending = { clientSubmissionId: string; lookupSecret: string };

function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pendingSubmission(): Pending {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null') as Pending | null;
    if (saved?.clientSubmissionId && saved.lookupSecret) return saved;
  } catch {
    /* trình duyệt chặn lưu trữ: vẫn gửi được, chỉ mất khả năng chống gửi trùng khi tải lại trang */
  }
  const fresh = { clientSubmissionId: uuidV4(), lookupSecret: randomSecret() };
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(fresh));
  } catch {
    /* như trên */
  }
  return fresh;
}

function clearPending() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* như trên */
  }
}

function filesError(files: UploadFile[]) {
  if (files.length > MAX_FILES) return `Tối đa ${MAX_FILES} tệp`;
  for (const file of files) {
    if (file.type && !ACCEPT.includes(file.type)) return `${file.name}: chỉ nhận ảnh JPG, PNG, WEBP hoặc PDF`;
    if ((file.size ?? 0) > MAX_BYTES) return `${file.name}: vượt quá 10 MB`;
  }
  return null;
}

function attachmentForm(files: UploadFile[], secret: string, version: number) {
  const body = new FormData();
  for (const file of files) if (file.originFileObj) body.append('files', file.originFileObj);
  body.set('lookupSecret', secret);
  body.set('expectedVersion', String(version));
  return body;
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const { message } = App.useApp();
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement('textarea');
        input.value = value;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        const focused = document.activeElement;
        document.body.appendChild(input);
        try {
          input.select();
          if (!document.execCommand('copy')) throw new Error('Sao chép thất bại');
        } finally {
          input.remove();
          if (focused instanceof HTMLElement) focused.focus();
        }
      }
      message.success(`Đã sao chép ${label}`);
    } catch {
      message.error('Trình duyệt không cho phép sao chép');
    }
  }
  return (
    <Button
      size="small"
      type="text"
      icon={<CopyOutlined />}
      aria-label={`Sao chép ${label}`}
      onClick={() => void copy()}
    />
  );
}

// ---------------------------------------------------------------- Gửi phản ánh

type Created = { code: string; lookupSecret: string; status: string; version: number; createdAt: string; fileError?: string | null; fileCount?: number };

type SubmitValues = {
  category: FeedbackCategory;
  title: string;
  content: string;
  address?: string;
  submitterName: string;
  submitterPhone: string;
  submitterEmail?: string;
  preferredContact: 'PHONE' | 'EMAIL';
  scopeConfirmed: boolean;
  consent: boolean;
};

function Receipt({ created, onTrack, onAgain }: { created: Created; onTrack: () => void; onAgain: () => void }) {
  const locality = useLocality();
  const text = [
    `${locality.configured ? localityTitle(locality) : locality.brandName}`,
    'BIÊN NHẬN PHẢN ÁNH, KIẾN NGHỊ',
    '',
    `Mã phản ánh: ${created.code}`,
    `Mã bảo mật: ${created.lookupSecret}`,
    `Thời điểm tiếp nhận: ${dateTime(created.createdAt)}`,
    '',
    `Tra cứu: ${window.location.origin}/phan-anh?tab=tra-cuu&ma=${created.code}`,
  ].join('\n');
  return (
    <Card className="fbp-receipt">
      <Result
        icon={<CheckCircleFilled />}
        status="success"
        title="Đã tiếp nhận phản ánh"
        subTitle={`Tiếp nhận lúc ${dateTime(created.createdAt)}`}
        style={{ paddingBottom: 8 }}
      />
      <div className="fbp-codes">
        <div>
          <span>Mã phản ánh</span>
          <strong>
            {created.code}
            <CopyValue value={created.code} label="mã phản ánh" />
          </strong>
        </div>
        <div>
          <span>Mã bảo mật</span>
          <strong className="fbp-secret">
            {created.lookupSecret}
            <CopyValue value={created.lookupSecret} label="mã bảo mật" />
          </strong>
        </div>
      </div>
      <Alert type="warning" showIcon title="Hãy lưu biên nhận trước khi rời trang" description="Bạn cần cả mã phản ánh và mã bảo mật để xem kết quả. Giữ riêng mã bảo mật, không chia sẻ công khai." className="fbp-gap" />
      {created.fileError && <Alert type="error" showIcon title="Chưa gửi được tệp minh chứng" description={`${created.fileError}. Có thể bổ sung khi tra cứu phản ánh.`} className="fbp-gap" />}
      {!created.fileError && created.fileCount ? <Alert type="success" showIcon title={`Đã nhận ${created.fileCount} tệp minh chứng`} className="fbp-gap" /> : null}
      <div className="fbp-receipt-actions">
        <Button type="primary" icon={<FileSearchOutlined />} onClick={onTrack}>
          Xem hồ sơ
        </Button>
        <Button icon={<DownloadOutlined />} onClick={() => saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `bien-nhan-${created.code}.txt`)}>
          Tải biên nhận
        </Button>
        <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
          In biên nhận
        </Button>
        <Button type="text" icon={<FormOutlined />} onClick={onAgain}>
          Gửi phản ánh khác
        </Button>
      </div>
    </Card>
  );
}

function SubmitTab({ receipt: created, onCreated, onAgain, onTrack }: {
  receipt: Created | null;
  onCreated: (receipt: Created) => void;
  onAgain: () => void;
  onTrack: (code: string, secret: string) => void;
}) {
  const [form] = Form.useForm<SubmitValues>();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = Form.useWatch('submitterEmail', form);

  async function submit(values: SubmitValues) {
    const problem = filesError(files);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pending = pendingSubmission();
      const result = await http.post<Created>('/public/feedbacks', {
        ...values,
        title: values.title.trim(),
        content: values.content.trim(),
        address: values.address?.trim() || undefined,
        submitterName: values.submitterName.trim(),
        submitterPhone: values.submitterPhone.trim(),
        submitterEmail: values.submitterEmail?.trim() || undefined,
        preferredContact: values.submitterEmail?.trim() ? values.preferredContact : 'PHONE',
        clientSubmissionId: pending.clientSubmissionId,
        lookupSecret: pending.lookupSecret,
      });
      let fileError: string | null = null;
      let fileCount = 0;
      let version = result.version;
      if (files.length) {
        try {
          const uploaded = await http.post<Pick<PublicFeedbackDetail, 'attachments' | 'version'>>(`/public/feedbacks/${encodeURIComponent(result.code)}/attachments`, attachmentForm(files, result.lookupSecret, result.version));
          fileCount = uploaded.attachments.length;
          version = uploaded.version;
        } catch (uploadError) {
          fileError = errorText(uploadError);
        }
      }
      clearPending();
      onCreated({ ...result, version, fileError, fileCount });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submitError) {
      setError(errorText(submitError));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Receipt
        created={created}
        onTrack={() => onTrack(created.code, created.lookupSecret)}
        onAgain={() => {
          form.resetFields();
          setFiles([]);
          onAgain();
        }}
      />
    );
  }

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={16}>
        <Form form={form} layout="vertical" requiredMark="optional" onFinish={values => void submit(values)} initialValues={{ preferredContact: 'PHONE' }} scrollToFirstError={{ block: 'center' }}>
          <Card title={<span className="fbp-step-title"><b>1</b> Nội dung phản ánh</span>} className="fbp-gap">
            <Form.Item name="category" label="Lĩnh vực" rules={[{ required: true, message: 'Chọn lĩnh vực' }]}>
              <Select options={options(FEEDBACK_CATEGORY)} placeholder="Chọn lĩnh vực" />
            </Form.Item>
            <Form.Item name="title" label="Tiêu đề" extra="Ví dụ: Đèn chiếu sáng hẻm 12 đường Nguyễn Trãi bị hỏng." rules={[{ required: true, whitespace: true, message: 'Nhập tiêu đề' }, { min: 8, transform: (value?: string) => value?.trim(), message: 'Tiêu đề cần ít nhất 8 ký tự' }]}>
              <Input maxLength={200} showCount placeholder="Tóm tắt vấn đề cần phản ánh" />
            </Form.Item>
            <Form.Item name="content" label="Nội dung" extra="Mô tả sự việc, thời gian xảy ra và mức độ ảnh hưởng để đơn vị xử lý có đủ thông tin." rules={[{ required: true, whitespace: true, message: 'Nhập nội dung' }, { min: 20, transform: (value?: string) => value?.trim(), message: 'Nội dung cần ít nhất 20 ký tự' }]}>
              <Input.TextArea autoSize={{ minRows: 5, maxRows: 14 }} maxLength={5000} showCount placeholder="Sự việc, thời gian, mức độ ảnh hưởng" />
            </Form.Item>
            <Form.Item name="address" label="Địa điểm">
              <Input maxLength={500} placeholder="Số nhà, tên đường, khu phố" />
            </Form.Item>
            <Form.Item label="Ảnh, tệp minh chứng" extra={`Tối đa ${MAX_FILES} tệp JPG, PNG, WEBP hoặc PDF, mỗi tệp không quá 10 MB`} style={{ marginBottom: 0 }}>
              <Upload.Dragger
                multiple
                accept={ACCEPT.join(',')}
                fileList={files}
                beforeUpload={() => false}
                onChange={({ fileList }) => setFiles(fileList.slice(0, MAX_FILES))}
                className="fbp-drop"
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">Kéo thả hoặc bấm để chọn tệp</p>
              </Upload.Dragger>
            </Form.Item>
          </Card>
          <Card title={<span className="fbp-step-title"><b>2</b> Thông tin liên hệ</span>} className="fbp-gap">
            <div className="fbp-grid">
              <Form.Item name="submitterName" label="Họ và tên" rules={[{ required: true, whitespace: true, message: 'Nhập họ và tên' }, { min: 2, transform: (value?: string) => value?.trim(), message: 'Họ tên quá ngắn' }]}>
                <Input maxLength={160} autoComplete="name" />
              </Form.Item>
              <Form.Item
                name="submitterPhone"
                label="Số điện thoại liên hệ"
                rules={[{ required: true, message: 'Nhập số điện thoại' }, { pattern: /^(?=(?:\D*\d){9,15}\D*$)\+?[0-9().\-\s]+$/, transform: (value?: string) => value?.trim(), message: 'Số điện thoại có 9–15 chữ số' }]}
              >
                <Input maxLength={20} inputMode="tel" autoComplete="tel" />
              </Form.Item>
              <Form.Item name="submitterEmail" label="Email" rules={[{ type: 'email', transform: (value?: string) => value?.trim(), message: 'Email không hợp lệ' }]}>
                <Input maxLength={180} inputMode="email" autoComplete="email" />
              </Form.Item>
              <Form.Item name="preferredContact" label="Nhận thông báo qua">
                <Radio.Group
                  options={[
                    { value: 'PHONE', label: 'Điện thoại' },
                    { value: 'EMAIL', label: 'Email', disabled: !email?.trim() },
                  ]}
                />
              </Form.Item>
            </div>
          </Card>
          <Card title={<span className="fbp-step-title"><b>3</b> Xác nhận và gửi</span>} className="fbp-gap">
            <Form.Item name="scopeConfirmed" valuePropName="checked" rules={[{ validator: (_, value) => (value ? Promise.resolve() : Promise.reject(new Error('Cần xác nhận'))) }]} style={{ marginBottom: 8 }}>
              <Checkbox>Nội dung không phải khiếu nại, tố cáo</Checkbox>
            </Form.Item>
            <Form.Item name="consent" valuePropName="checked" rules={[{ validator: (_, value) => (value ? Promise.resolve() : Promise.reject(new Error('Cần đồng ý để gửi phản ánh'))) }]} style={{ marginBottom: 16 }}>
              <Checkbox>Đồng ý cho cơ quan sử dụng thông tin liên hệ để xử lý phản ánh</Checkbox>
            </Form.Item>
            {error && <Alert type="error" showIcon title={error} className="fbp-gap" />}
            <Button type="primary" size="large" htmlType="submit" icon={<SendOutlined />} loading={busy} block>
              Gửi phản ánh
            </Button>
          </Card>
        </Form>
      </Col>
      <Col xs={24} lg={8}>
        <div className="fbp-aside">
          <Card title="Quy trình xử lý">
            <Steps
              orientation="vertical"
              size="small"
              current={-1}
              items={[
                { title: 'Tiếp nhận', content: 'Cấp mã phản ánh và mã bảo mật' },
                { title: 'Phân công', content: 'Chuyển đơn vị có thẩm quyền' },
                { title: 'Xử lý', content: 'Xác minh, liên hệ khi cần bổ sung' },
                { title: 'Trả kết quả', content: 'Thông báo kết quả, người dân đánh giá' },
              ]}
            />
          </Card>
          <Card title="Lưu ý">
            <ul className="fbp-notes">
              <li>Kênh này không tiếp nhận khiếu nại, tố cáo.</li>
              <li>Thông tin cá nhân không được công khai.</li>
              <li>Tra cứu phản ánh bằng mã phản ánh và mã bảo mật.</li>
            </ul>
          </Card>
        </div>
      </Col>
    </Row>
  );
}

// ---------------------------------------------------------------- Tra cứu

type Credentials = { code: string; secret: string };

const STAGES = ['RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

function stageOf(status: string) {
  if (status === 'RECEIVED') return 0;
  if (['ASSIGNED', 'IN_PROGRESS', 'WAITING_CITIZEN', 'PENDING_REVIEW', 'REOPENED'].includes(status)) return 1;
  if (status === 'RESOLVED') return 2;
  if (status === 'CLOSED') return STAGES.length;
  return 3;
}

function nextDeadline(item: PublicFeedbackDetail) {
  if (item.status === 'WAITING_CITIZEN' && item.citizenResponseDueAt) return { label: 'Hạn bổ sung thông tin', at: item.citizenResponseDueAt };
  if (!item.firstResponseAt && item.firstResponseDueAt && ['RECEIVED', 'ASSIGNED'].includes(item.status)) return { label: 'Hạn phản hồi lần đầu', at: item.firstResponseDueAt };
  if (item.dueAt && !['RESOLVED', 'CLOSED', 'REJECTED'].includes(item.status)) return { label: 'Hạn xử lý', at: item.dueAt };
  return null;
}

function closingMeta(item: PublicFeedbackDetail) {
  if (item.status === 'REJECTED') return { label: 'Ngày không tiếp nhận', value: dateTime(item.closedAt) };
  if (item.status === 'RESOLVED' || item.status === 'CLOSED') {
    return { label: item.closureReason === 'RESOLVED' ? 'Hoàn thành' : 'Kết thúc', value: dateTime(item.resolvedAt || item.closedAt) };
  }
  return null;
}

function TrackDetail({ item, credentials, showSecret, onUpdate, onReload, onReset }: {
  item: PublicFeedbackDetail;
  credentials: Credentials;
  showSecret: boolean;
  onUpdate: (detail: PublicFeedbackDetail) => void;
  onReload: () => Promise<void>;
  onReset: () => void;
}) {
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reopen, setReopen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const running = useRef(false);
  const status = FEEDBACK_STATUS[item.status];
  const deadline = nextDeadline(item);
  const thirdMeta = deadline ? { label: deadline.label, value: date(deadline.at), hint: until(deadline.at) } : closingMeta(item);
  const thread = withoutResultEcho(item.messages, item.resolutionSummary);
  const done = ['RESOLVED', 'CLOSED', 'REJECTED'].includes(item.status);
  const canMessage = ['WAITING_CITIZEN', 'IN_PROGRESS', 'REOPENED'].includes(item.status);
  const canAttach = ['RECEIVED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_CITIZEN', 'REOPENED'].includes(item.status) && item.attachments.length < MAX_FILES;
  const canRate = ['RESOLVED', 'CLOSED'].includes(item.status) && item.closureReason === 'RESOLVED' && item.rating === null && !item.reopenRequestedAt;
  const decidedAt = item.closedAt ?? item.resolvedAt;
  const canReopen = done && !item.reopenRequestedAt && item.reopenRequestCount < 3 && Boolean(decidedAt) && Date.now() - new Date(decidedAt!).getTime() <= APPEAL_MS;

  async function run(key: string, action: () => Promise<PublicFeedbackDetail>, success: string) {
    if (running.current) return false;
    running.current = true;
    setBusy(key);
    try {
      onUpdate(await action());
      message.success(success);
      return true;
    } catch (actionError) {
      message.error(errorText(actionError));
      if (actionError instanceof ApiError && actionError.status === 409) await onReload();
      return false;
    } finally {
      running.current = false;
      setBusy(null);
    }
  }

  async function reload() {
    if (running.current) return;
    running.current = true;
    setBusy('reload');
    try {
      await onReload();
    } finally {
      running.current = false;
      setBusy(null);
    }
  }

  const base = `/public/feedbacks/${encodeURIComponent(item.code)}`;
  const common = { lookupSecret: credentials.secret, expectedVersion: item.version };

  async function download(id: string, name: string) {
    try {
      const blob = await http.blob(`${base}/attachments/${id}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookupSecret: credentials.secret }),
      });
      saveBlob(blob, name);
    } catch (downloadError) {
      message.error(errorText(downloadError));
    }
  }

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={16}>
        <Card className="fbp-gap">
          <Space size={[6, 6]} wrap>
            <Tag color={status.color} variant="filled" style={{ marginInlineEnd: 0 }}>
              {status.label}
            </Tag>
            <Tag style={{ marginInlineEnd: 0 }}>{FEEDBACK_CATEGORY[item.category]}</Tag>
            <span className="fbp-mono fbp-code-text">{item.code}</span>
          </Space>
          {showSecret && (
            <div className="fbp-track-secret">
              <span>Mã bảo mật</span>
              <span className="fbp-mono">{credentials.secret}</span>
              <CopyValue value={credentials.secret} label="mã bảo mật" />
            </div>
          )}
          <h1 className="fbp-title">{item.title}</h1>
          {item.status !== 'REJECTED' && (
            <Steps
              size="small"
              current={stageOf(item.status)}
              className="fbp-steps"
              items={STAGES.map((_key, index) => ({ title: ['Tiếp nhận', 'Đang xử lý', 'Có kết quả', 'Hoàn tất'][index] }))}
            />
          )}
          <MetaGrid
            items={[
              { label: 'Đơn vị xử lý', value: item.departmentName || 'Đang phân công' },
              { label: 'Tiếp nhận', value: dateTime(item.createdAt) },
              ...(thirdMeta ? [thirdMeta] : []),
              { label: 'Cập nhật', value: dateTime(item.updatedAt) },
            ]}
          />
        </Card>

        {item.status === 'WAITING_CITIZEN' && (
          <Alert
            type="warning"
            showIcon
            className="fbp-gap"
            title="Đơn vị xử lý đề nghị bổ sung thông tin"
            description={<>
              {item.citizenResponseDueAt && <div>Hạn bổ sung: {dateTime(item.citizenResponseDueAt)}</div>}
              <a href="#feedback-conversation">Xem trao đổi và gửi thông tin bổ sung →</a>
            </>}
          />
        )}

        {(item.resolutionSummary || item.rejectionReason) && (
          <Card title={item.rejectionReason ? 'Lý do không tiếp nhận' : 'Kết quả xử lý'} className="fbp-gap fbp-result-card">
            <div className="fbp-result">{item.resolutionSummary || item.rejectionReason}</div>
          </Card>
        )}

        <Card title="Nội dung phản ánh" className="fbp-gap">
          <div className="fbp-text">{item.content}</div>
          {item.address && <div className="fbp-sub">Địa điểm: {item.address}</div>}
        </Card>

        {(thread.length > 0 || canMessage) && (
          <Card id="feedback-conversation" title="Trao đổi" className="fbp-gap">
            {thread.length > 0 ? <MessageThread messages={thread} selfLabel="Bạn" /> : null}
            {canMessage && (
              <div className="fbp-composer">
                <Input.TextArea value={text} onChange={event => setText(event.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} maxLength={3000} showCount placeholder="Thông tin bổ sung cho đơn vị xử lý" />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  disabled={Boolean(busy) || text.trim().length < 3}
                  loading={busy === 'message'}
                  onClick={() => void run('message', () => http.post<PublicFeedbackDetail>(`${base}/messages`, { ...common, message: text.trim() }), 'Đã gửi thông tin bổ sung').then(ok => ok && setText(''))}
                >
                  Gửi
                </Button>
              </div>
            )}
          </Card>
        )}

        {(item.attachments.length > 0 || canAttach) && (
          <Card title={`Tệp minh chứng (${item.attachments.length})`} className="fbp-gap">
            {item.attachments.length > 0 && (
              <ul className="fbp-files">
                {item.attachments.map(file => (
                  <li key={file.id}>
                    <PaperClipOutlined />
                    <button type="button" className="fbp-file" onClick={() => void download(file.id, file.originalName)}>
                      {file.originalName}
                    </button>
                    <span className="fbp-sub">
                      {fileSize(file.size)} · {date(file.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canAttach && (
              <div className="fbp-composer">
                <Upload multiple accept={ACCEPT.join(',')} fileList={files} beforeUpload={() => false} onChange={({ fileList }) => setFiles(fileList.slice(0, MAX_FILES - item.attachments.length))}>
                  <Button icon={<PaperClipOutlined />}>Chọn tệp</Button>
                </Upload>
                <Button
                  disabled={Boolean(busy) || !files.length}
                  loading={busy === 'files'}
                  onClick={() => {
                    const problem = filesError(files);
                    if (problem) {
                      message.error(problem);
                      return;
                    }
                    void run('files', async () => {
                      const uploaded = await http.post<Pick<PublicFeedbackDetail, 'attachments' | 'version'>>(`${base}/attachments`, attachmentForm(files, credentials.secret, item.version));
                      return { ...item, attachments: uploaded.attachments, version: uploaded.version };
                    }, 'Đã bổ sung tệp').then(ok => ok && setFiles([]));
                  }}
                >
                  Gửi tệp
                </Button>
              </div>
            )}
          </Card>
        )}

        {item.rating !== null ? (
          <Card title="Đánh giá của bạn" className="fbp-gap">
            <Rate disabled value={item.rating} character={<StarFilled />} />
            {item.ratingComment && <div className="fbp-text fbp-gap-top">{item.ratingComment}</div>}
          </Card>
        ) : (
          canRate && (
            <Card title="Đánh giá kết quả xử lý" className="fbp-gap">
              <Rate value={rating} onChange={setRating} character={<StarFilled />} tooltips={['Rất không hài lòng', 'Không hài lòng', 'Bình thường', 'Hài lòng', 'Rất hài lòng']} />
              <Input.TextArea value={comment} onChange={event => setComment(event.target.value)} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={1000} placeholder="Nhận xét (không bắt buộc)" className="fbp-gap-top" />
              <Button
                type="primary"
                className="fbp-gap-top"
                disabled={Boolean(busy) || !rating}
                loading={busy === 'rate'}
                onClick={() => void run('rate', () => http.post<PublicFeedbackDetail>(`${base}/rating`, { ...common, rating, comment: comment.trim() || undefined }), 'Cảm ơn bạn đã đánh giá')}
              >
                Gửi đánh giá
              </Button>
            </Card>
          )
        )}

        {(item.reopenRequestedAt || item.reopenRequestDecision) && (
          <Alert
            className="fbp-gap"
            showIcon
            type={item.reopenRequestedAt ? 'info' : item.reopenRequestDecision === 'APPROVED' ? 'success' : 'warning'}
            title={item.reopenRequestedAt ? 'Đề nghị xem xét lại đang chờ xử lý' : item.reopenRequestDecision === 'APPROVED' ? 'Đề nghị xem xét lại đã được chấp nhận' : 'Đề nghị xem xét lại không được chấp nhận'}
            description={item.reopenRequestedAt ? item.reopenRequestReason : item.reopenRequestDecisionNote}
          />
        )}
      </Col>

      <Col xs={24} lg={8}>
        <div className="fbp-aside">
          <Card title="Quá trình xử lý">
            <details className="fbp-history">
              <summary>Xem các mốc xử lý ({item.events.length})</summary>
              <EventTimeline events={item.events} />
            </details>
          </Card>
          <Card>
            <div className="fbp-cta">
              {canReopen && (
                <Button block icon={<RedoOutlined />} disabled={Boolean(busy)} onClick={() => setReopen(true)}>
                  Đề nghị xem xét lại
                </Button>
              )}
              <Button block onClick={() => void reload()} disabled={Boolean(busy)} loading={busy === 'reload'}>
                Tải lại hồ sơ
              </Button>
              <Button block type="text" icon={<FileSearchOutlined />} disabled={Boolean(busy)} onClick={onReset}>
                Tra cứu phản ánh khác
              </Button>
            </div>
          </Card>
        </div>
      </Col>

      <Modal
        title="Đề nghị xem xét lại"
        open={reopen}
        onCancel={() => setReopen(false)}
        okText="Gửi đề nghị"
        okButtonProps={{ disabled: Boolean(busy) || reason.trim().length < 10, loading: busy === 'reopen' }}
        onOk={() => void run('reopen', () => http.post<PublicFeedbackDetail>(`${base}/reopen`, { ...common, reason: reason.trim() }), 'Đã gửi đề nghị xem xét lại').then(ok => ok && (setReopen(false), setReason('')))}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Form.Item label="Lý do" htmlFor="feedback-reopen-reason" required help={reason.trim().length > 0 && reason.trim().length < 10 ? 'Ít nhất 10 ký tự' : undefined} validateStatus={reason.trim().length > 0 && reason.trim().length < 10 ? 'error' : undefined}>
            <Input.TextArea id="feedback-reopen-reason" value={reason} onChange={event => setReason(event.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  );
}

function TrackTab({ initial, onChange, showSecret }: { initial: Credentials | null; onChange: (next: Credentials | null) => void; showSecret: boolean }) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Credentials>();
  const [credentials, setCredentials] = useState<Credentials | null>(initial);
  const [item, setItem] = useState<PublicFeedbackDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = useRef(false);

  async function load(next: Credentials, { reload = false } = {}) {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setError(null);
    try {
      const detail = await http.post<PublicFeedbackDetail>('/public/feedbacks/track', { code: next.code.trim().toUpperCase(), lookupSecret: normalizeSecret(next.secret) });
      const saved = { code: detail.code, secret: normalizeSecret(next.secret) };
      setCredentials(saved);
      onChange(saved);
      setItem(detail);
    } catch (loadError) {
      const invalid = loadError instanceof ApiError && [401, 403, 404].includes(loadError.status);
      if (reload && item && !invalid) {
        message.error(errorText(loadError));
      } else {
        setItem(null);
        setError(errorText(loadError));
        form.setFieldsValue(next);
        if (invalid) onChange(null);
      }
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initial?.secret) void load(initial);
    else if (initial?.code) form.setFieldsValue({ code: initial.code });
    // chỉ chạy khi mở tab với thông tin có sẵn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (item && credentials) {
    return (
      <TrackDetail
        item={item}
        credentials={credentials}
        showSecret={showSecret}
        onUpdate={setItem}
        onReload={() => load(credentials, { reload: true })}
        onReset={() => {
          setItem(null);
          setCredentials(null);
          onChange(null);
          setError(null);
          form.resetFields();
        }}
      />
    );
  }

  return (
    <Row justify="center">
      <Col xs={24} md={16} lg={10}>
        <Card title="Tra cứu phản ánh">
          <p className="fbp-intro">Nhập mã phản ánh và mã bảo mật trên biên nhận bạn nhận được sau khi gửi phản ánh.</p>
          {busy && initial?.secret && !error ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : (
            <Form form={form} layout="vertical" onFinish={values => void load(values)} requiredMark={false}>
              <Form.Item name="code" label="Mã phản ánh" rules={[{ required: true, whitespace: true, message: 'Nhập mã phản ánh' }, { min: 8, message: 'Mã phản ánh chưa đúng' }]}>
                <Input maxLength={30} autoComplete="off" autoCapitalize="characters" spellCheck={false} className="fbp-mono" placeholder="PA-2026-…" />
              </Form.Item>
              <Form.Item name="secret" label="Mã bảo mật" rules={[{ required: true, whitespace: true, message: 'Nhập mã bảo mật' }, { min: 20, message: 'Mã bảo mật chưa đủ ký tự' }]}>
                <Input.Password maxLength={64} autoComplete="off" spellCheck={false} className="fbp-mono" placeholder="Nhập hoặc dán mã bảo mật" />
              </Form.Item>
              {error && <Alert type="error" showIcon title={error} className="fbp-gap" />}
              <Button type="primary" htmlType="submit" icon={<FileSearchOutlined />} loading={busy} block size="large">
                Tra cứu
              </Button>
            </Form>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ---------------------------------------------------------------- Kết quả đã công khai

function PublishedTab() {
  const list = useApi<PublishedFeedback[]>('/public/feedbacks/published');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FeedbackCategory>();
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLocaleLowerCase('vi').trim();
  const query = normalize(search);
  const filtered = (list.data ?? []).filter(item =>
    (!category || item.category === category) &&
    normalize([item.publicTitle, item.publicSummary, item.code, item.department?.name].filter(Boolean).join(' ')).includes(query),
  );
  if (list.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (list.error) return <Result status="warning" title="Chưa tải được danh sách" subTitle={errorText(list.error)} extra={<Button onClick={() => void list.refetch()}>Thử lại</Button>} />;
  if (!list.data?.length) return <Empty description="Chưa có kết quả được công khai" />;
  return (
    <>
    <div className="fbp-filters">
      <Input aria-label="Tìm kết quả công khai" prefix={<SearchOutlined />} placeholder="Tìm theo nội dung, mã phản ánh, đơn vị…" allowClear value={search} onChange={event => setSearch(event.target.value)} />
      <Select aria-label="Lọc theo lĩnh vực" placeholder="Tất cả lĩnh vực" allowClear options={options(FEEDBACK_CATEGORY)} value={category} onChange={setCategory} />
    </div>
    <p className="fbp-intro" role="status">{filtered.length} kết quả trong danh sách công khai</p>
    <div className="fbp-published">
      {filtered.map(item => (
        <Link key={item.code} to={`/phan-anh/cong-khai/${encodeURIComponent(item.code)}`} className="fbp-pub-card">
          <span className="fbp-sub">{[item.category ? FEEDBACK_CATEGORY[item.category] : null, item.department?.name].filter(Boolean).join(' · ')}</span>
          <strong>{item.publicTitle || 'Kết quả xử lý phản ánh'}</strong>
          {item.publicSummary && <span className="fbp-clamp"><span className="fbp-result-label">Tóm tắt phản ánh</span>{item.publicSummary}</span>}
          <span className="fbp-read-result">Xem kết quả xử lý →</span>
          <span className="fbp-sub fbp-pub-foot">
            <span className="fbp-mono">{item.code}</span>
            <span>Công khai {date(item.publicPublishedAt)}</span>
          </span>
        </Link>
      ))}
    </div>
    {!filtered.length && <Empty description="Không có kết quả phù hợp"><Button onClick={() => { setSearch(''); setCategory(undefined); }}>Xóa bộ lọc</Button></Empty>}
    </>
  );
}

// ---------------------------------------------------------------- Trang

const TABS = [
  { key: 'gui', label: 'Gửi phản ánh', short: 'Gửi phản ánh', icon: <FormOutlined /> },
  { key: 'tra-cuu', label: 'Tra cứu phản ánh', short: 'Tra cứu', icon: <FileSearchOutlined /> },
  { key: 'cong-khai', label: 'Kết quả đã công khai', short: 'Đã công khai', icon: <CheckCircleFilled /> },
];

export default function FeedbackPublic() {
  const [params, setParams] = useSearchParams();
  const screens = Grid.useBreakpoint();
  const requested = params.get('tab');
  const tab = TABS.some(item => item.key === requested) ? requested! : 'gui';
  const [handoff, setHandoff] = useState<Credentials | null>(() => (params.get('ma') ? { code: params.get('ma')!, secret: '' } : null));
  const [trackKey, setTrackKey] = useState(0);
  const [receipt, setReceipt] = useState<Created | null>(null);

  function open(next: string) {
    setParams(next === 'gui' ? {} : { tab: next }, { replace: false });
    window.scrollTo({ top: 0 });
  }

  return (
    <PublicShell title={TABS.find(item => item.key === tab)?.label}>
      <section className="fbp-band">
        <div className="pub-container">
          <h1>Phản ánh, kiến nghị</h1>
          <p className="fbp-band-description">Gửi ý kiến, theo dõi tiến độ và xem kết quả xử lý tại địa phương.</p>
          <Tabs
            activeKey={tab}
            onChange={open}
            className="fbp-tabs"
            items={TABS.map(item => ({ key: item.key, label: screens.sm ? item.label : item.short, icon: screens.sm ? item.icon : undefined }))}
          />
        </div>
      </section>
      <div className="pub-container fbp-body">
        {tab === 'gui' && (
          <SubmitTab
            receipt={receipt}
            onCreated={setReceipt}
            onAgain={() => setReceipt(null)}
            onTrack={(code, secret) => {
              setHandoff({ code, secret });
              setTrackKey(key => key + 1);
              open('tra-cuu');
            }}
          />
        )}
        {tab === 'tra-cuu' && <TrackTab key={trackKey} initial={handoff} onChange={setHandoff} showSecret={Boolean(receipt && receipt.code === handoff?.code && receipt.lookupSecret === handoff.secret)} />}
        {tab === 'cong-khai' && <PublishedTab />}
      </div>
    </PublicShell>
  );
}
