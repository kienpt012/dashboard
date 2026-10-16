import {
  AppstoreAddOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExportOutlined,
  FileTextOutlined,
  HistoryOutlined,
  HolderOutlined,
  LayoutOutlined,
  PlusOutlined,
  SaveOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Checkbox,
  ColorPicker,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Slider,
  Space,
  Switch,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
  Drawer,
} from 'antd';
import { GridLayout, useContainerWidth } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useLocality } from '@/app/locality';
import { useThemeMode } from '@/app/theme';
import { DocumentLink } from '@/components/LegalBasis';
import { Page } from '@/components/Page';
import { LoadError, PageSkeleton } from '@/components/States';
import { invalidate, useApi } from '@/hooks/useApi';
import { ApiError, errorText, http } from '@/lib/api';
import { dateTime, fileSize, fromNow } from '@/lib/format';
import {
  addWidget,
  BINDING_FIELD_LABEL,
  BINDING_FORMATS,
  BREAKPOINT_LABEL,
  BREAKPOINTS,
  CANVAS_WIDTH,
  cleanLayout,
  COLS,
  contrast,
  duplicateWidget,
  GAP,
  METRIC_KEYS,
  METRICS,
  removeWidget,
  dropPublication,
  MAX_H,
  MAX_WIDGETS,
  ROW_HEIGHT,
  slotUsed,
  TEMPLATES,
  themeIssues,
  updateWidget,
  WIDGET_TYPES,
  widgetProblems,
  WIDGETS,
} from './model';
import { PublicRenderer, themeStyle, useFrameColors, WidgetView } from './Renderer';
import type {
  CustomHtmlBinding,
  EditorDocument,
  EditorResponse,
  PublicDashboardBreakpoint,
  PublicDashboardConfig,
  PublicDashboardWidget,
  PublicDashboardWidgetSettings,
} from './types';
import './studio.css';

type Draft = { name: string; templateKey: string; config: PublicDashboardConfig };

const snapshot = (draft: Draft) => JSON.stringify(draft);

// ---------------------------------------------------------------- Bảng thuộc tính

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Form.Item label={label} style={{ marginBottom: 12 }}>
      <ColorPicker value={value} disabledAlpha format="hex" showText onChange={color => onChange(color.toHexString().slice(0, 7))} />
    </Form.Item>
  );
}

function PageSettings({ draft, onChange }: { draft: Draft; onChange: (next: Draft) => void }) {
  const { theme, settings } = draft.config;
  const issues = themeIssues(theme);
  const setTheme = (patch: Partial<typeof theme>) => onChange({ ...draft, config: { ...draft.config, theme: { ...theme, ...patch } } });
  return (
    <Form layout="vertical" className="st-form">
      <Form.Item label="Tên bản nháp" validateStatus={draft.name.trim().length < 3 ? 'error' : undefined} help={draft.name.trim().length < 3 ? 'Ít nhất 3 ký tự' : undefined}>
        <Input value={draft.name} maxLength={120} onChange={event => onChange({ ...draft, name: event.target.value })} />
      </Form.Item>
      <div className="st-colors">
        <ColorField label="Màu nhấn" value={theme.accent} onChange={accent => setTheme({ accent })} />
        <ColorField label="Nền trang" value={theme.background} onChange={background => setTheme({ background })} />
        <ColorField label="Nền khối" value={theme.surface} onChange={surface => setTheme({ surface })} />
        <ColorField label="Màu chữ" value={theme.text} onChange={text => setTheme({ text })} />
      </div>
      {issues.length > 0 && <Alert type="error" showIcon title={issues.join('; ')} style={{ marginBottom: 12 }} />}
      <Form.Item label={`Độ rộng nội dung: ${theme.contentWidth}px`}>
        <Slider min={960} max={1920} step={40} value={theme.contentWidth} onChange={contentWidth => setTheme({ contentWidth })} />
      </Form.Item>
      <Form.Item label={`Bo góc: ${theme.radius}px`}>
        <Slider min={0} max={36} value={theme.radius} onChange={radius => setTheme({ radius })} />
      </Form.Item>
      <Flex vertical gap={10}>
        <Flex justify="space-between" align="center">
          <span>Dải tiêu đề đầu trang</span>
          <Switch checked={settings.showHeader} onChange={showHeader => onChange({ ...draft, config: { ...draft.config, settings: { ...settings, showHeader } } })} />
        </Flex>
        <Flex justify="space-between" align="center">
          <span>Chân trang</span>
          <Switch checked={settings.showFooter} onChange={showFooter => onChange({ ...draft, config: { ...draft.config, settings: { ...settings, showFooter } } })} />
        </Flex>
      </Flex>
    </Form>
  );
}

