import { SaveOutlined } from '@ant-design/icons';
import { Button, Card, Col, Form, InputNumber, Row, Switch } from 'antd';
import { useEffect } from 'react';
import { Page } from '@/components/Page';
import { PageSkeleton, Query } from '@/components/States';
import { useAction, useApi } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { dateTime } from '@/lib/format';

type Settings = {
  version: number;
  defaultYear: number;
  warningDays: number;
  riskThreshold: number;
  feedbackFirstResponseDays: number;
  feedbackResolutionDays: number;
  feedbackCitizenResponseDays: number;
  reportAutoApproveDays: number;
  proposalAutoApproveDays: number;
  explanationDueDays: number;
  assignmentStallDays: number;
  maxTransfers: number;
  wallboardRotateSeconds: number;
  jarvisIntro: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

type Field = { name: keyof Settings; label: string; min: number; max: number; unit: string } | { name: keyof Settings; label: string; kind: 'switch'; extra: string };

const GROUPS: { title: string; fields: Field[] }[] = [
  {
    title: 'Kế hoạch và cảnh báo',
    fields: [
      { name: 'defaultYear', label: 'Năm kế hoạch mặc định', min: 2000, max: 2100, unit: '' },
      { name: 'warningDays', label: 'Cảnh báo trước hạn', min: 1, max: 365, unit: 'ngày' },
      { name: 'riskThreshold', label: 'Ngưỡng có nguy cơ', min: 0, max: 100, unit: '%' },
    ],
  },
  {
    title: 'Thời hạn trách nhiệm',
    fields: [
      { name: 'reportAutoApproveDays', label: 'Tự thông qua báo cáo sau', min: 0, max: 60, unit: 'ngày' },
      { name: 'proposalAutoApproveDays', label: 'Tự thông qua đề xuất sau', min: 0, max: 30, unit: 'ngày' },
      { name: 'explanationDueDays', label: 'Hạn trả lời giải trình', min: 1, max: 30, unit: 'ngày' },
      { name: 'assignmentStallDays', label: 'Nhắc chưa giao người sau', min: 0, max: 30, unit: 'ngày' },
      { name: 'maxTransfers', label: 'Số lần chuyển việc tối đa', min: 0, max: 5, unit: 'lần' },
    ],
  },
  {
    title: 'Phản ánh người dân',
    fields: [
      { name: 'feedbackFirstResponseDays', label: 'Hạn phản hồi đầu tiên', min: 1, max: 30, unit: 'ngày' },
      { name: 'feedbackResolutionDays', label: 'Hạn xử lý', min: 1, max: 365, unit: 'ngày' },
      { name: 'feedbackCitizenResponseDays', label: 'Hạn người dân bổ sung', min: 1, max: 60, unit: 'ngày' },
    ],
  },
  {
    title: 'Trình chiếu và Jarvis',
    fields: [
      { name: 'wallboardRotateSeconds', label: 'Chuyển trang sau', min: 5, max: 300, unit: 'giây' },
      { name: 'jarvisIntro', label: 'Hiệu ứng khi gọi Jarvis', kind: 'switch', extra: 'Hình ảnh toàn màn hình khi gọi Jarvis' },
    ],
  },
];

function SettingsForm({ data }: { data: Settings }) {
  const [form] = Form.useForm<Settings>();
  useEffect(() => form.setFieldsValue(data), [data, form]);
  const save = useAction((values: Partial<Settings>) => http.patch('/settings', { ...values, expectedVersion: data.version }), { success: 'Đã lưu cấu hình', refresh: ['/settings', '/ioc'] });
  return (
    <Form form={form} layout="vertical" onFinish={values => save.mutate(values)}>
      <Row gutter={[16, 16]}>
        {GROUPS.map(group => (
          <Col key={group.title} xs={24} lg={12}>
            <Card title={group.title} style={{ height: '100%' }}>
              <div className="form-grid">
                {group.fields.map(field =>
                  'kind' in field ? (
                    <Form.Item key={field.name} name={field.name} label={field.label} valuePropName="checked" extra={field.extra}>
                      <Switch />
                    </Form.Item>
                  ) : (
                    <Form.Item key={field.name} name={field.name} label={field.label} rules={[{ required: true, type: 'number', min: field.min, max: field.max, message: `Từ ${field.min} đến ${field.max}` }]}>
                      <InputNumber min={field.min} max={field.max} style={{ width: '100%' }} suffix={field.unit || undefined} />
                    </Form.Item>
                  ),
                )}
              </div>
            </Card>
          </Col>
        ))}
      </Row>
      <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={save.isPending} style={{ marginTop: 16 }}>
        Lưu cấu hình
      </Button>
    </Form>
  );
}

export default function Settings() {
  const query = useApi<Settings>('/settings');
  return (
    <Page title="Cấu hình" meta={query.data?.updatedAt && <span>Cập nhật {dateTime(query.data.updatedAt)}{query.data.updatedBy ? ` · ${query.data.updatedBy}` : ''}</span>}>
      <Query query={query} skeleton={<PageSkeleton />}>
        {data => <SettingsForm data={data} />}
      </Query>
    </Page>
  );
}
