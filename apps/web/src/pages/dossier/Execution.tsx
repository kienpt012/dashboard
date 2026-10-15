import { CalculatorOutlined, CheckOutlined, CloseOutlined, DatabaseOutlined, LinkOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, App, Button, Flex, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReasonModal } from '@/components/ReasonModal';
import { NoData } from '@/components/States';
import { DeptTag, ReviewTag } from '@/components/Tags';
import { http } from '@/lib/api';
import { date, dateTime, num } from '@/lib/format';
import { APPROVERS, can, isGlobal, LEADERSHIP } from '@/lib/roles';
import { useDossier, useDossierRun, type DossierData, type DossierReport } from './context';
import { EvidenceList, EvidencePicker, uploadEvidenceFiles } from './evidence';

export function valueText(value: number | null | undefined, unit: string) {
  return `${num(value)}${unit ? ` ${unit}` : ''}`;
}

/** Kỳ mặc định: kỳ hiện tại nếu chưa báo cáo, nếu không thì kỳ thiếu gần nhất. */
function defaultPeriod(d: DossierData) {
  const current = d.periods.find(period => period.key === d.currentPeriodKey);
  if (current && !current.reported) return current.key;
  const missing = [...d.periods].reverse().find(period => !period.reported && period.overdue);
  return missing?.key ?? current?.key ?? d.periods[d.periods.length - 1]?.key ?? '';
}

type ReportValues = { periodKey: string; value: number; valueText?: string; dataSource?: string; explanation?: string; note?: string };