function BindingsEditor({ bindings, onChange, editor, html }: { bindings: CustomHtmlBinding[]; onChange: (next: CustomHtmlBinding[]) => void; editor: EditorResponse; html: string }) {
  const update = (index: number, patch: Partial<CustomHtmlBinding>) => onChange(bindings.map((binding, at) => (at === index ? { ...binding, ...patch } : binding)));
  const published = editor.catalog.documents.filter(document => document.publication);
  return (
    <Flex vertical gap={10}>
      {bindings.map((binding, index) => (
        <div className="st-binding" key={index}>
          <Flex gap={8}>
            <Space.Compact style={{ flex: 1 }}>
              <Space.Addon>Biến</Space.Addon>
              <Input
                value={binding.slot}
                maxLength={50}
                status={/^[a-z][a-z0-9_-]{0,49}$/.test(binding.slot) && bindings.filter(other => other.slot === binding.slot).length === 1 && slotUsed(html, binding.slot) ? undefined : 'error'}
                onChange={event => update(index, { slot: event.target.value.toLowerCase() })}
              />
            </Space.Compact>
            <Button danger type="text" icon={<DeleteOutlined />} aria-label="Xoá biến" onClick={() => onChange(bindings.filter((_, at) => at !== index))} />
          </Flex>
          <Input value={binding.label} placeholder="Tên hiển thị" maxLength={100} status={binding.label?.trim() ? undefined : 'error'} onChange={event => update(index, { label: event.target.value })} />
          <Flex gap={8}>
            <Select
              style={{ flex: 1 }}
              value={binding.source}
              options={[
                { value: 'overview', label: 'Tổng quan' },
                { value: 'target', label: 'Chỉ tiêu' },
                { value: 'document', label: 'Văn bản' },
              ]}
              onChange={source => update(index, { source, field: editor.bindingFields[source][0], targetKey: undefined, documentId: undefined })}
            />
            <Select
              style={{ flex: 1 }}
              value={binding.field}
              options={(editor.bindingFields[binding.source] ?? []).map(field => ({ value: field, label: BINDING_FIELD_LABEL[field] ?? field }))}
              onChange={field => update(index, { field })}
            />
          </Flex>
          {binding.source === 'target' && (
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Chọn chỉ tiêu"
              status={binding.targetKey ? undefined : 'error'}
              value={binding.targetKey}
              options={editor.catalog.targets.map(target => ({ value: target.key, label: `${target.code} · ${target.title}` }))}
              onChange={targetKey => update(index, { targetKey })}
            />
          )}
          {binding.source === 'document' && (
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="Chọn văn bản đã công khai"
              status={binding.documentId && published.some(document => document.publication!.id === binding.documentId) ? undefined : 'error'}
              value={binding.documentId}
              options={published.map(document => ({ value: document.publication!.id, label: document.publication!.title }))}
              onChange={documentId => update(index, { documentId })}
            />
          )}
          <Select value={binding.format ?? 'text'} options={BINDING_FORMATS} onChange={format => update(index, { format })} />
        </div>
      ))}
      <Button
        icon={<PlusOutlined />}
        onClick={() => {
          const taken = new Set(bindings.map(binding => binding.slot));
          let index = bindings.length + 1;
          while (taken.has(`bien_${index}`)) index += 1;
          onChange([...bindings, { slot: `bien_${index}`, label: `Biến ${index}`, source: 'overview', field: 'total', format: 'integer' }]);
        }}
      >
        Thêm biến
      </Button>
    </Flex>
  );
}

