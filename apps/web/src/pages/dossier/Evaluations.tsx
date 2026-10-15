import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Flex, Form, Input, InputNumber, Modal, Radio, Select, Space, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { NoData } from '@/components/States';
import { EvaluationTag } from '@/components/Tags';
import { http } from '@/lib/api';
import { dateTime, num } from '@/lib/format';
import { periodLabel, periodsOfYear } from '@/lib/periods';
import type { EvaluationResult } from '@/types/domain';
import { useDossier, useDossierRun } from './context';
import { EvidenceList } from './evidence';

const RESULTS: { value: EvaluationResult; label: string }[] = [
  { value: 'EXCEEDED', label: 'Vượt' },
  { value: 'ACHIEVED', label: 'Đạt' },
  { value: 'PARTIAL', label: 'Đạt một phần' },
  { value: 'NOT_ACHIEVED', label: 'Không đạt' },
];

type Values = { periodKey: string; result: EvaluationResult; score?: number | null; note?: string; correctiveAction?: string };

export function EvaluationModal({ open, presetPeriod, onClose }: { open: boolean; presetPeriod?: string; onClose: () => void }) {
  const { d } = useDossier();
  const run = useDossierRun();
  const [form] = Form.useForm<Values>();
  const [saving, setSaving] = useState(false);
  const periods = useMemo(() => periodsOfYear(d.frequency, d.year), [d.frequency, d.year]);
  const periodKey = Form.useWatch('periodKey', form);
  const result = Form.useWatch('result', form);
  const existing = d.evaluations.find(item => item.periodKey === periodKey);
  const notMet = result === 'PARTIAL' || result === 'NOT_ACHIEVED';

  function fill(key: string) {
    const found = d.evaluations.find(item => item.periodKey === key);
    form.setFieldsValue({ periodKey: key, result: found?.result ?? 'ACHIEVED', score: found?.score ?? undefined, note: found?.note ?? '', correctiveAction: found?.correctiveAction ?? '' });
  }

  useEffect(() => {
    if (open) fill(presetPeriod && periods.includes(presetPeriod) ? presetPeriod : periods.includes(d.currentPeriodKey) ? d.currentPeriodKey : periods[periods.length - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetPeriod]);

  async function submit(values: Values) {
    setSaving(true);
    const done = await run(
      () =>
        http.post(`/targets/${d.id}/evaluations`, {
          periodKey: values.periodKey,
          result: values.result,
          score: typeof values.score === 'number' ? values.score : undefined,
          note: values.note?.trim() || undefined,
          correctiveAction: values.correctiveAction?.trim() || undefined,
          expectedVersion: existing?.version,
        }),
      'Đã lưu đánh giá',
    );
    setSaving(false);
    if (done !== undefined) onClose();
  }

  return (
    <Modal title={existing ? 'Sửa đánh giá' : 'Đánh giá kết quả'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu đánh giá" confirmLoading={saving} width={620} destroyOnHidden mask={{ closable: false }}>
      <Form form={form} layout="vertical" onFinish={values => void submit(values)}>
        <div className="form-grid">
          <Form.Item name="periodKey" label="Kỳ đánh giá" rules={[{ required: true }]}>
            <Select onChange={value => fill(value)} options={periods.map(key => ({ value: key, label: `${periodLabel(key)}${d.evaluations.some(item => item.periodKey === key) ? ' · đã đánh giá' : ''}` }))} />
          </Form.Item>
          {d.kind === 'SCORE' && (
            <Form.Item name="score" label={`Điểm${d.maxScore ? ` (tối đa ${num(d.maxScore)})` : ''}`}>
              <InputNumber min={0} max={d.maxScore ?? 1000} style={{ width: '100%' }} decimalSeparator="," />
            </Form.Item>
          )}
        </div>
        <Form.Item name="result" label="Kết quả" rules={[{ required: true }]}>
          <Radio.Group optionType="button" buttonStyle="solid" options={RESULTS} />
        </Form.Item>
        <Form.Item
          name="note"
          label={notMet ? 'Nguyên nhân chưa đạt' : 'Nhận xét'}
          required={notMet}
          rules={[{ validator: (_, value: string | undefined) => (!notMet || value?.trim() ? Promise.resolve() : Promise.reject(new Error('Nêu nguyên nhân chưa đạt'))) }]}
        >
          <Input.TextArea autoSize={{ minRows: 3, maxRows: 6 }} maxLength={2000} />
        </Form.Item>
        <Form.Item name="correctiveAction" label="Biện pháp khắc phục">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export function EvaluationsTab({ onEvaluate }: { onEvaluate: (periodKey?: string) => void }) {
  const { d } = useDossier();
  return (
    <div className="tab-body">
      <Flex justify="space-between" align="center" className="tab-section-head">
        <Typography.Text strong>Đánh giá theo kỳ ({d.evaluations.length})</Typography.Text>
        {d.permissions.canEvaluate && !d.isArchived && (
          <Button size="small" icon={<PlusOutlined />} onClick={() => onEvaluate()}>
            Đánh giá
          </Button>
        )}
      </Flex>
      {d.evaluations.length ? (
        d.evaluations.map(item => (
          <div key={item.id} className="entry">
            <Flex justify="space-between" align="center" gap={12}>
              <Space size={10} wrap>
                <Typography.Text strong>{item.periodLabel || periodLabel(item.periodKey)}</Typography.Text>
                <EvaluationTag result={item.result} />
                {item.score !== null && item.score !== undefined && <span className="muted">{num(item.score)} điểm</span>}
              </Space>
              {d.permissions.canEvaluate && !d.isArchived && (
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => onEvaluate(item.periodKey)}>
                  Sửa
                </Button>
              )}
            </Flex>
            {item.note && (
              <div className="entry-line">
                <span className="entry-label">{item.result === 'ACHIEVED' || item.result === 'EXCEEDED' ? 'Nhận xét' : 'Nguyên nhân'}</span>
                {item.note}
              </div>
            )}
            {item.correctiveAction && (
              <div className="entry-line">
                <span className="entry-label">Khắc phục</span>
                {item.correctiveAction}
              </div>
            )}
            <EvidenceList targetId={d.id} items={item.evidences} />
            <div className="entry-meta" style={{ marginTop: 6 }}>
              {item.evaluatedByName} · {dateTime(item.evaluatedAt)}
            </div>
          </div>
        ))
      ) : (
        <NoData text="Chưa có đánh giá" />
      )}
    </div>
  );
}
