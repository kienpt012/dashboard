import { AppstoreAddOutlined, CalculatorOutlined, EditOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Descriptions, Drawer, Dropdown, Empty, Flex, Form, Input, InputNumber, Modal, Result, Row, Segmented, Select, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLocality, type PublicLocality } from '@/app/locality';
import { useMe } from '@/app/session';
import { DistBar, YearSelect } from '@/components/Data';
import { Page } from '@/components/Page';
import { LoadError, PageSkeleton } from '@/components/States';
import { LegalBasis } from '@/components/LegalBasis';
import { KindTag } from '@/components/Tags';
import { useAction, useApi } from '@/hooks/useApi';
import { http } from '@/lib/api';
import { currentYear, num, pct } from '@/lib/format';
import { can, FRAMEWORK_EDITORS, LEADERSHIP } from '@/lib/roles';
import { fold } from '@/app/nav';
import type { Framework, FrameworkKind, FrameworkTemplate, IssuingLevel } from '@/types/domain';

type ApplyResult = { frameworkId: string; code: string; name: string; createdTargets: number; createdDatasets: string[]; computedTargets: number; needsPlanValue: number };
type Outcome = { targetId: string; code: string; title: string; previousValue: number; value: number | null; changed: boolean; warnings: string[] };

const LOCALITY_KINDS: Record<string, string> = { XA: 'Xã', PHUONG: 'Phường', DAC_KHU: 'Đặc khu', TRUONG_HOC: 'Trường học', CO_QUAN_KHAC: 'Cơ quan khác' };
const ISSUING: { value: IssuingLevel; label: string }[] = [
  { value: 'CENTRAL', label: 'Trung ương giao' },
  { value: 'PROVINCE', label: 'Tỉnh/Thành phố giao' },
  { value: 'LOCAL', label: 'Địa phương tự đặt' },
];
const KINDS: { value: FrameworkKind; label: string }[] = [
  { value: 'PLAN', label: 'Kế hoạch – thực hiện' },
  { value: 'SCORE', label: 'Chấm điểm' },
  { value: 'STAT', label: 'Thống kê' },
  { value: 'TASK', label: 'Nhiệm vụ' },
];

function nameForYear(template: FrameworkTemplate, year: number) {
  return template.effectiveYear ? template.sampleName.replace(`năm ${template.effectiveYear}`, `năm ${year}`) : template.sampleName;
}

function scopeText(template: FrameworkTemplate) {
  const kinds = template.scope.localityKinds.map(kind => LOCALITY_KINDS[kind] ?? kind).join(', ');
  return template.scope.province ? `${kinds} thuộc ${template.scope.province}` : `${kinds} trên cả nước`;
}

function fits(template: FrameworkTemplate, locality: PublicLocality) {
  if (!locality.configured) return null;
  const kindOk = template.scope.localityKinds.includes(locality.kind);
  const provinceOk = !template.scope.province || !locality.provinceName || fold(template.scope.province) === fold(locality.provinceName);
  return kindOk && provinceOk;
}

function result(framework: Framework) {
  const s = framework.summary;
  if (framework.kind === 'SCORE') return { label: 'Điểm', value: s.score === null ? '—' : `${num(s.score)} / ${num(s.maxScore ?? framework.maxScore ?? 100)}` };
  if (framework.kind === 'STAT') return { label: 'Có số liệu', value: `${num(s.reported)} / ${num(s.total)}` };
  return { label: 'Tiến độ', value: s.progress === null ? '—' : pct(s.progress) };
}