export function ReportModal({ open, presetPeriod, onClose }: { open: boolean; presetPeriod?: string; onClose: () => void }) {
  const { d, me } = useDossier();
  const run = useDossierRun();
  const { message } = App.useApp();
  const [form] = Form.useForm<ReportValues>();
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const leader = can(me, LEADERSHIP);
  const periodKey = Form.useWatch('periodKey', form);
  const value = Form.useWatch('value', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue({ periodKey: presetPeriod || defaultPeriod(d) });
    setFiles([]);
  }, [open, presetPeriod, d, form]);

  const period = d.periods.find(item => item.key === periodKey);
  const reaches = typeof value === 'number' && d.kind !== 'STAT' && (d.direction === 'LOWER_IS_BETTER' ? value <= d.targetValue : value >= d.targetValue);
  const late = Boolean(period?.overdue && !period.reported);
  const behind = d.kind !== 'STAT' && typeof value === 'number' && !reaches && (d.status === 'AT_RISK' || d.status === 'OVERDUE');
  const needsExplanation = late || behind;

  async function submit(values: ReportValues) {
    setSaving(true);
    const result = await run(async () => {
      const response = await http.post<{ reviewStatus: 'PENDING' | 'APPROVED'; message?: string; update?: { id: string } }>(`/targets/${d.id}/progress`, {
        value: values.value,
        valueText: values.valueText?.trim() || undefined,
        periodKey: values.periodKey,
        dataSource: values.dataSource?.trim() || undefined,
        explanation: values.explanation?.trim() || undefined,
        note: values.note?.trim() || undefined,
        baseVersion: d.version,
      });
      if (files.length) {
        let updateId = response?.update?.id;
        if (!updateId) {
          const fresh = await http.get<DossierData>(`/targets/${d.id}/dossier`);
          updateId = fresh.reports.find(report => report.user.id === me.id && report.periodKey === values.periodKey)?.id;
        }
        const failures = await uploadEvidenceFiles(d.id, files, updateId ? { progressUpdateId: updateId } : {});
        if (failures.length) message.warning(`Chưa tải được: ${failures.join('; ')}`);
      }
      return response;
    }, leader ? 'Đã ghi nhận số liệu' : 'Đã gửi báo cáo, chờ duyệt');
    setSaving(false);
    if (result) onClose();
  }

  return (
    <Modal
      title="Báo cáo số liệu"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={leader ? 'Ghi nhận' : 'Gửi báo cáo'}
      okButtonProps={{ icon: <SendOutlined /> }}
      confirmLoading={saving}
      width={680}
      destroyOnHidden
      mask={{ closable: false }}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {d.code} · {d.title}
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={values => void submit(values)} className="form-grid">
        <Form.Item name="periodKey" label="Kỳ báo cáo" rules={[{ required: true, message: 'Chọn kỳ' }]}>
          <Select
            options={d.periods.map(item => ({
              value: item.key,
              label: `${item.label}${item.reported ? ' · đã báo cáo' : item.overdue ? ' · quá hạn' : ` · hạn ${date(item.deadline)}`}`,
            }))}
          />
        </Form.Item>
        <Form.Item
          name="value"
          label={`Giá trị thực hiện${d.unit ? ` (${d.unit})` : ''}`}
          extra={d.kind === 'STAT' ? undefined : `Chỉ tiêu giao: ${d.targetText || valueText(d.targetValue, d.unit)}`}
          rules={[{ required: true, message: 'Nhập giá trị' }]}
        >
          <InputNumber min={0} style={{ width: '100%' }} decimalSeparator="," autoFocus />
        </Form.Item>
        <Form.Item name="valueText" label="Ghi bằng chữ" className="span-2">
          <Input maxLength={300} placeholder="Ví dụ: Đạt; 12/15 hồ sơ" />
        </Form.Item>
        <Form.Item
          name="dataSource"
          label="Nguồn số liệu"
          className="span-2"
          dependencies={['note']}
          rules={[
            ({ getFieldValue }) => ({
              validator: (_, current: string | undefined) =>
                leader || current?.trim() || getFieldValue('note')?.trim() ? Promise.resolve() : Promise.reject(new Error('Ghi nguồn số liệu hoặc ghi chú')),
            }),
          ]}
        >
          <Input maxLength={500} placeholder={d.dataSourceSystem || 'Hệ thống, sổ sách hoặc cơ quan cung cấp'} />
        </Form.Item>
        <Form.Item
          name="explanation"
          label="Giải trình"
          className="span-2"
          required={needsExplanation}
          help={needsExplanation ? (late ? `${period?.label ?? 'Kỳ này'} đã quá hạn báo cáo: nêu lý do nộp muộn` : 'Chỉ tiêu đang chậm: nêu nguyên nhân và hướng khắc phục') : undefined}
          validateStatus={needsExplanation ? 'warning' : undefined}
          rules={[{ validator: (_, current: string | undefined) => (!needsExplanation || current?.trim() ? Promise.resolve() : Promise.reject(new Error('Cần giải trình'))) }]}
        >
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú" className="span-2">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} />
        </Form.Item>
        <Form.Item label="Minh chứng" className="span-2" extra={d.evidenceRequirement ? `Yêu cầu: ${d.evidenceRequirement}` : 'Ảnh hoặc PDF, tối đa 10MB mỗi tệp'}>
          <EvidencePicker files={files} onChange={setFiles} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PeriodStrip({ onPick, canReport }: { onPick: (key: string) => void; canReport: boolean }) {
  const { d } = useDossier();
  const missing = d.periods.filter(period => period.overdue && !period.reported).length;
  return (
    <div className="period-strip">
      <Flex gap={6} wrap>
        {d.periods.map(period => {
          const state = period.reported ? 'reported' : period.overdue ? 'overdue' : period.key === d.currentPeriodKey ? 'current' : 'future';
          const tip = `${period.label}: ${period.reported ? 'đã báo cáo' : period.overdue ? `quá hạn từ ${date(period.deadline)}` : `hạn ${date(period.deadline)}`}`;
          const clickable = canReport && !period.reported;
          return (
            <Tooltip key={period.key} title={clickable ? `${tip} · bấm để báo cáo` : tip}>
              <button type="button" className={`period ${state}`} disabled={!clickable} onClick={() => onPick(period.key)}>
                {period.label.replace(/\/\d{4}$/, '').replace(/ năm \d{4}$/, '')}
              </button>
            </Tooltip>
          );
        })}
      </Flex>
      {missing > 0 && (
        <Typography.Text type="danger" style={{ fontSize: 12 }}>
          {missing} kỳ quá hạn chưa báo cáo · hạn ngày {d.reportDueDay ?? 20} tháng cuối kỳ
        </Typography.Text>
      )}
    </div>
  );
}

const AGG: Record<string, string> = { count: 'Đếm', sum: 'Tổng', avg: 'Trung bình', min: 'Nhỏ nhất', max: 'Lớn nhất', countDistinct: 'Đếm giá trị khác nhau' };

function Formula() {
  const { d } = useDossier();
  const formula = d.formula;
  if (!formula) return <Alert type="warning" showIcon title="Chưa đọc được công thức tự tính của chỉ tiêu này" style={{ marginBottom: 16 }} />;
  return (
    <div className="formula">
      <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
        <CalculatorOutlined />
        <Typography.Text strong>Cách tính</Typography.Text>
      </Flex>
      <code className="formula-text">{formula.text}</code>
      <Space size={16} wrap style={{ marginTop: 10 }}>
        <span>
          Kết quả: <b>{formula.result.value === null ? 'chưa tính được' : valueText(formula.result.value, d.unit)}</b>
        </span>
        {formula.result.score !== null && (
          <span>
            Điểm: <b>{num(formula.result.score)}</b>
            {d.maxScore ? ` / ${num(d.maxScore)}` : ''}
          </span>
        )}
        {d.computedAt && <span className="muted">Tính lúc {dateTime(d.computedAt)}</span>}
      </Space>
      {formula.result.traces.length > 0 && (
        <ul className="formula-traces">
          {formula.result.traces.map((trace, index) => {
            const dataset = formula.datasets.find(item => item.code === trace.dataset);
            return (
              <li key={`${trace.dataset}-${index}`}>
                <DatabaseOutlined /> <Link to={`/admin/kho-du-lieu/${trace.dataset}`}>{dataset?.name ?? trace.dataset}</Link> · {AGG[trace.agg] ?? trace.agg}
                {trace.column ? ` cột ${trace.column}` : ''}: {num(trace.matched)}/{num(trace.total)} dòng khớp
                {trace.value !== null ? ` → ${num(trace.value)}` : ''}
              </li>
            );
          })}
        </ul>
      )}
      {formula.result.warnings.map(warning => (
        <Alert key={warning} type="warning" showIcon title={warning} style={{ marginTop: 8 }} />
      ))}
    </div>
  );
}

function Children() {
  const { d } = useDossier();
  return (
    <Table
      size="small"
      rowKey="id"
      pagination={false}
      dataSource={d.children}
      style={{ marginBottom: 20 }}
      scroll={{ x: 640 }}
      title={() => <Typography.Text strong>Chỉ tiêu con ({d.children.length})</Typography.Text>}
      columns={[
        {
          title: 'Chỉ tiêu',
          key: 'title',
          render: (_, child) => (
            <Link to={`/admin/targets/${child.id}`}>
              {child.standardCode || child.ordinal ? <span className="muted">{child.standardCode || child.ordinal} </span> : null}
              {child.title}
            </Link>
          ),
        },
        {
          title: 'Phụ trách',
          key: 'owner',
          width: 200,
          render: (_, child) => (
            <div className="cell-title">
              <DeptTag name={child.department.name} color={child.department.color} />
              <span>{child.assignee?.fullName ?? 'Chưa giao người'}</span>
            </div>
          ),
        },
        {
          title: 'Giao',
          key: 'plan',
          width: 110,
          align: 'right',
          render: (_, child) => (child.kind === 'SCORE' ? `${num(child.maxScore ?? child.targetValue)} điểm` : child.targetText || valueText(child.targetValue, child.unit)),
        },
        {
          title: 'Thực hiện',
          key: 'current',
          width: 110,
          align: 'right',
          render: (_, child) => (child.lastReportedAt ? (child.kind === 'SCORE' ? `${num(child.currentValue)} điểm` : valueText(child.currentValue, child.unit)) : <span className="muted">Chưa có</span>),
        },
      ]}
    />
  );
}

function ReportItem({ report }: { report: DossierReport }) {
  const { d, me } = useDossier();
  const run = useDossierRun();
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const sameScope = isGlobal(me) || me.departmentId === d.department.id;
  const canReview = report.reviewStatus === 'PENDING' && can(me, APPROVERS) && sameScope && report.user.id !== me.id && !d.isArchived;

  async function review(decision: 'APPROVE' | 'REJECT', reviewNote?: string) {
    setBusy(true);
    const done = await run(() => http.patch(`/targets/updates/${report.id}/review`, { decision, reviewNote }), decision === 'APPROVE' ? 'Đã duyệt báo cáo' : 'Đã trả lại báo cáo');
    setBusy(false);
    if (done !== undefined) setRejecting(false);
  }

  return (
    <div className={`entry report-${report.reviewStatus.toLowerCase()}`}>
      <Flex justify="space-between" align="flex-start" gap={12} wrap>
        <div>
          <Space size={10} wrap align="baseline">
            <span className="entry-value">{report.valueText || valueText(report.value, d.unit)}</span>
            {report.periodLabel && <Tag>{report.periodLabel}</Tag>}
          </Space>
          {report.valueText && <div className="entry-meta">Giá trị số: {valueText(report.value, d.unit)}</div>}
        </div>
        <ReviewTag status={report.reviewStatus} auto={report.autoApproved} />
      </Flex>
      {report.dataSource && (
        <div className="entry-line">
          <span className="entry-label">Nguồn</span>
          {report.dataSource}
        </div>
      )}
      {report.explanation && (
        <div className="entry-line">
          <span className="entry-label">Giải trình</span>
          {report.explanation}
        </div>
      )}
      {report.note && (
        <div className="entry-line">
          <span className="entry-label">Ghi chú</span>
          {report.note}
        </div>
      )}
      {report.reviewStatus === 'REJECTED' && report.reviewNote && (
        <div className="entry-line tone-bad">
          <span className="entry-label">Lý do trả lại</span>
          {report.reviewNote}
        </div>
      )}
      <EvidenceList targetId={d.id} items={report.evidences} />
      <Flex justify="space-between" align="center" gap={12} wrap style={{ marginTop: 8 }}>
        <span className="entry-meta">
          {report.user.fullName} · {dateTime(report.createdAt)}
          {report.reviewStatus !== 'PENDING' &&
            (report.autoApproved
              ? ` · tự thông qua${report.reviewedAt ? ` ${dateTime(report.reviewedAt)}` : ''}`
              : report.reviewerName
                ? ` · ${report.reviewStatus === 'APPROVED' ? 'duyệt' : 'trả lại'} bởi ${report.reviewerName}${report.reviewedAt ? ` ${dateTime(report.reviewedAt)}` : ''}`
                : '')}
        </span>
        {canReview && (
          <Space>
            <Button size="small" icon={<CloseOutlined />} disabled={busy} onClick={() => setRejecting(true)}>
              Trả lại
            </Button>
            <Button size="small" type="primary" icon={<CheckOutlined />} loading={busy} onClick={() => void review('APPROVE')}>
              Duyệt
            </Button>
          </Space>
        )}
      </Flex>
      <ReasonModal
        open={rejecting}
        title="Trả lại báo cáo"
        label="Lý do trả lại"
        okText="Trả lại"
        danger
        min={3}
        loading={busy}
        onCancel={() => setRejecting(false)}
        onSubmit={reason => void review('REJECT', reason)}
      />
    </div>
  );
}

function LinkEvidenceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { d } = useDossier();
  const run = useDossierRun();
  const [form] = Form.useForm<{ title: string; url: string; note?: string }>();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Thêm liên kết minh chứng" open={open} onCancel={onClose} onOk={() => form.submit()} okText="Thêm" confirmLoading={busy} destroyOnHidden width={560}>
      <Form
        form={form}
        layout="vertical"
       
        onFinish={async values => {
          setBusy(true);
          const done = await run(() => http.post(`/targets/${d.id}/evidence`, { kind: 'LINK', title: values.title.trim(), url: values.url.trim(), note: values.note?.trim() || undefined }), 'Đã thêm minh chứng');
          setBusy(false);
          if (done !== undefined) onClose();
        }}
      >
        <Form.Item name="title" label="Tên minh chứng" rules={[{ required: true, min: 3, max: 300, message: 'Ít nhất 3 ký tự' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="url" label="Đường dẫn" rules={[{ required: true, pattern: /^https?:\/\/\S{3,}$/, message: 'Đường dẫn bắt đầu bằng http:// hoặc https://' }]}>
          <Input placeholder="https://" />
        </Form.Item>
        <Form.Item name="note" label="Ghi chú">
          <Input maxLength={1000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function ExecutionTab({ onReport, canReport }: { onReport: (periodKey?: string) => void; canReport: boolean }) {
  const { d } = useDossier();
  const [linking, setLinking] = useState(false);
  const manual = d.valueSource === 'MANUAL';
  return (
    <div className="tab-body">
      {manual && d.periods.length > 0 && <PeriodStrip onPick={onReport} canReport={canReport} />}
      {d.valueSource === 'COMPUTED' && <Formula />}
      {d.valueSource === 'CHILDREN' && (
        <Alert type="info" showIcon title="Số liệu tổng hợp từ các chỉ tiêu con" style={{ marginBottom: 16 }} />
      )}
      {d.children.length > 0 && <Children />}

      <Flex justify="space-between" align="center" className="tab-section-head">
        <Typography.Text strong>Báo cáo số liệu ({d.reports.length})</Typography.Text>
        {canReport && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => onReport()}>
            Báo cáo
          </Button>
        )}
      </Flex>
      {d.reports.length ? d.reports.map(report => <ReportItem key={report.id} report={report} />) : <NoData text="Chưa có báo cáo" />}

      {(d.evidences.length > 0 || d.permissions.canContribute) && (
        <>
          <Flex justify="space-between" align="center" className="tab-section-head" style={{ marginTop: 24 }}>
            <Typography.Text strong>Minh chứng chung ({d.evidences.length})</Typography.Text>
            {d.permissions.canContribute && !d.isArchived && (
              <Button size="small" icon={<LinkOutlined />} onClick={() => setLinking(true)}>
                Thêm liên kết
              </Button>
            )}
          </Flex>
          {d.evidences.length ? <EvidenceList targetId={d.id} items={d.evidences} /> : <Typography.Text type="secondary">Chưa có minh chứng chung</Typography.Text>}
        </>
      )}
      <LinkEvidenceModal open={linking} onClose={() => setLinking(false)} />
    </div>
  );
}
