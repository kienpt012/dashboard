import { CheckCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Checkbox, ColorPicker, Descriptions, Flex, Form, Input, InputNumber, Result, Segmented, Select, Space, Steps, Table, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LOCALITY_KEY } from '@/app/locality';
import { YearSelect } from '@/components/Data';
import { Page } from '@/components/Page';
import { LoadError, PageSkeleton } from '@/components/States';
import { KindTag } from '@/components/Tags';
import { invalidate, useApi } from '@/hooks/useApi';
import { errorText, http } from '@/lib/api';
import { num } from '@/lib/format';
import type { FrameworkTemplate } from '@/types/domain';
import { DEPARTMENT_KIND } from './Departments';

type OrgDepartment = { code: string; name: string; shortName?: string; kind: string; role: string; color?: string; responsibilities?: string; optional?: boolean };
type OrgTemplate = { kind: string; key: string; label: string; note?: string; departments: OrgDepartment[] };
type SettingsShape = { reportAutoApproveDays: number; proposalAutoApproveDays: number; explanationDueDays: number; assignmentStallDays: number; maxTransfers: number; wallboardRotateSeconds: number };
type Templates = {
  year: number;
  localityKinds: { value: string; label: string }[];
  orgTemplates: OrgTemplate[];
  frameworkTemplates: FrameworkTemplate[];
  existingDepartments: { id: string; code: string; name: string; isActive: boolean }[];
  settings: SettingsShape;
};
type Locality = {
  kind: string;
  name: string;
  agencyName: string;
  shortName: string;
  provinceName?: string | null;
  adminUnitCode?: string | null;
  agencyCode?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  emailDomain?: string | null;
  primaryColor: string;
  configured?: boolean;
};
type ApplyResult = { departments: { created: number; updated: number }; frameworks: ({ key: string; error: string } | { key: string; created?: number; skipped?: boolean })[] };
type Dept = OrgDepartment & { selected: boolean };