function FrameworkForm({ open, framework, year, onClose }: { open: boolean; framework?: Framework | null; year: number; onClose: () => void }) {
  const [form] = Form.useForm();
  const kind = Form.useWatch('kind', form);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (framework)
      form.setFieldsValue({
        name: framework.name,
        issuingLevel: framework.issuingLevel,
        legalBasis: framework.legalBasis ?? '',
        description: framework.description ?? '',
        showOnWallboard: framework.showOnWallboard,
        isActive: framework.isActive,
      });
    else form.setFieldsValue({ kind: 'PLAN', issuingLevel: 'LOCAL', year, showOnWallboard: true, maxScore: 100 });
  }, [open, framework, form, year]);

  const save = useAction(
    (values: Record<string, unknown>) =>
      framework ? http.patch(`/frameworks/${framework.id}`, { ...values, expectedVersion: framework.version }) : http.post('/frameworks', { ...values, maxScore: values.kind === 'SCORE' ? values.maxScore : undefined }),
    { success: framework ? 'Đã cập nhật bộ chỉ tiêu' : 'Đã tạo bộ chỉ tiêu', refresh: ['/frameworks', '/ioc'], onDone: onClose },
  );

  return (
    <Modal title={framework ? 'Sửa bộ chỉ tiêu' : 'Tạo bộ chỉ tiêu'} open={open} onCancel={onClose} onOk={() => form.submit()} okText="Lưu" confirmLoading={save.isPending} width={640} destroyOnHidden>
      <Form form={form} layout="vertical" onFinish={values => save.mutate(values)} className="form-grid">
        {!framework && (
          <Form.Item name="code" label="Mã bộ" rules={[{ required: true, pattern: /^[A-Z0-9][A-Z0-9_-]{1,39}$/, message: 'Chữ in hoa không dấu, số, gạch ngang (2–40 ký tự)' }]}>
            <Input placeholder="KH-2026" />
          </Form.Item>
        )}
        {!framework && (
          <Form.Item name="year" label="Năm" rules={[{ required: true }]}>
            <InputNumber min={2000} max={2100} style={{ width: '100%' }} />
          </Form.Item>
        )}
        <Form.Item name="name" label="Tên bộ chỉ tiêu" className="span-2" rules={[{ required: true, min: 3, max: 200, message: '3–200 ký tự' }]}>
          <Input />
        </Form.Item>
        {!framework && (
          <Form.Item name="kind" label="Loại" rules={[{ required: true }]}>
            <Select options={KINDS} />
          </Form.Item>
        )}
        <Form.Item name="issuingLevel" label="Cấp giao" rules={[{ required: true }]}>
          <Select options={ISSUING} />
        </Form.Item>
        {!framework && kind === 'SCORE' && (
          <Form.Item name="maxScore" label="Điểm tối đa">
            <InputNumber min={1} max={1000} style={{ width: '100%' }} />
          </Form.Item>
        )}
        <Form.Item name="legalBasis" label="Căn cứ" className="span-2">
          <Input maxLength={300} />
        </Form.Item>
        <Form.Item name="description" label="Mô tả" className="span-2">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={2000} />
        </Form.Item>
        <Form.Item name="showOnWallboard" label="Hiện trên trình chiếu" valuePropName="checked">
          <Switch />
        </Form.Item>
        {framework && (
          <Form.Item name="isActive" label="Đang sử dụng" valuePropName="checked">
            <Switch />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}

function TemplateLibrary({ open, frameworks, onClose }: { open: boolean; frameworks: Framework[]; onClose: () => void }) {
  const locality = useLocality();
  const { modal } = App.useApp();
  const templates = useApi<FrameworkTemplate[]>(open ? '/frameworks/templates' : null, { staleTime: 10 * 60_000 });
  const [years, setYears] = useState<Record<string, number>>({});
  const apply = useAction(({ template, year }: { template: FrameworkTemplate; year: number }) => http.post<ApplyResult>(`/frameworks/templates/${encodeURIComponent(template.key)}/apply`, { year }), {
    refresh: ['/frameworks', '/targets', '/ioc', '/datasets'],
    onDone: done =>
      modal.success({
        title: `Đã nạp ${done.name}`,
        width: 520,
        content: (
          <Descriptions
            size="small"
            column={1}
            items={[
              { label: 'Mã bộ', children: done.code },
              { label: 'Chỉ tiêu đã tạo', children: num(done.createdTargets) },
              { label: 'Tự tính từ dữ liệu', children: num(done.computedTargets) },
              { label: 'Cần nhập mục tiêu', children: num(done.needsPlanValue) },
              { label: 'Bảng dữ liệu mới', children: done.createdDatasets.length ? done.createdDatasets.join(', ') : 'Không' },
            ]}
          />
        ),
      }),
  });

  return (
    <Drawer title="Thư viện bộ chỉ tiêu mẫu" open={open} onClose={onClose} size={720}>
      {templates.error ? (
        <LoadError error={templates.error} retry={() => void templates.refetch()} />
      ) : (
        <Flex vertical gap={12}>
          {(templates.data ?? []).map(template => {
            const year = years[template.key] ?? template.effectiveYear ?? currentYear();
            const existing = frameworks.find(item => item.templateKey === template.key && item.year === year);
            const fit = fits(template, locality);
            return (
              <Card key={template.key} size="small">
                <Flex vertical gap={8}>
                  <Flex justify="space-between" gap={12} align="flex-start">
                    <Typography.Text strong>{nameForYear(template, year)}</Typography.Text>
                    <KindTag kind={template.kind} />
                  </Flex>
                  <span className="fw-basis">
                    <LegalBasis text={template.legalBasis} />
                  </span>
                  <Space size={[6, 6]} wrap>
                    <Tag>{ISSUING.find(item => item.value === template.issuingLevel)?.label}</Tag>
                    <Tag color={fit === false ? 'orange' : fit ? 'green' : 'default'}>{scopeText(template)}</Tag>
                    <Tag>{num(template.targetCount)} chỉ tiêu</Tag>
                    {template.computedCount > 0 && <Tag color="cyan">{num(template.computedCount)} tự tính</Tag>}
                    {template.datasetCount > 0 && <Tag>{num(template.datasetCount)} bảng dữ liệu</Tag>}
                    {(template.appliedYears ?? []).filter(Boolean).map(applied => (
                      <Tag key={String(applied)} color="blue">
                        Đã nạp {applied}
                      </Tag>
                    ))}
                  </Space>
                  <Flex gap={8} align="center" justify="flex-end" wrap>
                    <YearSelect value={year} onChange={value => setYears(current => ({ ...current, [template.key]: value }))} />
                    <Tooltip title={existing ? `Năm ${year} đã nạp (${existing.code})` : undefined}>
                      <Button
                        type="primary"
                        icon={<AppstoreAddOutlined />}
                        disabled={Boolean(existing)}
                        loading={apply.isPending && apply.variables?.template.key === template.key}
                        onClick={() =>
                          modal.confirm({
                            title: `Nạp bộ mẫu vào năm ${year}?`,
                            content: `${nameForYear(template, year)} — ${num(template.targetCount)} chỉ tiêu.`,
                            okText: 'Nạp',
                            onOk: () => apply.mutateAsync({ template, year }),
                          })
                        }
                      >
                        Nạp
                      </Button>
                    </Tooltip>
                  </Flex>
                </Flex>
              </Card>
            );
          })}
          {templates.isLoading && <PageSkeleton />}
        </Flex>
      )}
    </Drawer>
  );
}

function RecomputeResult({ data, onClose }: { data: { framework: Framework; outcomes: Outcome[] } | null; onClose: () => void }) {
  return (
    <Modal title={data ? `Tính lại: ${data.framework.name}` : ''} open={Boolean(data)} onCancel={onClose} footer={<Button onClick={onClose}>Đóng</Button>} width={760} destroyOnHidden>
      {data && !data.outcomes.length ? (
        <Result status="info" title="Bộ này chưa có chỉ tiêu tự tính" />
      ) : (
        <Table
          size="small"
          rowKey="targetId"
          pagination={false}
          dataSource={data?.outcomes ?? []}
          columns={[
            { title: 'Chỉ tiêu', key: 'title', render: (_, row) => <Link to={`/admin/targets/${row.targetId}`}>{row.code} · {row.title}</Link> },
            { title: 'Trước', dataIndex: 'previousValue', width: 90, align: 'right', render: value => num(value) },
            { title: 'Sau', dataIndex: 'value', width: 90, align: 'right', render: (value, row) => <b className={row.changed ? 'tone-info' : undefined}>{num(value)}</b> },
            { title: 'Lưu ý', dataIndex: 'warnings', width: 220, render: (warnings: string[]) => (warnings.length ? <span className="tone-warn">{warnings.join('; ')}</span> : '') },
          ]}
        />
      )}
    </Modal>
  );
}

function FrameworkCard({ framework, onEdit, onRecompute, recomputing }: { framework: Framework; onEdit: () => void; onRecompute: () => void; recomputing: boolean }) {
  const user = useMe();
  const editor = can(user, FRAMEWORK_EDITORS);
  const s = framework.summary;
  const r = result(framework);
  const toggle = useAction((changes: Record<string, unknown>) => http.patch(`/frameworks/${framework.id}`, { ...changes, expectedVersion: framework.version }), {
    success: 'Đã cập nhật',
    refresh: ['/frameworks', '/ioc'],
  });
  return (
    <Card
      className={`fw-card${framework.isActive ? '' : ' inactive'}`}
      title={
        <Link to={`/admin/targets?frameworkId=${framework.id}&year=${framework.year ?? ''}`} className="fw-title">
          {framework.name}
        </Link>
      }
      extra={
        editor && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'edit', icon: <EditOutlined />, label: 'Sửa', onClick: onEdit },
                { key: 'recompute', icon: <CalculatorOutlined />, label: 'Tính lại chỉ tiêu tự tính', onClick: onRecompute, disabled: recomputing },
                { type: 'divider' },
                { key: 'wall', label: framework.showOnWallboard ? 'Ẩn khỏi trình chiếu' : 'Hiện trên trình chiếu', onClick: () => toggle.mutate({ showOnWallboard: !framework.showOnWallboard }) },
                { key: 'active', danger: framework.isActive, label: framework.isActive ? 'Ngừng sử dụng' : 'Dùng lại', onClick: () => toggle.mutate({ isActive: !framework.isActive }) },
              ],
            }}
          >
            <Button type="text" icon={<MoreOutlined />} aria-label="Thao tác" loading={recomputing} />
          </Dropdown>
        )
      }
    >
      <Space size={[6, 6]} wrap style={{ marginBottom: 10 }}>
        <KindTag kind={framework.kind} />
        <Tag>{framework.issuingLevelLabel}</Tag>
        <Tag>{framework.code}</Tag>
        {!framework.isActive && <Tag color="default">Ngừng sử dụng</Tag>}
        {!framework.showOnWallboard && <Tag>Không trình chiếu</Tag>}
      </Space>
      {framework.legalBasis && (
        <div className="fw-basis">
          <LegalBasis text={framework.legalBasis} />
        </div>
      )}
      <div className="fw-stats">
        <div>
          <span>Chỉ tiêu</span>
          <b>{num(s.total)}</b>
        </div>
        <div>
          <span>{r.label}</span>
          <b>{r.value}</b>
        </div>
        <div>
          <span>Có chỉ đạo</span>
          <b>
            {num(s.withDirective)}
            <small>/{num(s.total)}</small>
          </b>
        </div>
        <div>
          <span>Đã đánh giá</span>
          <b>
            {num(s.withEvaluation)}
            <small>/{num(s.total)}</small>
          </b>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <DistBar counts={s.counts} total={s.total} />
      </div>
    </Card>
  );
}