function WidgetSettings({
  widget,
  editor,
  onChange,
  onDuplicate,
  onRemove,
  onOpenDocuments,
}: {
  widget: PublicDashboardWidget;
  editor: EditorResponse;
  onChange: (patch: { title?: string; settings?: PublicDashboardWidgetSettings }) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onOpenDocuments: () => void;
}) {
  const s = widget.settings;
  const set = (settings: PublicDashboardWidgetSettings) => onChange({ settings });
  const published = editor.catalog.documents.filter(document => document.publication);
  const maxFor = widget.type === 'targetList' ? 100 : widget.type === 'documentList' ? 30 : 24;
  return (
    <Form layout="vertical" className="st-form">
      <Form.Item label="Tiêu đề khối">
        <Input value={widget.title ?? ''} maxLength={160} onChange={event => onChange({ title: event.target.value })} />
      </Form.Item>

      {widget.type === 'overviewMetrics' && (
        <Form.Item label="Số liệu hiển thị">
          <Checkbox.Group value={s.metricKeys} onChange={value => set({ metricKeys: METRIC_KEYS.filter(key => (value as string[]).includes(key)) })} className="st-checks">
            {METRIC_KEYS.map(key => (
              <Checkbox key={key} value={key}>
                {METRICS[key].label}
              </Checkbox>
            ))}
          </Checkbox.Group>
        </Form.Item>
      )}

      {widget.type === 'targetList' && (
        <>
          <Form.Item label="Nguồn chỉ tiêu">
            <Segmented
              block
              value={s.mode ?? 'highlight'}
              onChange={mode => set({ mode: mode as PublicDashboardWidgetSettings['mode'] })}
              options={[
                { value: 'highlight', label: 'Nổi bật' },
                { value: 'all', label: 'Tất cả' },
                { value: 'selected', label: 'Chọn lọc' },
              ]}
            />
          </Form.Item>
          {s.mode === 'selected' && (
            <Form.Item label="Chỉ tiêu" validateStatus={s.targetKeys?.length ? undefined : 'error'} help={s.targetKeys?.length ? undefined : 'Chọn ít nhất một chỉ tiêu'}>
              <Select
                mode="multiple"
                showSearch={{ optionFilterProp: 'label' }}
                value={s.targetKeys}
                onChange={targetKeys => set({ targetKeys })}
                options={editor.catalog.targets.map(target => ({ value: target.key, label: `${target.code} · ${target.title}` }))}
                notFoundContent="Chưa có chỉ tiêu công khai"
                maxTagCount="responsive"
              />
            </Form.Item>
          )}
        </>
      )}

      {widget.type === 'documentList' && (
        <Form.Item
          label="Văn bản"
          extra={
            <Button type="link" size="small" icon={<FileTextOutlined />} onClick={onOpenDocuments} style={{ paddingInline: 0 }}>
              Quản lý văn bản công khai
            </Button>
          }
        >
          <Select
            mode="multiple"
            showSearch={{ optionFilterProp: 'label' }}
            value={(s.publicationIds ?? []).filter(id => published.some(document => document.publication!.id === id))}
            onChange={publicationIds => set({ publicationIds })}
            options={published.map(document => ({ value: document.publication!.id, label: document.publication!.title }))}
            notFoundContent="Chưa có văn bản công khai"
            placeholder="Chọn văn bản"
            maxTagCount="responsive"
          />
        </Form.Item>
      )}

      {['targetList', 'departmentProgress', 'feedbackList', 'documentList'].includes(widget.type) && (
        <Form.Item label="Số mục tối đa">
          <InputNumber min={1} max={maxFor} precision={0} step={1} value={s.maxItems} onChange={value => value != null && set({ maxItems: Math.min(maxFor, Math.max(1, Math.round(value))) })} style={{ width: 120 }} />
        </Form.Item>
      )}

      {widget.type === 'richText' && (
        <Form.Item label="Nội dung" validateStatus={s.body?.trim() ? undefined : 'error'}>
          <Input.TextArea value={s.body} autoSize={{ minRows: 4, maxRows: 14 }} maxLength={8000} showCount onChange={event => set({ body: event.target.value })} />
        </Form.Item>
      )}

      {widget.type === 'cta' && (
        <>
          <Form.Item label="Mô tả">
            <Input.TextArea value={s.body} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={1000} onChange={event => set({ body: event.target.value })} />
          </Form.Item>
          <Form.Item label="Nhãn nút">
            <Input value={s.label} maxLength={100} onChange={event => set({ label: event.target.value })} />
          </Form.Item>
          <Form.Item label="Liên kết">
            <AutoComplete
              value={s.href}
              onChange={href => set({ href })}
              options={[
                { value: '/phan-anh', label: 'Gửi phản ánh' },
                { value: '/phan-anh?tab=tra-cuu', label: 'Tra cứu hồ sơ' },
                { value: '/phan-anh?tab=cong-khai', label: 'Kết quả phản ánh đã công khai' },
              ]}
            />
          </Form.Item>
        </>
      )}

      {widget.type === 'customHtml' && (
        <>
          <Form.Item label="HTML">
            <Input.TextArea
              className="st-code"
              value={s.html}
              autoSize={{ minRows: 6, maxRows: 16 }}
              maxLength={20000}
              spellCheck={false}
              onChange={event => set({ html: event.target.value })}
              placeholder={'<p>Tổng chỉ tiêu: <strong>{{tong}}</strong></p>'}
            />
          </Form.Item>
          <Form.Item label="Biến dữ liệu">
            <BindingsEditor bindings={s.bindings ?? []} onChange={bindings => set({ bindings })} editor={editor} html={s.html ?? ''} />
          </Form.Item>
        </>
      )}

      <Flex gap={8} className="st-widget-actions">
        <Button icon={<CopyOutlined />} onClick={onDuplicate}>
          Nhân bản
        </Button>
        <Popconfirm title="Xoá khối này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={onRemove}>
          <Button danger icon={<DeleteOutlined />}>
            Xoá khối
          </Button>
        </Popconfirm>
      </Flex>
    </Form>
  );
}