const SETTING_FIELDS: { key: keyof SettingsShape; label: string; min: number; max: number; unit: string }[] = [
  { key: 'reportAutoApproveDays', label: 'Tự thông qua báo cáo sau', min: 0, max: 60, unit: 'ngày' },
  { key: 'proposalAutoApproveDays', label: 'Tự thông qua đề xuất sau', min: 0, max: 30, unit: 'ngày' },
  { key: 'explanationDueDays', label: 'Hạn trả lời giải trình', min: 1, max: 30, unit: 'ngày' },
  { key: 'assignmentStallDays', label: 'Nhắc chưa giao người sau', min: 0, max: 30, unit: 'ngày' },
  { key: 'maxTransfers', label: 'Số lần chuyển việc tối đa', min: 0, max: 5, unit: 'lần' },
  { key: 'wallboardRotateSeconds', label: 'Trình chiếu chuyển trang sau', min: 5, max: 300, unit: 'giây' },
];

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function Wizard({ templates, current }: { templates: Templates; current: Locality }) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [step, setStep] = useState(0);
  const [form] = Form.useForm();
  const [settingsForm] = Form.useForm<SettingsShape>();
  const kind = Form.useWatch('kind', form) ?? current.kind;
  const shortName = Form.useWatch('shortName', form) as string | undefined;
  const [orgKey, setOrgKey] = useState('');
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [frameworkKeys, setFrameworkKeys] = useState<string[]>([]);
  const [year, setYear] = useState(templates.year);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const existing = useMemo(() => new Set(templates.existingDepartments.map(item => item.code.toUpperCase())), [templates]);

  function chooseOrg(org: OrgTemplate) {
    setOrgKey(org.key);
    setDepartments(org.departments.map(item => ({ ...item, selected: !item.optional || existing.has(item.code.toUpperCase()) })));
  }

  useEffect(() => {
    form.setFieldsValue({ ...current, primaryColor: current.primaryColor || '#1d4ed8' });
    settingsForm.setFieldsValue(templates.settings);
    const org = templates.orgTemplates.find(item => item.kind === current.kind) ?? templates.orgTemplates[0];
    if (org) chooseOrg(org);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orgs = templates.orgTemplates.filter(item => item.kind === kind);
  const suitable = (template: FrameworkTemplate) => !template.scope.localityKinds.length || template.scope.localityKinds.includes(kind);

  function localityPayload() {
    const values = form.getFieldsValue(true);
    const color = typeof values.primaryColor === 'string' ? values.primaryColor : values.primaryColor?.toHexString?.() ?? '#1d4ed8';
    return {
      kind: values.kind,
      name: values.name?.trim(),
      agencyName: values.agencyName?.trim(),
      shortName: values.shortName?.trim(),
      provinceName: text(values.provinceName),
      adminUnitCode: text(values.adminUnitCode),
      agencyCode: text(values.agencyCode),
      address: text(values.address),
      phone: text(values.phone),
      email: text(values.email),
      website: text(values.website),
      emailDomain: text(values.emailDomain),
      primaryColor: color,
    };
  }

  async function next() {
    try {
      if (step === 0) await form.validateFields();
      if (step === 1 && !departments.some(item => item.selected)) {
        message.warning('Chọn ít nhất một phòng ban');
        return;
      }
      if (step === 3) await settingsForm.validateFields();
      setStep(value => value + 1);
    } catch {
      /* lỗi hiện ngay trên ô nhập */
    }
  }

  async function saveLocality() {
    try {
      await form.validateFields();
    } catch {
      return;
    }
    setBusy(true);
    try {
      await http.put('/locality', localityPayload());
      await client.invalidateQueries({ queryKey: LOCALITY_KEY });
      message.success('Đã lưu thông tin địa phương');
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const response = await http.post<ApplyResult>('/setup/apply', {
        locality: localityPayload(),
        departments: departments
          .filter(item => item.selected)
          .map(item => ({ code: item.code, name: item.name.trim(), shortName: item.shortName?.trim() || undefined, kind: item.kind, color: item.color, responsibilities: item.responsibilities?.trim() || undefined })),
        frameworkTemplates: frameworkKeys,
        year,
        settings: settingsForm.getFieldsValue(true),
      });
      setResult(response);
      await Promise.all([client.invalidateQueries({ queryKey: LOCALITY_KEY }), invalidate(client, ['/departments', '/frameworks', '/targets', '/ioc', '/settings'])]);
    } catch (error) {
      message.error(errorText(error, 'Không áp dụng được thiết lập'));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const name = (key: string) => templates.frameworkTemplates.find(template => template.key === key)?.sampleName ?? key;
    return (
      <Card>
        <Result
          status="success"
          title="Đã thiết lập địa phương"
          subTitle={`Phòng ban: tạo mới ${result.departments.created}, cập nhật ${result.departments.updated}`}
          extra={
            <Space>
              <Link to="/admin">
                <Button type="primary">Về trung tâm điều hành</Button>
              </Link>
              <Link to="/admin/bo-chi-tieu">
                <Button>Bộ chỉ tiêu</Button>
              </Link>
            </Space>
          }
        >
          {result.frameworks.length > 0 && (
            <ul className="plain-list">
              {result.frameworks.map(item => (
                <li key={item.key} className={'error' in item ? 'tone-bad' : undefined}>
                  {name(item.key)}: {'error' in item ? item.error : `đã nạp cho năm ${year}`}
                </li>
              ))}
            </ul>
          )}
        </Result>
      </Card>
    );
  }

  return (
    <Card>
      <Steps
        current={step}
        onChange={value => value < step && setStep(value)}
        items={[{ title: 'Địa phương' }, { title: 'Cơ cấu tổ chức' }, { title: 'Bộ chỉ tiêu' }, { title: 'Thời hạn' }, { title: 'Áp dụng' }]}
        style={{ marginBottom: 28 }}
      />

      <div style={{ display: step === 0 ? 'block' : 'none' }}>
        <Form form={form} layout="vertical" className="form-grid">
          <Form.Item name="kind" label="Loại đơn vị" rules={[{ required: true }]}>
            <Select
              options={templates.localityKinds}
              onChange={value => {
                const org = templates.orgTemplates.find(item => item.kind === value);
                if (org) chooseOrg(org);
              }}
            />
          </Form.Item>
          <Form.Item name="name" label="Tên đơn vị" rules={[{ required: true, min: 3, max: 160 }]}>
            <Input placeholder="Phường Lái Thiêu" />
          </Form.Item>
          <Form.Item name="agencyName" label="Tên cơ quan" rules={[{ required: true, min: 3, max: 200 }]}>
            <Input placeholder="UBND phường Lái Thiêu" />
          </Form.Item>
          <Form.Item name="shortName" label="Tên ngắn" extra={`Tên ứng dụng: IOC ${shortName?.trim() ?? ''}`} rules={[{ required: true, max: 40 }]}>
            <Input placeholder="Lái Thiêu" />
          </Form.Item>
          <Form.Item name="provinceName" label="Tỉnh / Thành phố">
            <Input />
          </Form.Item>
          <Form.Item name="adminUnitCode" label="Mã đơn vị hành chính" rules={[{ pattern: /^\d{5}$/, message: 'Gồm 5 chữ số' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="agencyCode" label="Mã định danh cơ quan">
            <Input />
          </Form.Item>
          <Form.Item name="primaryColor" label="Màu chủ đạo">
            <ColorPicker showText format="hex" disabledAlpha />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ" className="span-2">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Điện thoại">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email liên hệ" rules={[{ type: 'email', message: 'Email không hợp lệ' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="website" label="Trang thông tin" rules={[{ pattern: /^https?:\/\/\S+$/, message: 'Bắt đầu bằng http:// hoặc https://' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="emailDomain" label="Tên miền email công vụ">
            <Input placeholder="laithieu.gov.vn" />
          </Form.Item>
        </Form>
        <Button icon={<SaveOutlined />} loading={busy} onClick={() => void saveLocality()}>
          Chỉ lưu thông tin địa phương
        </Button>
      </div>

      {step === 1 && (
        <Flex vertical gap={12}>
          {orgs.length > 1 && <Segmented value={orgKey} onChange={value => chooseOrg(orgs.find(item => item.key === value)!)} options={orgs.map(item => ({ value: item.key, label: item.label }))} />}
          <Table
            size="middle"
            rowKey="code"
            pagination={false}
            dataSource={departments}
            rowSelection={{
              selectedRowKeys: departments.filter(item => item.selected).map(item => item.code),
              onChange: keys => setDepartments(list => list.map(item => ({ ...item, selected: keys.includes(item.code) }))),
            }}
            scroll={{ x: 760 }}
            columns={[
              {
                title: 'Tên phòng ban',
                key: 'name',
                render: (_, item) => (
                  <Input
                    value={item.name}
                    status={item.selected && item.name.trim().length < 2 ? 'error' : undefined}
                    onChange={event => setDepartments(list => list.map(entry => (entry.code === item.code ? { ...entry, name: event.target.value } : entry)))}
                  />
                ),
              },
              { title: 'Mã', dataIndex: 'code', width: 110 },
              { title: 'Loại', dataIndex: 'kind', width: 200, render: (value: string) => DEPARTMENT_KIND[value as keyof typeof DEPARTMENT_KIND] ?? value },
              { title: '', key: 'state', width: 120, render: (_, item) => (existing.has(item.code.toUpperCase()) ? <Tag color="blue">Đã có</Tag> : item.optional ? <Tag>Tuỳ chọn</Tag> : null) },
            ]}
          />
        </Flex>
      )}

      {step === 2 && (
        <Flex vertical gap={12}>
          <Flex gap={8} align="center">
            <Typography.Text>Nạp cho năm</Typography.Text>
            <YearSelect value={year} onChange={setYear} />
          </Flex>
          {templates.frameworkTemplates.map(template => (
            <Card key={template.key} size="small" className={frameworkKeys.includes(template.key) ? 'card-selected' : undefined}>
              <Checkbox
                checked={frameworkKeys.includes(template.key)}
                onChange={event => setFrameworkKeys(list => (event.target.checked ? [...list, template.key] : list.filter(key => key !== template.key)))}
              >
                <Typography.Text strong>{template.sampleName}</Typography.Text>
              </Checkbox>
              <div style={{ paddingInlineStart: 24, marginTop: 6 }}>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {template.legalBasis}
                </Typography.Text>
                <Space size={[6, 6]} wrap style={{ marginTop: 6, display: 'flex' }}>
                  <KindTag kind={template.kind} />
                  <Tag>{num(template.targetCount)} chỉ tiêu</Tag>
                  {template.computedCount > 0 && <Tag color="cyan">{num(template.computedCount)} tự tính</Tag>}
                  {!suitable(template) && <Tag color="orange">Không đúng loại đơn vị</Tag>}
                  {(template.appliedYears ?? []).filter(Boolean).map(applied => (
                    <Tag key={String(applied)} color="blue">
                      Đã nạp {applied}
                    </Tag>
                  ))}
                </Space>
              </div>
            </Card>
          ))}
        </Flex>
      )}

      <div style={{ display: step === 3 ? 'block' : 'none' }}>
        <Form form={settingsForm} layout="vertical" className="form-grid" style={{ maxWidth: 720 }}>
          {SETTING_FIELDS.map(field => (
            <Form.Item key={field.key} name={field.key} label={field.label} rules={[{ required: true, type: 'number', min: field.min, max: field.max, message: `Từ ${field.min} đến ${field.max}` }]}>
              <InputNumber min={field.min} max={field.max} style={{ width: '100%' }} suffix={field.unit} />
            </Form.Item>
          ))}
        </Form>
      </div>

      {step === 4 && (
        <Descriptions
          bordered
          size="small"
          column={1}
          items={[
            { label: 'Đơn vị', children: `${form.getFieldValue('name') ?? ''} · ${form.getFieldValue('agencyName') ?? ''}` },
            { label: 'Tên ứng dụng', children: `IOC ${form.getFieldValue('shortName') ?? ''}` },
            { label: 'Phòng ban', children: `${departments.filter(item => item.selected).length} đơn vị` },
            {
              label: 'Bộ chỉ tiêu',
              children: frameworkKeys.length ? frameworkKeys.map(key => templates.frameworkTemplates.find(item => item.key === key)?.sampleName ?? key).join('; ') + ` (năm ${year})` : 'Không nạp',
            },
            {
              label: 'Thời hạn',
              children: SETTING_FIELDS.map(field => `${field.label.toLocaleLowerCase('vi')}: ${settingsForm.getFieldValue(field.key)} ${field.unit}`).join('; '),
            },
          ]}
        />
      )}

      <Flex justify="space-between" style={{ marginTop: 24 }}>
        <Button disabled={step === 0} onClick={() => setStep(value => value - 1)}>
          Quay lại
        </Button>
        {step < 4 ? (
          <Button type="primary" onClick={() => void next()}>
            Tiếp tục
          </Button>
        ) : (
          <Button type="primary" icon={<CheckCircleOutlined />} loading={busy} onClick={() => void apply()}>
            Áp dụng thiết lập
          </Button>
        )}
      </Flex>
    </Card>
  );
}

export default function Setup() {
  const templates = useApi<Templates>('/setup/templates', { staleTime: Infinity });
  const locality = useApi<Locality>('/locality', { staleTime: Infinity });
  return (
    <Page title="Thiết lập địa phương">
      {templates.error || locality.error ? (
        <LoadError error={templates.error ?? locality.error} retry={() => void Promise.all([templates.refetch(), locality.refetch()])} />
      ) : templates.data && locality.data ? (
        <Wizard templates={templates.data} current={locality.data} />
      ) : (
        <PageSkeleton />
      )}
    </Page>
  );
}