export default function Frameworks() {
  const user = useMe();
  const [params, setParams] = useSearchParams();
  const year = Number(params.get('year')) || currentYear();
  const [show, setShow] = useState<'active' | 'all'>('active');
  const [library, setLibrary] = useState(false);
  const [editing, setEditing] = useState<Framework | null | undefined>(undefined);
  const [recomputed, setRecomputed] = useState<{ framework: Framework; outcomes: Outcome[] } | null>(null);
  const list = useApi<Framework[]>('/frameworks?includeInactive=true');
  const recompute = useAction((framework: Framework) => http.post<{ recomputed: Outcome[] }>(`/frameworks/${framework.id}/recompute`), {
    refresh: ['/frameworks', '/targets', '/ioc'],
  });

  const rows = useMemo(() => (list.data ?? []).filter(item => (item.year ?? year) === year && (show === 'all' || item.isActive)), [list.data, year, show]);

  return (
    <Page
      title="Bộ chỉ tiêu"
      meta={list.data && <span>{num(rows.length)} bộ · Năm {year}</span>}
      extra={
        <>
          <YearSelect value={year} onChange={value => setParams({ year: String(value) }, { replace: true })} />
          <Segmented
            value={show}
            onChange={value => setShow(value as 'active' | 'all')}
            options={[
              { value: 'active', label: 'Đang dùng' },
              { value: 'all', label: 'Tất cả' },
            ]}
          />
          {can(user, LEADERSHIP) && (
            <Button icon={<AppstoreAddOutlined />} onClick={() => setLibrary(true)}>
              Thư viện mẫu
            </Button>
          )}
          {can(user, FRAMEWORK_EDITORS) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing(null)}>
              Tạo bộ chỉ tiêu
            </Button>
          )}
        </>
      }
    >
      {list.error && !list.data ? (
        <LoadError error={list.error} retry={() => void list.refetch()} />
      ) : !list.data ? (
        <PageSkeleton />
      ) : rows.length ? (
        <Row gutter={[16, 16]} align="stretch">
          {rows.map(framework => (
            <Col key={framework.id} xs={24} lg={12} xxl={8} style={{ display: 'flex' }}>
              <FrameworkCard
                framework={framework}
                onEdit={() => setEditing(framework)}
                recomputing={recompute.isPending && recompute.variables?.id === framework.id}
                onRecompute={() => recompute.mutate(framework, { onSuccess: done => setRecomputed({ framework, outcomes: done.recomputed }) })}
              />
            </Col>
          ))}
        </Row>
      ) : (
        <Card>
          <Empty description={`Chưa có bộ chỉ tiêu năm ${year}`}>
            {can(user, LEADERSHIP) && (
              <Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => setLibrary(true)}>
                Nạp từ thư viện mẫu
              </Button>
            )}
          </Empty>
        </Card>
      )}
      <TemplateLibrary open={library} frameworks={list.data ?? []} onClose={() => setLibrary(false)} />
      <FrameworkForm open={editing !== undefined} framework={editing} year={year} onClose={() => setEditing(undefined)} />
      <RecomputeResult data={recomputed} onClose={() => setRecomputed(null)} />
    </Page>
  );
}