// ---------------------------------------------------------------- Khung bố cục

function Canvas({
  config,
  device,
  data,
  selected,
  onSelect,
  onLayout,
  onRemove,
  onDuplicate,
}: {
  config: PublicDashboardConfig;
  device: PublicDashboardBreakpoint;
  data: EditorResponse['previewData'];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onLayout: (layout: PublicDashboardConfig['layouts'][PublicDashboardBreakpoint]) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const { dark } = useThemeMode();
  const colors = useFrameColors(config, dark);
  const { width, containerRef, mounted } = useContainerWidth({ initialWidth: 1000 });
  const byId = new Map(config.widgets.map(widget => [widget.id, widget]));
  return (
    <div className="st-canvas pd" style={themeStyle(config, dark)} onClick={() => onSelect(null)}>
      <div className="st-frame" style={{ maxWidth: CANVAS_WIDTH[device] ?? config.theme.contentWidth }} ref={containerRef}>
        {mounted && (
          <GridLayout
            key={device}
            width={width}
            layout={config.layouts[device].map(entry => ({ ...entry, maxH: MAX_H }))}
            gridConfig={{ cols: COLS[device], rowHeight: ROW_HEIGHT, margin: [GAP, GAP], containerPadding: [0, 0] }}
            dragConfig={{ enabled: true, handle: '.st-handle', threshold: 4 }}
            resizeConfig={{ enabled: true, handles: ['se', 's', 'e'] }}
            onLayoutChange={layout => onLayout(cleanLayout(layout, config, device))}
          >
            {config.layouts[device].map(item => {
              const widget = byId.get(item.i);
              if (!widget) return <div key={item.i} />;
              const active = selected === widget.id;
              return (
                <div
                  key={widget.id}
                  className={`st-item pd-card pd-w-${widget.type}${active ? ' active' : ''}`}
                  onClick={event => {
                    event.stopPropagation();
                    onSelect(widget.id);
                  }}
                >
                  <div className="st-bar">
                    <span
                      className="st-handle"
                      title="Kéo để di chuyển"
                      role="button"
                      tabIndex={0}
                      aria-pressed={active}
                      aria-label={`Chọn khối ${widget.title || WIDGETS[widget.type].label}`}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          onSelect(widget.id);
                        } else if (event.key === 'Escape') onSelect(null);
                      }}
                    >
                      <HolderOutlined />
                      {WIDGETS[widget.type].label}
                    </span>
                    <span className="st-bar-actions">
                      <Tooltip title="Nhân bản">
                        <button type="button" aria-label="Nhân bản khối" onClick={event => (event.stopPropagation(), onDuplicate(widget.id))}>
                          <CopyOutlined />
                        </button>
                      </Tooltip>
                      <Popconfirm title="Xoá khối này?" okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }} onConfirm={() => onRemove(widget.id)}>
                        <button type="button" aria-label="Xoá khối" onClick={event => event.stopPropagation()}>
                          <DeleteOutlined />
                        </button>
                      </Popconfirm>
                    </span>
                  </div>
                  <div className="st-content">
                    <WidgetView widget={widget} data={data} colors={colors} />
                  </div>
                </div>
              );
            })}
          </GridLayout>
        )}
        {!config.widgets.length && <Empty description="Trang chưa có khối nào" />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Lịch sử, văn bản

function HistoryDrawer({ open, onClose, editor, onRestore, busy }: { open: boolean; onClose: () => void; editor: EditorResponse; onRestore: (revision: number) => void; busy: boolean }) {
  return (
    <Drawer title="Lịch sử công bố" open={open} onClose={onClose} size={460} destroyOnHidden>
      {editor.history.length ? (
        <Timeline
          items={editor.history.map(item => ({
            color: item.revision === editor.dashboard.publishedRevision ? 'green' : 'gray',
            content: (
              <div className="st-revision">
                <Flex justify="space-between" align="baseline" gap={8}>
                  <strong>
                    Lần {item.revision}
                    {item.revision === editor.dashboard.publishedRevision && (
                      <Tag color="green" style={{ marginInlineStart: 8 }}>
                        Đang hiển thị
                      </Tag>
                    )}
                  </strong>
                  <Popconfirm title={`Đưa bản lần ${item.revision} vào bản nháp?`} okText="Khôi phục" cancelText="Huỷ" onConfirm={() => onRestore(item.revision)}>
                    <Button size="small" loading={busy}>
                      Khôi phục
                    </Button>
                  </Popconfirm>
                </Flex>
                {item.changeNote && <div>{item.changeNote}</div>}
                <span className="entry-meta">{[item.publishedBy, item.publishedAt ? dateTime(item.publishedAt) : null].filter(Boolean).join(' · ')}</span>
              </div>
            ),
          }))}
        />
      ) : (
        <Empty description="Chưa công bố lần nào" />
      )}
    </Drawer>
  );
}

type PublicationValues = { title: string; summary?: string; confirmedSafe: boolean };

function DocumentsDrawer({ open, onClose, documents, onRevoked }: { open: boolean; onClose: () => void; documents: EditorDocument[]; onRevoked: (publicationId: string) => void }) {
  const client = useQueryClient();
  const { message } = App.useApp();
  const [form] = Form.useForm<PublicationValues>();
  const [editing, setEditing] = useState<EditorDocument | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function save(document: EditorDocument, values: PublicationValues, isPublic: boolean) {
    setBusy(document.id);
    const revokedId = !isPublic ? document.publication?.id : undefined;
    try {
      await http.put(`/public-dashboard/documents/${document.id}/publication`, {
        expectedVersion: document.publication?.version,
        title: values.title.trim(),
        summary: values.summary?.trim() || undefined,
        confirmedSafe: true,
        public: isPublic,
      });
      message.success(isPublic ? 'Đã công khai văn bản' : 'Đã thu hồi văn bản');
      if (revokedId) onRevoked(revokedId);
      setEditing(null);
      await invalidate(client, ['/public-dashboard', '/public/dashboard']);
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer title="Văn bản công khai" open={open} onClose={onClose} size={760} destroyOnHidden>
      <Table
        rowKey="id"
        size="middle"
        pagination={documents.length > 10 ? { pageSize: 10 } : false}
        dataSource={documents}
        locale={{ emptyText: 'Kho văn bản chưa có văn bản đã xử lý' }}
        columns={[
          {
            title: 'Văn bản',
            key: 'title',
            render: (_, document) => (
              <div className="cell-title">
                <DocumentLink id={document.id}>{document.title}</DocumentLink>
                <span>{[document.code, document.originalName, fileSize(document.size)].filter(Boolean).join(' · ')}</span>
              </div>
            ),
          },
          {
            title: 'Công khai',
            key: 'publication',
            width: 200,
            render: (_, document) =>
              document.publication ? (
                <div className="cell-title">
                  <Tag color="green">Đang công khai · lần {document.publication.version}</Tag>
                  <span>{document.publication.publishedAt ? fromNow(document.publication.publishedAt) : ''}</span>
                </div>
              ) : (
                <span className="muted">Chưa công khai</span>
              ),
          },
          {
            key: 'actions',
            width: 190,
            align: 'right',
            render: (_, document) => (
              <Space size={4}>
                <Button
                  size="small"
                  type={document.publication ? 'default' : 'primary'}
                  onClick={() => {
                    setEditing(document);
                    form.setFieldsValue({ title: document.publication?.title ?? document.title, summary: document.publication?.summary ?? '', confirmedSafe: false });
                  }}
                >
                  {document.publication ? 'Cập nhật' : 'Công khai'}
                </Button>
                {document.publication && (
                  <Popconfirm
                    title="Thu hồi văn bản khỏi trang công khai?"
                    okText="Thu hồi"
                    cancelText="Huỷ"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void save(document, { title: document.publication!.title, summary: document.publication!.summary ?? undefined, confirmedSafe: true }, false)}
                  >
                    <Button size="small" danger loading={busy === document.id}>
                      Thu hồi
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing?.publication ? 'Cập nhật văn bản công khai' : 'Công khai văn bản'}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        okText="Công khai"
        confirmLoading={busy === editing?.id}
        onOk={() => void form.validateFields().then(values => editing && save(editing, values, true))}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="Tiêu đề công khai" rules={[{ required: true, whitespace: true, message: 'Nhập tiêu đề' }, { min: 3, message: 'Ít nhất 3 ký tự' }]}>
            <Input maxLength={300} />
          </Form.Item>
          <Form.Item name="summary" label="Trích yếu">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} maxLength={2000} showCount />
          </Form.Item>
          <Form.Item name="confirmedSafe" valuePropName="checked" rules={[{ validator: (_, value) => (value ? Promise.resolve() : Promise.reject(new Error('Cần xác nhận'))) }]}>
            <Checkbox>Đã kiểm tra văn bản không chứa thông tin cá nhân, bí mật nhà nước</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </Drawer>
  );
}

// ---------------------------------------------------------------- Trang

export default function PublicStudio() {
  const editor = useApi<EditorResponse>('/public-dashboard/editor');
  if (editor.error && !editor.data) return <LoadError error={editor.error} retry={() => void editor.refetch()} />;
  if (!editor.data) return <PageSkeleton />;
  return <Studio editor={editor.data} reload={() => editor.refetch()} />;
}

function Studio({ editor, reload }: { editor: EditorResponse; reload: () => Promise<unknown> }) {
  const client = useQueryClient();
  const { message, modal } = App.useApp();
  const locality = useLocality();
  const base = useMemo<Draft>(() => ({ name: editor.dashboard.draftName, templateKey: editor.dashboard.draftTemplateKey, config: editor.dashboard.draftConfig }), [editor.dashboard]);
  const [draft, setDraft] = useState<Draft>(base);
  const [saved, setSaved] = useState(() => snapshot(base));
  const [version, setVersion] = useState(editor.dashboard.draftVersion);
  const [device, setDevice] = useState<PublicDashboardBreakpoint>('desktop');
  const [mode, setMode] = useState<'layout' | 'preview'>('layout');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'publish' | 'restore' | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState('');
  const [history, setHistory] = useState(false);
  const [documents, setDocuments] = useState(false);
  const { dark } = useThemeMode();
  // Bản sao đồng bộ của trạng thái để các thao tác bất đồng bộ luôn đọc giá trị mới nhất.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const savedRef = useRef(saved);
  const versionRef = useRef(version);
  /** Bật trước khi chủ động nạp bản của máy chủ (khôi phục, chọn tải bản mới) để thay bản nháp cục bộ. */
  const adoptNext = useRef(false);

  const markSaved = (value: string) => {
    savedRef.current = value;
    setSaved(value);
  };
  const markVersion = (value: number) => {
    versionRef.current = value;
    setVersion(value);
  };

  const dirty = snapshot(draft) !== saved;
  const issues = themeIssues(draft.config.theme);
  const selectedWidget = draft.config.widgets.find(widget => widget.id === selected) ?? null;
  const activePublications = useMemo(() => new Set(editor.catalog.documents.flatMap(document => (document.publication ? [document.publication.id] : []))), [editor.catalog.documents]);
  const problems = [
    ...issues,
    ...(draft.name.trim().length < 3 ? ['Tên bản nháp cần ít nhất 3 ký tự'] : []),
    ...(draft.config.widgets.length < 1 ? ['Trang cần ít nhất 1 khối'] : draft.config.widgets.length > MAX_WIDGETS ? [`Trang có tối đa ${MAX_WIDGETS} khối`] : []),
    ...draft.config.widgets.flatMap(widget => widgetProblems(widget, widget.title || WIDGETS[widget.type].label, activePublications)),
  ];

  // Đồng bộ với bản của máy chủ mà KHÔNG bao giờ tự xoá thay đổi chưa lưu.
  useEffect(() => {
    const serverVersion = editor.dashboard.draftVersion;
    const serverSnapshot = snapshot(base);
    const localDirty = snapshot(draftRef.current) !== savedRef.current;
    const adopt = () => {
      adoptNext.current = false;
      setDraft(base);
      markSaved(serverSnapshot);
      markVersion(serverVersion);
    };
    if (adoptNext.current || !localDirty) return adopt();
    if (serverVersion === versionRef.current) return;
    if (serverSnapshot === savedRef.current) {
      // Ví dụ: công bố chỉ tăng phiên bản, nội dung không đổi — giữ thay đổi đang sửa.
      markVersion(serverVersion);
      return;
    }
    modal.confirm({
      title: 'Bản nháp đã thay đổi ở nơi khác',
      okText: 'Tải bản mới',
      cancelText: 'Giữ bản đang sửa',
      onOk: adopt,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    modal.confirm({
      title: 'Rời trang khi chưa lưu bản nháp?',
      okText: 'Rời trang',
      cancelText: 'Ở lại',
      okButtonProps: { danger: true },
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    });
  }, [blocker, modal]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const conflict = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 409) {
        modal.confirm({
          title: 'Bản nháp đã thay đổi ở nơi khác',
          content: errorText(error),
          okText: 'Tải bản mới',
          cancelText: 'Để sau',
          onOk: async () => {
            adoptNext.current = true;
            await reload();
          },
        });
        return;
      }
      message.error(errorText(error));
    },
    [message, modal, reload],
  );

  /** Lưu bản nháp; trả phiên bản mới hoặc null nếu không lưu được. */
  async function saveDraft(): Promise<number | null> {
    if (problems.length) {
      message.error(problems[0]);
      return null;
    }
    const sent = draftRef.current;
    const sentSnapshot = snapshot(sent);
    setBusy('save');
    try {
      const result = await http.put<{ draftVersion: number; draftConfig: PublicDashboardConfig; draftName: string; draftTemplateKey: string }>('/public-dashboard/draft', {
        expectedVersion: versionRef.current,
        name: sent.name.trim(),
        templateKey: sent.templateKey,
        config: sent.config,
      });
      const next = { name: result.draftName, templateKey: result.draftTemplateKey, config: result.draftConfig };
      markVersion(result.draftVersion);
      markSaved(snapshot(next));
      // Chỉ nhận bản chuẩn hoá của máy chủ khi không có chỉnh sửa nào trong lúc chờ; ngược lại giữ bản đang sửa (vẫn "Chưa lưu").
      if (snapshot(draftRef.current) === sentSnapshot) setDraft(next);
      message.success('Đã lưu bản nháp');
      void invalidate(client, ['/public-dashboard']);
      return result.draftVersion;
    } catch (error) {
      conflict(error);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    const expected = dirty ? await saveDraft() : versionRef.current;
    if (expected === null) return;
    setBusy('publish');
    try {
      await http.post('/public-dashboard/publish', { expectedVersion: expected, changeNote: note.trim() });
      message.success('Đã công bố trang công khai');
      setPublishing(false);
      setNote('');
      await invalidate(client, ['/public-dashboard', '/public/dashboard']);
    } catch (error) {
      conflict(error);
    } finally {
      setBusy(null);
    }
  }

  async function restore(revision: number) {
    setBusy('restore');
    try {
      await http.post(`/public-dashboard/revisions/${revision}/restore`, { expectedVersion: versionRef.current });
      message.success(`Đã đưa bản lần ${revision} vào bản nháp`);
      setHistory(false);
      adoptNext.current = true;
      await invalidate(client, ['/public-dashboard']);
    } catch (error) {
      conflict(error);
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (dirty && !busy) void saveDraft();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Thêm hoặc nhân bản khối, tôn trọng giới hạn của máy chủ. */
  function withRoom(run: () => void) {
    if (draft.config.widgets.length >= MAX_WIDGETS) {
      message.warning(`Trang có tối đa ${MAX_WIDGETS} khối`);
      return;
    }
    run();
  }

  const setConfig = (config: PublicDashboardConfig) => setDraft(current => ({ ...current, config }));

  function applyTemplate(key: string) {
    const template = TEMPLATES.find(item => item.key === key);
    if (!template) return;
    modal.confirm({
      title: `Dùng mẫu “${template.name}”?`,
      content: 'Bố cục và các khối hiện tại trong bản nháp sẽ được thay thế.',
      okText: 'Dùng mẫu',
      cancelText: 'Huỷ',
      onOk: () => {
        const config = template.build();
        const accent = locality.primaryColor;
        if (/^#[0-9a-f]{6}$/i.test(accent) && contrast(accent, config.theme.surface) >= 3) config.theme.accent = accent.toLowerCase();
        setSelected(null);
        setDraft(current => ({ ...current, templateKey: template.key, config }));
      },
    });
  }

  const status = editor.dashboard.publishedRevision ? `Đã công bố lần ${editor.dashboard.publishedRevision}` : 'Chưa công bố';

  return (
    <Page
      title="Trang công khai"
      wide
      tags={dirty ? <Tag color="gold">Chưa lưu</Tag> : <Tag>Bản nháp đã lưu</Tag>}
      meta={
        <span>
          {status}
          {editor.dashboard.updatedAt ? ` · nháp sửa ${fromNow(editor.dashboard.updatedAt)}${editor.dashboard.updatedBy ? ` bởi ${editor.dashboard.updatedBy}` : ''}` : ''}
        </span>
      }
      extra={
        <>
          <Button icon={<ExportOutlined />} href="/" target="_blank">
            Mở trang
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => setHistory(true)}>
            Lịch sử
          </Button>
          <Button icon={<FileTextOutlined />} onClick={() => setDocuments(true)}>
            Văn bản
          </Button>
          <Tooltip title="Ctrl S">
            <Button icon={<SaveOutlined />} disabled={!dirty} loading={busy === 'save'} onClick={() => void saveDraft()}>
              Lưu nháp
            </Button>
          </Tooltip>
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={() => setPublishing(true)} disabled={problems.length > 0}>
            Công bố
          </Button>
        </>
      }
    >
      <Card className="st-toolbar" size="small">
        <Flex gap={12} wrap align="center" justify="space-between">
          <Flex gap={12} wrap align="center">
            <Segmented value={device} onChange={value => setDevice(value as PublicDashboardBreakpoint)} options={BREAKPOINTS.map(value => ({ value, label: BREAKPOINT_LABEL[value] }))} />
            <Segmented
              value={mode}
              onChange={value => setMode(value as typeof mode)}
              options={[
                { value: 'layout', label: 'Bố cục', icon: <LayoutOutlined /> },
                { value: 'preview', label: 'Xem trước', icon: <ExportOutlined /> },
              ]}
            />
          </Flex>
          <Flex gap={8} wrap>
            <Dropdown
              trigger={['click']}
              menu={{
                items: WIDGET_TYPES.map(type => ({ key: type, label: WIDGETS[type].label })),
                onClick: ({ key }) =>
                  withRoom(() => {
                    const result = addWidget(draft.config, key as PublicDashboardWidget['type']);
                    setConfig(result.config);
                    setSelected(result.id);
                    setMode('layout');
                  }),
              }}
            >
              <Button icon={<AppstoreAddOutlined />}>Thêm khối</Button>
            </Dropdown>
            <Dropdown trigger={['click']} menu={{ items: TEMPLATES.map(item => ({ key: item.key, label: item.name })), onClick: ({ key }) => applyTemplate(key) }}>
              <Button icon={<LayoutOutlined />}>Mẫu trang</Button>
            </Dropdown>
          </Flex>
        </Flex>
      </Card>

      <div className="st-body">
        <div className="st-main">
          {mode === 'layout' ? (
            <Canvas
              config={draft.config}
              device={device}
              data={editor.previewData}
              selected={selected}
              onSelect={setSelected}
              onLayout={layout => setDraft(current => ({ ...current, config: { ...current.config, layouts: { ...current.config.layouts, [device]: layout } } }))}
              onRemove={id => {
                setConfig(removeWidget(draft.config, id));
                if (selected === id) setSelected(null);
              }}
              onDuplicate={id =>
                withRoom(() => {
                  const result = duplicateWidget(draft.config, id);
                  setConfig(result.config);
                  setSelected(result.id);
                })
              }
            />
          ) : (
            <div className="st-preview pd" style={themeStyle(draft.config, dark)}>
              <div className="st-frame" style={{ maxWidth: CANVAS_WIDTH[device] ?? draft.config.theme.contentWidth }}>
                <PublicRenderer config={draft.config} data={editor.previewData} breakpoint={device} />
              </div>
            </div>
          )}
        </div>

        <Card
          className="st-panel"
          size="small"
          title={
            selectedWidget ? (
              <Flex align="center" gap={8}>
                <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => setSelected(null)} aria-label="Thiết lập trang" />
                <span>{WIDGETS[selectedWidget.type].label}</span>
              </Flex>
            ) : (
              'Thiết lập trang'
            )
          }
        >
          {selectedWidget ? (
            <WidgetSettings
              key={selectedWidget.id}
              widget={selectedWidget}
              editor={editor}
              onChange={patch => setConfig(updateWidget(draft.config, selectedWidget.id, patch))}
              onDuplicate={() =>
                withRoom(() => {
                  const result = duplicateWidget(draft.config, selectedWidget.id);
                  setConfig(result.config);
                  setSelected(result.id);
                })
              }
              onRemove={() => {
                setConfig(removeWidget(draft.config, selectedWidget.id));
                setSelected(null);
              }}
              onOpenDocuments={() => setDocuments(true)}
            />
          ) : (
            <PageSettings draft={draft} onChange={setDraft} />
          )}
          {problems.length > 0 && !selectedWidget && issues.length === 0 && (
            <Alert type="warning" showIcon title="Cần hoàn thiện trước khi công bố" description={<ul className="plain-list">{problems.map(problem => <li key={problem}>{problem}</li>)}</ul>} />
          )}
        </Card>
      </div>

      <Modal
        title="Công bố trang công khai"
        open={publishing}
        onCancel={() => setPublishing(false)}
        okText="Công bố"
        okButtonProps={{ disabled: note.trim().length < 3, loading: busy === 'publish' || busy === 'save' }}
        onOk={() => void publish()}
        destroyOnHidden
      >
        <Form layout="vertical">
          {dirty && <Alert type="info" showIcon title="Bản nháp sẽ được lưu trước khi công bố" style={{ marginBottom: 12 }} />}
          <Form.Item label="Nội dung thay đổi" required>
            <Input.TextArea value={note} onChange={event => setNote(event.target.value)} autoSize={{ minRows: 3, maxRows: 8 }} maxLength={500} showCount placeholder="Ví dụ: Bổ sung văn bản kế hoạch năm 2026" />
          </Form.Item>
        </Form>
        <Typography.Text type="secondary">{`${draft.config.widgets.length} khối · ${editor.catalog.targets.length} chỉ tiêu công khai`}</Typography.Text>
      </Modal>

      <HistoryDrawer open={history} onClose={() => setHistory(false)} editor={editor} onRestore={revision => void restore(revision)} busy={busy === 'restore'} />
      <DocumentsDrawer
        open={documents}
        onClose={() => setDocuments(false)}
        documents={editor.catalog.documents}
        onRevoked={id => setDraft(current => ({ ...current, config: dropPublication(current.config, id) }))}
      />
    </Page>
  );
}
