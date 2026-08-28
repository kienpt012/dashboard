import {
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Copy,
  Database,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  GripVertical,
  History,
  LayoutDashboard,
  Monitor,
  MoveDown,
  MoveUp,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import ReactGridLayout, { WidthProvider, type LayoutItem } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { api, ApiError } from '../api';
import { Modal, Spinner } from '../components/UI';
import { currentVietnamYear } from '../date';
import {
  PUBLIC_DASHBOARD_COLS,
  PUBLIC_DASHBOARD_TEMPLATES,
  PUBLIC_DASHBOARD_WIDGET_DESCRIPTIONS,
  PUBLIC_DASHBOARD_WIDGET_LABELS,
  clonePublicDashboardConfig,
  createDefaultPublicDashboardConfig,
  createWidget,
  normalizePublicDashboardConfig,
  publicDashboardWidgetMinHeight,
} from '../public-dashboard/defaults';
import PublicDashboardRenderer, { renderPublicDashboardWidget } from '../public-dashboard/PublicDashboardRenderer';
import type {
  CustomHtmlBinding,
  DashboardEditorDocument,
  PublicDashboardBreakpoint,
  PublicDashboardConfig,
  PublicDashboardData,
  PublicDashboardEditorDashboard,
  PublicDashboardEditorResponse,
  PublicDashboardResponse,
  PublicDashboardRevision,
  PublicDashboardWidget,
  PublicDashboardWidgetType,
} from '../public-dashboard/types';
import '../public-dashboard/studio.css';

const GridLayout = WidthProvider(ReactGridLayout);
const widgetTypes = Object.keys(PUBLIC_DASHBOARD_WIDGET_LABELS) as PublicDashboardWidgetType[];
type StudioSnapshot = { config: PublicDashboardConfig; templateKey: string };

const widgetDefaultSize: Record<PublicDashboardWidgetType, { w: number; h: number }> = {
  overviewMetrics: { w: 12, h: 5 },
  targetList: { w: 8, h: 8 },
  departmentProgress: { w: 4, h: 7 },
  feedbackList: { w: 6, h: 6 },
  documentList: { w: 6, h: 6 },
  richText: { w: 12, h: 3 },
  customHtml: { w: 6, h: 5 },
  cta: { w: 12, h: 3 },
};

const bindingFields = {
  overview: [
    ['year', 'Năm kế hoạch'],
    ['total', 'Tổng chỉ tiêu'],
    ['completed', 'Chỉ tiêu hoàn thành'],
    ['onTrack', 'Chỉ tiêu đúng tiến độ'],
    ['overallProgress', 'Tiến độ chung'],
    ['updatedAt', 'Thời điểm cập nhật'],
  ],
  target: [
    ['code', 'Mã chỉ tiêu'],
    ['title', 'Tên chỉ tiêu'],
    ['currentValue', 'Giá trị hiện tại'],
    ['targetValue', 'Giá trị mục tiêu'],
    ['unit', 'Đơn vị tính'],
    ['progress', 'Tỷ lệ hoàn thành'],
    ['department', 'Đơn vị phụ trách'],
    ['status', 'Trạng thái'],
    ['publishedAt', 'Thời điểm công bố'],
  ],
  document: [
    ['code', 'Mã văn bản'],
    ['title', 'Tên công khai'],
    ['summary', 'Tóm tắt công khai'],
    ['publishedAt', 'Thời điểm công bố'],
    ['downloadUrl', 'Liên kết tải xuống'],
  ],
} as const;

const emptyPreviewData = (): PublicDashboardData => ({
  overview: {
    year: currentVietnamYear(), total: 0, completed: 0, onTrack: 0, overallProgress: 0,
    updatedAt: null, departments: [], highlights: [],
  },
  targets: [],
  feedbacks: [],
  documents: [],
});

function dashboardResult(value: PublicDashboardEditorDashboard | { dashboard: PublicDashboardEditorDashboard }) {
  return 'dashboard' in value ? value.dashboard : value;
}

function sameConfig(left: PublicDashboardConfig, right: PublicDashboardConfig) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function maxLayoutY(items: PublicDashboardConfig['layouts'][PublicDashboardBreakpoint]) {
  return items.reduce((maximum, item) => Math.max(maximum, item.y + item.h), 0);
}

function layoutItemsOverlap(left: LayoutItem, right: LayoutItem) {
  return left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;
}

function nextWidgetId(type: PublicDashboardWidgetType, config: PublicDashboardConfig) {
  const base = `${type}-${Date.now().toString(36)}`;
  let id = base;
  let index = 2;
  while (config.widgets.some(widget => widget.id === id)) id = `${base}-${index++}`;
  return id;
}

function toLayoutItems(items: PublicDashboardConfig['layouts'][PublicDashboardBreakpoint]): LayoutItem[] {
  return items.map(item => ({ ...item }));
}

export default function PublicDashboardStudio() {
  const [editor, setEditor] = useState<PublicDashboardEditorResponse | null>(null);
  const [config, setConfig] = useState(createDefaultPublicDashboardConfig);
  const [draftName, setDraftName] = useState('Trang thông tin công khai');
  const [templateKey, setTemplateKey] = useState('transparency');
  const [draftVersion, setDraftVersion] = useState(0);
  const [historyItems, setHistoryItems] = useState<PublicDashboardRevision[]>([]);
  const [previewData, setPreviewData] = useState<PublicDashboardData>(emptyPreviewData);
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [device, setDevice] = useState<PublicDashboardBreakpoint>('desktop');
  const [previewMode, setPreviewMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [undoStack, setUndoStack] = useState<StudioSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<StudioSnapshot[]>([]);
  const [modal, setModal] = useState<'publish' | 'history' | 'documents' | 'restore' | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [restorePending, setRestorePending] = useState<number | null>(null);
  const [templatePending, setTemplatePending] = useState<(typeof PUBLIC_DASHBOARD_TEMPLATES)[number] | null>(null);
  const [leftSection, setLeftSection] = useState<'widgets' | 'templates'>('widgets');
  const [workspacePane, setWorkspacePane] = useState<'library' | 'canvas' | 'properties'>('canvas');
  const changeSerial = useRef(0);
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const studioCenterRef = useRef<HTMLElement>(null);

  useEffect(() => {
    studioCenterRef.current?.scrollTo({ left: 0, top: 0 });
  }, [device, previewMode]);

  async function loadEditor(preserveDraft = false) {
    setLoading(!preserveDraft);
    setError('');
    try {
      const [result, publicResult] = await Promise.all([
        api<PublicDashboardEditorResponse>('/public-dashboard/editor'),
        api<PublicDashboardResponse>('/public/dashboard').catch(() => null),
      ]);
      setEditor(result);
      setHistoryItems(result.history ?? []);
      if (!preserveDraft) {
        const normalized = normalizePublicDashboardConfig(result.dashboard.draftConfig);
        setConfig(normalized);
        setDraftName(result.dashboard.draftName || 'Trang thông tin công khai');
        setTemplateKey(result.dashboard.draftTemplateKey || 'transparency');
        setSelectedWidgetId(normalized.widgets[0]?.id ?? null);
        setUndoStack([]);
        setRedoStack([]);
        setDirty(false);
        setConflicted(false);
      }
      setDraftVersion(result.dashboard.draftVersion);
      if (result.previewData) setPreviewData(result.previewData);
      else if (publicResult?.data) setPreviewData(publicResult.data);
      else setPreviewData(buildCatalogPreviewData(result));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tải trình thiết kế trang công khai');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadEditor(); }, []);

  const navigationGuardActive = dirty || saving;
  useEffect(() => {
    if (!navigationGuardActive) return;
    const guardId = `ioc-studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const originalState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    window.history.replaceState({ ...originalState, __iocStudioBase: guardId }, '', window.location.href);
    window.history.pushState({ ...originalState, __iocStudioGuard: guardId }, '', window.location.href);
    let bypassHistoryGuard = false;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const confirmInternalNavigation = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (!window.confirm('Bản thiết kế còn thay đổi chưa lưu. Bạn có chắc muốn rời trang?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const confirmHistoryNavigation = (event: PopStateEvent) => {
      if (bypassHistoryGuard || event.state?.__iocStudioBase !== guardId) return;
      if (window.confirm('Bản thiết kế còn thay đổi chưa lưu. Bạn có chắc muốn rời trang?')) {
        bypassHistoryGuard = true;
        window.history.back();
      } else {
        window.history.forward();
      }
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    window.addEventListener('popstate', confirmHistoryNavigation);
    document.addEventListener('click', confirmInternalNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload);
      window.removeEventListener('popstate', confirmHistoryNavigation);
      document.removeEventListener('click', confirmInternalNavigation, true);
      if (window.history.state?.__iocStudioGuard === guardId) {
        bypassHistoryGuard = true;
        window.history.back();
      }
    };
  }, [navigationGuardActive]);

  function buildCatalogPreviewData(result: PublicDashboardEditorResponse): PublicDashboardData {
    const base = emptyPreviewData();
    base.targets = result.catalog.targets.map((target, index) => ({
      key: target.key, code: target.code, title: target.title, description: null, unit: '%', year: target.year,
      frequency: 'YEARLY', dueDate: `${target.year}-12-31`, targetValue: 100, currentValue: 65 + index % 30,
      progress: 65 + index % 30, department: target.department, departmentColor: '#0f8378', departmentKey: target.department,
      status: index % 3 === 0 ? 'COMPLETED' : 'ON_TRACK', publishedAt: null,
    }));
    base.overview.total = base.targets.length;
    base.overview.completed = base.targets.filter(target => target.status === 'COMPLETED').length;
    base.overview.onTrack = base.targets.filter(target => target.status === 'ON_TRACK').length;
    base.overview.overallProgress = base.targets.length ? Math.round(base.targets.reduce((total, item) => total + item.progress, 0) / base.targets.length) : 0;
    base.overview.highlights = base.targets.slice(0, 6);
    base.documents = result.catalog.documents.filter(document => document.publication && !document.publication.revokedAt).map(document => ({
      id: document.publication!.id, code: document.code,
      title: document.publication!.title, summary: document.publication!.summary, publishedAt: document.publication!.publishedAt,
    }));
    return base;
  }

  function commitConfig(next: PublicDashboardConfig, record = true) {
    const normalized = normalizePublicDashboardConfig(next);
    if (sameConfig(config, normalized)) return;
    if (record) {
      setUndoStack(items => [...items, { config: clonePublicDashboardConfig(config), templateKey }].slice(-50));
      setRedoStack([]);
    }
    changeSerial.current += 1;
    setConfig(normalized);
    setDirty(true);
    setNotice('');
  }

  function updateWidget(nextWidget: PublicDashboardWidget) {
    commitConfig({ ...config, widgets: config.widgets.map(widget => widget.id === nextWidget.id ? nextWidget : widget) });
  }

  function updateWidgetSettings(patch: Record<string, unknown>) {
    const selected = config.widgets.find(widget => widget.id === selectedWidgetId);
    if (!selected) return;
    updateWidget({ ...selected, settings: { ...selected.settings, ...patch } });
  }

  function updateTheme(patch: Partial<PublicDashboardConfig['theme']>) {
    commitConfig({ ...config, theme: { ...config.theme, ...patch } });
  }

  function updatePageSettings(patch: Partial<PublicDashboardConfig['settings']>) {
    commitConfig({ ...config, settings: { ...config.settings, ...patch } });
  }

  function addWidget(type: PublicDashboardWidgetType, drop?: { x: number; y: number }) {
    if (config.widgets.length >= 40) {
      setError('Mỗi trang hỗ trợ tối đa 40 khối. Hãy xóa một khối trước khi thêm mới.');
      return;
    }
    const id = nextWidgetId(type, config);
    const created = createWidget(type, id);
    const layouts = { ...config.layouts };
    for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
      const cols = PUBLIC_DASHBOARD_COLS[breakpoint];
      const size = widgetDefaultSize[type];
      const width = Math.min(cols, size.w);
      const minHeight = publicDashboardWidgetMinHeight(type, breakpoint);
      layouts[breakpoint] = [
        ...config.layouts[breakpoint],
        {
          i: id,
          x: breakpoint === device && drop ? Math.max(0, Math.min(cols - width, drop.x)) : 0,
          y: breakpoint === device && drop ? Math.max(0, drop.y) : maxLayoutY(config.layouts[breakpoint]),
          w: width,
          h: Math.max(size.h, minHeight),
          minW: Math.min(width, 2),
          minH: minHeight,
        },
      ];
    }
    commitConfig({ ...config, widgets: [...config.widgets, created], layouts });
    setSelectedWidgetId(id);
    setWorkspacePane('canvas');
  }

  function removeWidget(id: string) {
    if (config.widgets.length <= 1) {
      setError('Trang công khai cần giữ lại ít nhất một khối.');
      return;
    }
    const layouts = { ...config.layouts };
    for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) layouts[breakpoint] = layouts[breakpoint].filter(item => item.i !== id);
    commitConfig({ ...config, widgets: config.widgets.filter(widget => widget.id !== id), layouts });
    setSelectedWidgetId(config.widgets.find(widget => widget.id !== id)?.id ?? null);
  }

  function duplicateWidget(id: string) {
    if (config.widgets.length >= 40) {
      setError('Mỗi trang hỗ trợ tối đa 40 khối. Hãy xóa một khối trước khi nhân bản.');
      return;
    }
    const source = config.widgets.find(widget => widget.id === id);
    if (!source) return;
    const newId = nextWidgetId(source.type, config);
    const layouts = { ...config.layouts };
    for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
      const sourceLayout = config.layouts[breakpoint].find(item => item.i === id);
      const minHeight = publicDashboardWidgetMinHeight(source.type, breakpoint);
      layouts[breakpoint] = [...config.layouts[breakpoint], sourceLayout
        ? { ...sourceLayout, i: newId, x: 0, y: maxLayoutY(config.layouts[breakpoint]) }
        : { i: newId, x: 0, y: maxLayoutY(config.layouts[breakpoint]), w: PUBLIC_DASHBOARD_COLS[breakpoint], h: Math.max(4, minHeight), minH: minHeight }];
    }
    commitConfig({ ...config, widgets: [...config.widgets, { ...source, id: newId, title: `${source.title ?? PUBLIC_DASHBOARD_WIDGET_LABELS[source.type]} (bản sao)`, settings: { ...source.settings } }], layouts });
    setSelectedWidgetId(newId);
  }

  function changeLayout(items: readonly LayoutItem[]) {
    const widgetTypes = new Map(config.widgets.map(widget => [widget.id, widget.type]));
    const nextItems = items.map(item => {
      const type = widgetTypes.get(item.i);
      const minHeight = type ? publicDashboardWidgetMinHeight(type, device) : 2;
      return {
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: Math.max(item.h, minHeight),
        minW: item.minW,
        minH: Math.max(item.minH ?? minHeight, minHeight),
      };
    });
    const current = config.layouts[device];
    if (JSON.stringify(current) === JSON.stringify(nextItems)) return;
    commitConfig({ ...config, layouts: { ...config.layouts, [device]: nextItems } });
  }

  function adjustSelectedLayout(patch: Partial<Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>>) {
    if (!selectedWidgetId) return;
    const cols = PUBLIC_DASHBOARD_COLS[device];
    const current = config.layouts[device].find(item => item.i === selectedWidgetId);
    if (!current) return;
    const type = config.widgets.find(widget => widget.id === selectedWidgetId)?.type;
    const minHeight = type ? publicDashboardWidgetMinHeight(type, device) : 2;
    const width = Math.max(current.minW ?? 1, Math.min(cols, Number(patch.w ?? current.w)));
    const selected = {
      ...current,
      ...patch,
      w: width,
      h: Math.max(current.minH ?? minHeight, minHeight, Math.min(30, Number(patch.h ?? current.h))),
      x: Math.max(0, Math.min(cols - width, Number(patch.x ?? current.x))),
      y: Math.max(0, Number(patch.y ?? current.y)),
    };
    const placed: LayoutItem[] = [selected];
    const others = config.layouts[device]
      .filter(item => item.i !== selectedWidgetId)
      .sort((left, right) => left.y - right.y || left.x - right.x);
    for (const item of others) {
      const candidate = { ...item };
      let collisions = placed.filter(other => layoutItemsOverlap(candidate, other));
      while (collisions.length) {
        candidate.y = Math.max(...collisions.map(other => other.y + other.h));
        collisions = placed.filter(other => layoutItemsOverlap(candidate, other));
      }
      placed.push(candidate);
    }
    const byId = new Map(placed.map(item => [item.i, item]));
    const next = config.layouts[device].map(item => byId.get(item.i) ?? item);
    commitConfig({ ...config, layouts: { ...config.layouts, [device]: next } });
  }

  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack(items => items.slice(0, -1));
    setRedoStack(items => [...items, { config: clonePublicDashboardConfig(config), templateKey }].slice(-50));
    changeSerial.current += 1;
    setConfig(previous.config);
    setTemplateKey(previous.templateKey);
    setDirty(true);
  }

  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack(items => items.slice(0, -1));
    setUndoStack(items => [...items, { config: clonePublicDashboardConfig(config), templateKey }].slice(-50));
    changeSerial.current += 1;
    setConfig(next.config);
    setTemplateKey(next.templateKey);
    setDirty(true);
  }

  async function saveDraft(automatic = false): Promise<number | null> {
    if (saving) return null;
    const normalizedName = draftName.trim();
    if (normalizedName.length < 3) {
      if (!automatic) setError('Tên bản thiết kế cần ít nhất 3 ký tự.');
      return null;
    }
    const serial = changeSerial.current;
    setSaving(true);
    if (!automatic) { setError(''); setNotice(''); }
    try {
      const value = await api<PublicDashboardEditorDashboard | { dashboard: PublicDashboardEditorDashboard }>('/public-dashboard/draft', {
        method: 'PUT',
        body: JSON.stringify({ expectedVersion: draftVersion, name: normalizedName, templateKey, config }),
      });
      const updated = dashboardResult(value);
      setDraftVersion(updated.draftVersion);
      setEditor(current => current ? { ...current, dashboard: updated } : current);
      if (serial === changeSerial.current) {
        setConfig(normalizePublicDashboardConfig(updated.draftConfig));
        setDraftName(updated.draftName);
        setDirty(false);
      }
      if (!automatic) setNotice('Đã lưu bản nháp. Trang người dân chưa thay đổi cho đến khi bạn công bố.');
      return updated.draftVersion;
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setConflicted(true);
        setError('Bản nháp trên máy chủ đã được một phiên khác cập nhật. Tự động lưu đã tạm dừng để không ghi đè dữ liệu.');
        return null;
      }
      setError(reason instanceof Error ? reason.message : 'Không thể lưu bản nháp');
      return null;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty || loading || saving || conflicted) return;
    const timer = window.setTimeout(() => { void saveDraft(true); }, 1800);
    return () => window.clearTimeout(timer);
  }, [dirty, loading, saving, conflicted, config, draftName, templateKey]);

  async function publish() {
    setError('');
    const saveSerial = changeSerial.current;
    const version = dirty ? await saveDraft(false) : draftVersion;
    if (version === null) return;
    if (saveSerial !== changeSerial.current) {
      setError('Bạn vừa chỉnh sửa trong lúc hệ thống lưu. Bản công bố chưa được tạo; hãy kiểm tra trạng thái đã lưu rồi bấm Công bố lại.');
      return;
    }
    const publishSerial = changeSerial.current;
    setSaving(true);
    try {
      const value = await api<{ dashboard: PublicDashboardEditorDashboard }>('/public-dashboard/publish', { method: 'POST', body: JSON.stringify({ expectedVersion: version, changeNote: changeNote.trim() || 'Cập nhật giao diện trang công khai' }) });
      const updated = dashboardResult(value);
      setDraftVersion(updated.draftVersion);
      setEditor(current => current ? { ...current, dashboard: updated } : current);
      setModal(null);
      setChangeNote('');
      if (publishSerial === changeSerial.current) {
        setNotice('Đã công bố phiên bản mới cho trang người dân.');
        await loadEditor();
      } else {
        // A change made while the publish request was in flight belongs to the
        // next draft. Keep it locally and refresh only server metadata/history;
        // the autosave effect will persist it against the new draftVersion.
        setDirty(true);
        setNotice('Đã công bố phiên bản vừa xác nhận. Các chỉnh sửa phát sinh trong lúc công bố vẫn được giữ ở bản nháp mới.');
        await loadEditor(true);
      }
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setConflicted(true);
        setError('Không thể công bố vì bản nháp trên máy chủ đã thay đổi. Hãy sao chép phần đang sửa hoặc tải bản máy chủ để đối chiếu.');
      } else setError(reason instanceof Error ? reason.message : 'Không thể công bố trang');
    } finally { setSaving(false); }
  }

  function requestRestoreRevision(revision: number) {
    if (!dirty) {
      void restoreRevision(revision);
      return;
    }
    setRestorePending(revision);
    setModal('restore');
  }

  async function restoreRevision(revision: number) {
    setSaving(true); setError('');
    try {
      await api(`/public-dashboard/revisions/${revision}/restore`, { method: 'POST', body: JSON.stringify({ expectedVersion: draftVersion }) });
      setRestorePending(null);
      setModal(null);
      setNotice(`Đã khôi phục phiên bản ${revision} thành bản nháp. Hãy kiểm tra trước khi công bố.`);
      await loadEditor();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setConflicted(true);
        setError('Không thể khôi phục vì bản nháp trên máy chủ đã thay đổi. Hãy tải bản máy chủ rồi thử lại.');
      } else setError(reason instanceof Error ? reason.message : 'Không thể khôi phục phiên bản');
    } finally { setSaving(false); }
  }

  function applyTemplate() {
    if (!templatePending) return;
    const next = templatePending.create();
    commitConfig(next);
    setTemplateKey(templatePending.key);
    setSelectedWidgetId(next.widgets[0]?.id ?? null);
    setTemplatePending(null);
  }

  async function openDocumentManager() {
    if (dirty && await saveDraft(false) === null) return;
    setModal('documents');
  }

  if (loading && !editor) return <Spinner />;
  if (!editor) return <section className="panel studio-load-error"><h2>Chưa thể mở trình thiết kế</h2><p>{error || 'Dữ liệu cấu hình chưa sẵn sàng.'}</p><button className="btn primary" onClick={() => void loadEditor()}>Thử lại</button></section>;

  const selectedWidget = config.widgets.find(widget => widget.id === selectedWidgetId) ?? null;
  const selectedLayout = config.layouts[device].find(item => item.i === selectedWidgetId) ?? null;
  const canvasClass = `studio-canvas-frame ${device}${previewMode ? ' preview' : ''}`;

  return <div className="public-dashboard-studio">
    <header className="studio-commandbar">
      <div className="studio-title-block"><LayoutDashboard /><div><span>PUBLIC DASHBOARD STUDIO</span><input aria-label="Tên bản thiết kế" maxLength={120} value={draftName} onChange={event => { setDraftName(event.target.value); setDirty(true); changeSerial.current += 1; }} /></div></div>
      <div className="studio-history-controls">
        <button type="button" disabled={!undoStack.length} onClick={undo} title="Hoàn tác"><Undo2 /></button>
        <button type="button" disabled={!redoStack.length} onClick={redo} title="Làm lại"><Redo2 /></button>
        <span className={`studio-save-state${error ? ' error' : dirty ? ' dirty' : ''}`}>{saving ? 'Đang lưu…' : error ? 'Có lỗi lưu' : dirty ? 'Chưa lưu' : 'Đã lưu bản nháp'}</span>
      </div>
      <div className="studio-device-switch" aria-label="Kích thước bản xem trước">{([
        ['desktop', Monitor, 'Máy tính'], ['tablet', Tablet, 'Máy tính bảng'], ['mobile', Smartphone, 'Điện thoại'],
      ] as const).map(([value, Icon, label]) => <button key={value} className={device === value ? 'active' : ''} type="button" onClick={() => setDevice(value)} title={label}><Icon /><span>{label}</span></button>)}</div>
      <div className="studio-primary-actions">
        <button type="button" className={`btn secondary${previewMode ? ' active' : ''}`} onClick={() => setPreviewMode(value => !value)}>{previewMode ? <Settings2 /> : <Eye />}{previewMode ? 'Chỉnh sửa' : 'Xem trước'}</button>
        <button type="button" className="btn secondary" disabled={saving || !dirty || conflicted} onClick={() => void saveDraft(false)}><Save />Lưu</button>
        <button type="button" className="btn primary" disabled={saving || conflicted} onClick={() => setModal('publish')}><Send />Công bố</button>
      </div>
    </header>

    {(error || notice) && <div className={`studio-message ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}><span>{error || notice}</span>{conflicted && <div className="studio-conflict-actions"><button type="button" onClick={() => { void navigator.clipboard.writeText(JSON.stringify({ name: draftName, templateKey, config }, null, 2)).then(() => setError('Xung đột vẫn đang được giữ an toàn. Đã sao chép bản thiết kế cục bộ để bạn đối chiếu.')).catch(() => setError('Không thể sao chép tự động. Hãy tải bản máy chủ sau khi đã lưu lại nội dung cần thiết.')); }}>Sao chép bản đang sửa</button><button type="button" onClick={() => { if (window.confirm('Tải bản máy chủ sẽ thay thế các thay đổi cục bộ chưa lưu. Bạn có muốn tiếp tục?')) void loadEditor(); }}>Tải bản máy chủ</button></div>}{!conflicted && <button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="Đóng thông báo">×</button>}</div>}

    {!previewMode && <nav className="studio-workspace-tabs" aria-label="Khu vực thiết kế đang hiển thị">
      <button type="button" className={workspacePane === 'library' ? 'active' : ''} aria-pressed={workspacePane === 'library'} onClick={() => setWorkspacePane('library')}><Palette />Thư viện</button>
      <button type="button" className={workspacePane === 'canvas' ? 'active' : ''} aria-pressed={workspacePane === 'canvas'} onClick={() => setWorkspacePane('canvas')}><LayoutDashboard />Bố cục</button>
      <button type="button" className={workspacePane === 'properties' ? 'active' : ''} aria-pressed={workspacePane === 'properties'} onClick={() => setWorkspacePane('properties')}><Settings2 />Thuộc tính</button>
    </nav>}

    <div className={`studio-workspace${previewMode ? ' preview-mode' : ''}`} data-pane={workspacePane}>
      {!previewMode && <aside className="studio-left-panel">
        <div className="studio-panel-tabs"><button className={leftSection === 'widgets' ? 'active' : ''} onClick={() => setLeftSection('widgets')}><Plus />Khối</button><button className={leftSection === 'templates' ? 'active' : ''} onClick={() => setLeftSection('templates')}><LayoutDashboard />Mẫu</button></div>
        {leftSection === 'widgets' ? <div className="studio-palette">
          <div className="studio-panel-heading"><span>THƯ VIỆN KHỐI</span><h3>Kéo vào trang hoặc bấm để thêm</h3></div>
          {widgetTypes.map(type => <button
            key={type}
            type="button"
            className="studio-palette-item"
            draggable
            disabled={config.widgets.length >= 40}
            title={config.widgets.length >= 40 ? 'Trang đã đạt giới hạn 40 khối' : undefined}
            onDragStart={(event: ReactDragEvent<HTMLButtonElement>) => { event.dataTransfer.setData('application/x-ioc-widget', type); event.dataTransfer.effectAllowed = 'copy'; }}
            onClick={() => addWidget(type)}
          ><GripVertical /><span><b>{PUBLIC_DASHBOARD_WIDGET_LABELS[type]}</b><small>{PUBLIC_DASHBOARD_WIDGET_DESCRIPTIONS[type]}</small></span><Plus /></button>)}
          <button type="button" className="studio-document-manager" onClick={() => void openDocumentManager()}><FileCheck2 /><span><b>Quản lý văn bản công khai</b><small>Chọn và xác nhận nội dung an toàn trước khi đưa lên trang.</small></span></button>
        </div> : <div className="studio-template-list">
          <div className="studio-panel-heading"><span>MẪU THIẾT KẾ</span><h3>Khởi tạo nhanh bằng bố cục chuyên nghiệp</h3></div>
          {PUBLIC_DASHBOARD_TEMPLATES.map(template => <button type="button" key={template.key} className={templateKey === template.key ? 'active' : ''} onClick={() => setTemplatePending(template)}><div className={`template-thumb ${template.key}`}><i /><i /><i /><i /></div><span><b>{template.name}</b><small>{template.description}</small></span>{templateKey === template.key && <Check />}</button>)}
        </div>}
      </aside>}

      <main className="studio-center" ref={studioCenterRef}>
        <div className="studio-canvas-toolbar"><span><b>{device === 'desktop' ? 'Màn hình lớn' : device === 'tablet' ? 'Máy tính bảng' : 'Điện thoại'}</b> · {PUBLIC_DASHBOARD_COLS[device]} cột</span><div><button type="button" onClick={() => setModal('history')}><History />Lịch sử</button><button type="button" onClick={() => updatePageSettings({ showHeader: !config.settings.showHeader })}>{config.settings.showHeader ? <Eye /> : <EyeOff />} Header</button><button type="button" onClick={() => updatePageSettings({ showFooter: !config.settings.showFooter })}>{config.settings.showFooter ? <Eye /> : <EyeOff />} Footer</button></div></div>
        <div className={canvasClass} onClick={() => setSelectedWidgetId(null)}>
          {previewMode ? <PublicDashboardRenderer config={config} data={previewData} studioPreview forcedBreakpoint={device} selectedWidgetId={selectedWidgetId} onSelectWidget={setSelectedWidgetId} /> : <GridLayout
            className="studio-grid-layout"
            layout={toLayoutItems(config.layouts[device])}
            cols={PUBLIC_DASHBOARD_COLS[device]}
            rowHeight={48}
            margin={[12, 12]}
            containerPadding={[12, 12]}
            compactType="vertical"
            draggableHandle=".studio-widget-drag-handle"
            isDroppable
            droppingItem={{ i: '__dropping__', x: 0, y: 0, w: Math.min(PUBLIC_DASHBOARD_COLS[device], 6), h: 4 }}
            onDrop={(_layout: readonly LayoutItem[], item: LayoutItem | undefined, event: Event) => {
              if (!item) return;
              const type = (event as globalThis.DragEvent).dataTransfer?.getData('application/x-ioc-widget') as PublicDashboardWidgetType;
              if (type && type in PUBLIC_DASHBOARD_WIDGET_LABELS) addWidget(type, { x: item.x, y: item.y });
            }}
            onLayoutChange={changeLayout}
          >{config.widgets.map(widget => <div key={widget.id} className={`studio-grid-item${selectedWidgetId === widget.id ? ' selected' : ''}`} onMouseDown={event => { event.stopPropagation(); setSelectedWidgetId(widget.id); }}>
            <div className="studio-widget-frame">
              <div className="studio-widget-chrome"><button type="button" className="studio-widget-drag-handle" aria-label={`Kéo khối ${widget.title ?? PUBLIC_DASHBOARD_WIDGET_LABELS[widget.type]}`}><GripVertical /></button><button type="button" className="studio-widget-select" aria-pressed={selectedWidgetId === widget.id} onClick={event => { event.stopPropagation(); setSelectedWidgetId(widget.id); }} onKeyDown={event => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); event.stopPropagation(); setSelectedWidgetId(widget.id); }}>{PUBLIC_DASHBOARD_WIDGET_LABELS[widget.type]}<span className="sr-only"> — chọn để chỉnh sửa</span></button><div><button type="button" onClick={event => { event.stopPropagation(); duplicateWidget(widget.id); }} title="Nhân bản"><Copy /></button><button type="button" onClick={event => { event.stopPropagation(); removeWidget(widget.id); }} title="Xóa"><Trash2 /></button></div></div>
              <div className="studio-widget-render"><section className={`public-widget public-widget-${widget.type}`}>{renderPublicDashboardWidget(widget, previewData)}</section></div>
            </div>
          </div>)}</GridLayout>}
        </div>
      </main>

      {!previewMode && <aside className="studio-inspector">
        <Inspector
          config={config}
          widget={selectedWidget}
          layout={selectedLayout}
          device={device}
          targets={editor.catalog.targets}
          documents={editor.catalog.documents}
          htmlTextareaRef={htmlTextareaRef}
          onTheme={updateTheme}
          onWidget={updateWidget}
          onSettings={updateWidgetSettings}
          onLayout={adjustSelectedLayout}
          onDuplicate={duplicateWidget}
          onRemove={removeWidget}
        />
      </aside>}
    </div>

    {modal === 'publish' && <Modal title="Công bố trang cho người dân" onClose={() => setModal(null)}>
      <div className="studio-publish-dialog"><div className="studio-assurance"><ShieldCheck /><div><strong>Trang chỉ sử dụng dữ liệu đã được phép công khai</strong><p>Hệ thống lưu bất biến bố cục và các mục dữ liệu đã chọn của lần công bố này. Metadata văn bản có lịch sử kiểm duyệt riêng.</p></div></div><label>Ghi chú phiên bản<textarea maxLength={500} value={changeNote} onChange={event => setChangeNote(event.target.value)} placeholder="Ví dụ: Cập nhật bố cục và bổ sung văn bản tháng 8" /></label><div className="studio-publish-summary"><span>{config.widgets.length} khối</span><span>Mẫu {PUBLIC_DASHBOARD_TEMPLATES.find(item => item.key === templateKey)?.name ?? templateKey}</span><span>Phiên bản hiện tại {editor.dashboard.publishedRevision ?? 'chưa có'}</span></div><div className="modal-actions"><button className="btn secondary" onClick={() => setModal(null)}>Hủy</button><button className="btn primary" disabled={saving} onClick={() => void publish()}><Send />{saving ? 'Đang công bố…' : 'Xác nhận công bố'}</button></div></div>
    </Modal>}

    {modal === 'history' && <Modal title="Lịch sử phiên bản công khai" onClose={() => setModal(null)} wide>
      <RevisionHistory items={historyItems} currentRevision={editor.dashboard.publishedRevision} saving={saving} onRestore={requestRestoreRevision} />
    </Modal>}

    {modal === 'restore' && restorePending !== null && <Modal title={`Khôi phục phiên bản ${restorePending}?`} onClose={() => { setRestorePending(null); setModal('history'); }}>
      <div className="studio-confirm-template"><RotateCcw /><p>Bản nháp hiện tại còn thay đổi chưa lưu. Nếu tiếp tục, toàn bộ các thay đổi này sẽ bị thay thế bằng nội dung của phiên bản {restorePending}. Trang người dân chưa thay đổi cho đến khi bạn công bố lại.</p><div className="modal-actions"><button className="btn secondary" disabled={saving} onClick={() => { setRestorePending(null); setModal('history'); }}>Quay lại lịch sử</button><button className="btn primary" disabled={saving} onClick={() => void restoreRevision(restorePending)}>{saving ? 'Đang khôi phục…' : 'Thay bản nháp hiện tại'}</button></div></div>
    </Modal>}

    {modal === 'documents' && <Modal title="Quản lý văn bản công khai" onClose={() => setModal(null)} wide>
      <DocumentPublicationManager documents={editor.catalog.documents} onChanged={async () => { await loadEditor(true); }} />
    </Modal>}

    {templatePending && <Modal title={`Áp dụng mẫu “${templatePending.name}”`} onClose={() => setTemplatePending(null)}>
      <div className="studio-confirm-template"><LayoutDashboard /><p>Mẫu sẽ thay thế toàn bộ khối và bố cục trong bản nháp hiện tại. Bạn vẫn có thể dùng nút Hoàn tác ngay sau đó.</p><div className="modal-actions"><button className="btn secondary" onClick={() => setTemplatePending(null)}>Giữ bố cục hiện tại</button><button className="btn primary" onClick={applyTemplate}>Áp dụng mẫu</button></div></div>
    </Modal>}
  </div>;
}

type InspectorProps = {
  config: PublicDashboardConfig;
  widget: PublicDashboardWidget | null;
  layout: PublicDashboardConfig['layouts'][PublicDashboardBreakpoint][number] | null;
  device: PublicDashboardBreakpoint;
  targets: PublicDashboardEditorResponse['catalog']['targets'];
  documents: DashboardEditorDocument[];
  htmlTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onTheme: (patch: Partial<PublicDashboardConfig['theme']>) => void;
  onWidget: (widget: PublicDashboardWidget) => void;
  onSettings: (patch: Record<string, unknown>) => void;
  onLayout: (patch: Partial<Pick<LayoutItem, 'x' | 'y' | 'w' | 'h'>>) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
};

function Inspector({ config, widget, layout, device, targets, documents, htmlTextareaRef, onTheme, onWidget, onSettings, onLayout, onDuplicate, onRemove }: InspectorProps) {
  const [themeOpen, setThemeOpen] = useState(false);
  return <div className="studio-inspector-inner">
    <div className="studio-panel-heading"><span>THUỘC TÍNH</span><h3>{widget ? PUBLIC_DASHBOARD_WIDGET_LABELS[widget.type] : 'Thiết kế trang'}</h3></div>
    <button type="button" className="studio-inspector-section-toggle" onClick={() => setThemeOpen(value => !value)}><Palette />Giao diện chung{themeOpen ? <ChevronUp /> : <ChevronDown />}</button>
    {themeOpen && <div className="studio-theme-editor">
      <ColorField label="Màu nhấn" value={config.theme.accent} onChange={accent => onTheme({ accent })} />
      <ColorField label="Nền trang" value={config.theme.background} onChange={background => onTheme({ background })} />
      <ColorField label="Nền khối" value={config.theme.surface} onChange={surface => onTheme({ surface })} />
      <ColorField label="Màu chữ" value={config.theme.text} onChange={text => onTheme({ text })} />
      <label>Độ rộng nội dung<input type="number" min={960} max={1920} step={20} value={config.theme.contentWidth} onChange={event => onTheme({ contentWidth: Number(event.target.value) })} /></label>
      <label>Bo góc khối<input type="range" min={0} max={36} value={config.theme.radius} onChange={event => onTheme({ radius: Number(event.target.value) })} /><span>{config.theme.radius}px</span></label>
    </div>}
    {!widget || !layout ? <div className="studio-inspector-empty"><Settings2 /><strong>Chọn một khối để tùy chỉnh</strong><p>Bấm vào khối trên trang hoặc kéo khối mới từ thư viện.</p></div> : <>
      <div className="studio-inspector-fields">
        <label>Tiêu đề khối<input maxLength={160} value={widget.title ?? ''} onChange={event => onWidget({ ...widget, title: event.target.value })} /></label>
        <div className="studio-size-grid"><label>Rộng ({device})<input type="number" min={1} max={PUBLIC_DASHBOARD_COLS[device]} value={layout.w} onChange={event => onLayout({ w: Number(event.target.value) })} /></label><label>Cao<input type="number" min={publicDashboardWidgetMinHeight(widget.type, device)} max={30} value={layout.h} onChange={event => onLayout({ h: Number(event.target.value) })} /></label></div>
        <div className="studio-accessible-move"><span>Điều chỉnh không cần kéo chuột</span><div><button type="button" onClick={() => onLayout({ y: Math.max(0, layout.y - 1) })}><MoveUp />Lên</button><button type="button" onClick={() => onLayout({ y: layout.y + 1 })}><MoveDown />Xuống</button></div></div>
      </div>
      <WidgetSettings widget={widget} targets={targets} documents={documents} htmlTextareaRef={htmlTextareaRef} onSettings={onSettings} />
      <div className="studio-inspector-actions"><button type="button" onClick={() => onDuplicate(widget.id)}><Copy />Nhân bản</button><button type="button" className="danger" onClick={() => onRemove(widget.id)}><Trash2 />Xóa khối</button></div>
    </>}
  </div>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label>{label}<span className="studio-color-field"><input type="color" value={value} onChange={event => onChange(event.target.value)} /><input value={value} pattern="^#[0-9a-fA-F]{6}$" onChange={event => onChange(event.target.value)} /></span></label>;
}

function WidgetSettings({ widget, targets, documents, htmlTextareaRef, onSettings }: {
  widget: PublicDashboardWidget;
  targets: PublicDashboardEditorResponse['catalog']['targets'];
  documents: DashboardEditorDocument[];
  htmlTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onSettings: (patch: Record<string, unknown>) => void;
}) {
  const [targetSearch, setTargetSearch] = useState('');
  const [documentSearch, setDocumentSearch] = useState('');
  const maxItems = Number(widget.settings.maxItems) || 6;
  if (widget.type === 'overviewMetrics') {
    const selected = Array.isArray(widget.settings.metricKeys) ? widget.settings.metricKeys : [];
    return <InspectorSection title="Chỉ số hiển thị" icon={<Database />}><div className="studio-check-list">{[
      ['departments', 'Đơn vị có chỉ tiêu'], ['total', 'Tổng chỉ tiêu'], ['completed', 'Đã hoàn thành'], ['overallProgress', 'Tiến độ chung'],
    ].map(([key, label]) => {
      const checked = selected.includes(key);
      const lastSelected = checked && selected.length === 1;
      return <label key={key}><input type="checkbox" checked={checked} disabled={lastSelected} title={lastSelected ? 'Cần giữ lại ít nhất một số liệu' : undefined} onChange={event => onSettings({ metricKeys: event.target.checked ? [...selected, key] : selected.filter(item => item !== key) })} />{label}</label>;
    })}</div><p className="studio-field-note">Khối tổng quan cần hiển thị ít nhất một số liệu.</p></InspectorSection>;
  }
  if (widget.type === 'targetList') {
    const mode = widget.settings.mode ?? 'highlight';
    const selected = Array.isArray(widget.settings.targetKeys) ? widget.settings.targetKeys : [];
    const filtered = targets.filter(target => `${target.code} ${target.title} ${target.department}`.toLowerCase().includes(targetSearch.toLowerCase())).slice(0, 30);
    return <InspectorSection title="Nguồn chỉ tiêu" icon={<Database />}><label>Chế độ<select value={mode} onChange={event => {
      const nextMode = event.target.value;
      if (nextMode === 'selected') {
        if (!targets.length) return;
        onSettings({ mode: nextMode, targetKeys: selected.length ? selected : [targets[0].key] });
      }
      else onSettings({ mode: nextMode });
    }}><option value="highlight">Chỉ tiêu nổi bật</option><option value="all">Tất cả chỉ tiêu công khai</option><option value="selected" disabled={!targets.length}>Tự chọn chỉ tiêu</option></select></label><label>Số lượng tối đa<input type="number" min={1} max={24} value={maxItems} onChange={event => onSettings({ maxItems: Number(event.target.value) })} /></label>{mode === 'selected' && <><label>Tìm chỉ tiêu<input value={targetSearch} onChange={event => setTargetSearch(event.target.value)} placeholder="Mã, tên hoặc đơn vị" /></label><div className="studio-selection-list">{filtered.map(target => {
      const checked = selected.includes(target.key);
      const lastSelected = checked && selected.length === 1;
      return <label key={target.key}><input type="checkbox" checked={checked} disabled={lastSelected} title={lastSelected ? 'Cần giữ lại ít nhất một chỉ tiêu' : undefined} onChange={event => onSettings({ targetKeys: event.target.checked ? [...selected, target.key] : selected.filter(key => key !== target.key) })} /><span><b>{target.code}</b>{target.title}<small>{target.department}</small></span></label>;
    })}</div><p className="studio-field-note">Chế độ tự chọn cần ít nhất một chỉ tiêu. Chỉ các chỉ tiêu đã được phép công khai mới xuất hiện.</p></>}</InspectorSection>;
  }
  if (widget.type === 'departmentProgress' || widget.type === 'feedbackList') {
    return <InspectorSection title="Phạm vi dữ liệu" icon={<Database />}><label>Số lượng tối đa<input type="number" min={1} max={widget.type === 'feedbackList' ? 12 : 24} value={maxItems} onChange={event => onSettings({ maxItems: Number(event.target.value) })} /></label><p className="studio-field-note">Dữ liệu chỉ lấy từ nội dung đã hoàn tất quy trình công bố.</p></InspectorSection>;
  }
  if (widget.type === 'documentList') {
    const publicationIds = Array.isArray(widget.settings.publicationIds) ? widget.settings.publicationIds : [];
    const published = documents.filter(document => document.publication && !document.publication.revokedAt);
    const filtered = published.filter(document => `${document.code} ${document.publication?.title}`.toLowerCase().includes(documentSearch.toLowerCase()));
    return <InspectorSection title="Văn bản được hiển thị" icon={<FileText />}><label>Số lượng tối đa<input type="number" min={1} max={20} value={maxItems} onChange={event => onSettings({ maxItems: Number(event.target.value) })} /></label><label>Tìm văn bản<input value={documentSearch} onChange={event => setDocumentSearch(event.target.value)} placeholder="Mã hoặc tên công khai" /></label><div className="studio-selection-note"><span>Chỉ những văn bản được đánh dấu bên dưới mới xuất hiện trên trang người dân. Văn bản công bố sau này không được tự động thêm vào.</span>{publicationIds.length > 0 && <button type="button" onClick={() => onSettings({ publicationIds: [] })}>Bỏ chọn tất cả</button>}</div><div className="studio-selection-list">{filtered.map(document => <label key={document.id}><input type="checkbox" checked={publicationIds.includes(document.publication!.id)} onChange={event => onSettings({ publicationIds: event.target.checked ? [...publicationIds, document.publication!.id] : publicationIds.filter(id => id !== document.publication!.id) })} /><span><b>{document.code}</b>{document.publication!.title}<small>{document.publication!.publishedAt ? `Công bố ${new Date(document.publication!.publishedAt).toLocaleDateString('vi-VN')}` : 'Bản nháp công bố'}</small></span></label>)}</div>{!publicationIds.length && published.length > 0 && <p className="studio-field-note">Chưa chọn văn bản nào cho khối này.</p>}{!published.length && <p className="studio-field-note">Chưa có văn bản nào được xác nhận công khai. Mở “Quản lý văn bản công khai” ở thư viện khối.</p>}</InspectorSection>;
  }
  if (widget.type === 'richText') {
    return <InspectorSection title="Nội dung" icon={<FileText />}><label>Đoạn giới thiệu<textarea rows={8} maxLength={3000} value={String(widget.settings.body ?? '')} onChange={event => onSettings({ body: event.target.value })} /></label></InspectorSection>;
  }
  if (widget.type === 'cta') {
    return <InspectorSection title="Liên kết" icon={<Settings2 />}><label>Mô tả<textarea rows={4} maxLength={500} value={String(widget.settings.body ?? '')} onChange={event => onSettings({ body: event.target.value })} /></label><label>Nhãn nút<input maxLength={80} value={String(widget.settings.label ?? '')} onChange={event => onSettings({ label: event.target.value })} /></label><label>Đường dẫn<input maxLength={500} value={String(widget.settings.href ?? '')} onChange={event => onSettings({ href: event.target.value })} /></label></InspectorSection>;
  }
  return <CustomHtmlSettings widget={widget} targets={targets} documents={documents} htmlTextareaRef={htmlTextareaRef} onSettings={onSettings} />;
}

function InspectorSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <section className="studio-inspector-section"><h4>{icon}{title}</h4>{children}</section>;
}

function CustomHtmlSettings({ widget, targets, documents, htmlTextareaRef, onSettings }: {
  widget: PublicDashboardWidget;
  targets: PublicDashboardEditorResponse['catalog']['targets'];
  documents: DashboardEditorDocument[];
  htmlTextareaRef: RefObject<HTMLTextAreaElement | null>;
  onSettings: (patch: Record<string, unknown>) => void;
}) {
  const bindings = Array.isArray(widget.settings.bindings) ? widget.settings.bindings : [];
  const html = String(widget.settings.html ?? '');
  const [slotDrafts, setSlotDrafts] = useState<Record<number, string>>({});
  function updateBinding(index: number, patch: Partial<CustomHtmlBinding>) {
    onSettings({ bindings: bindings.map((binding, position) => position === index ? { ...binding, ...patch } : binding) });
  }
  function addBinding() {
    if (bindings.length >= 30) return;
    let index = bindings.length + 1;
    let slot = `du_lieu_${index}`;
    while (bindings.some(binding => binding.slot === slot)) slot = `du_lieu_${++index}`;
    const token = `{{${slot}}}`;
    const textarea = htmlTextareaRef.current;
    const start = textarea?.selectionStart ?? html.length;
    const end = textarea?.selectionEnd ?? start;
    onSettings({
      bindings: [...bindings, { slot, label: `Dữ liệu ${index}`, source: 'overview', field: 'total', format: 'number' }],
      html: `${html.slice(0, start)}${token}${html.slice(end)}`,
    });
    window.setTimeout(() => { textarea?.focus(); textarea?.setSelectionRange(start + token.length, start + token.length); }, 0);
  }
  function insertToken(slot: string) {
    const textarea = htmlTextareaRef.current;
    const token = `{{${slot}}}`;
    const start = textarea?.selectionStart ?? html.length;
    const end = textarea?.selectionEnd ?? start;
    onSettings({ html: `${html.slice(0, start)}${token}${html.slice(end)}` });
    window.setTimeout(() => { textarea?.focus(); textarea?.setSelectionRange(start + token.length, start + token.length); }, 0);
  }
  function renameBindingSlot(index: number, slot: string) {
    const current = bindings[index];
    if (!current || !/^[a-z][a-z0-9_-]{0,49}$/.test(slot) || bindings.some((item, position) => position !== index && item.slot === slot)) return;
    const escaped = current.slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextHtml = html
      .replace(new RegExp(`{{\\s*${escaped}\\s*}}`, 'g'), `{{${slot}}}`)
      .replace(new RegExp(`(data-ioc-slot\\s*=\\s*["'])${escaped}(["'])`, 'gi'), `$1${slot}$2`);
    onSettings({
      bindings: bindings.map((binding, position) => position === index ? { ...binding, slot } : binding),
      html: nextHtml,
    });
  }
  function removeBinding(index: number) {
    const current = bindings[index];
    if (!current) return;
    const escaped = current.slot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextHtml = html
      .replace(new RegExp(`{{\\s*${escaped}\\s*}}`, 'g'), '')
      .replace(new RegExp(`\\s*data-ioc-slot\\s*=\\s*["']${escaped}["']`, 'gi'), '');
    onSettings({ bindings: bindings.filter((_, position) => position !== index), html: nextHtml });
  }
  function setSnippet(kind: 'metric' | 'notice' | 'columns') {
    if (kind === 'metric') {
      onSettings({
        html: '<section class="custom-card"><p>Tổng số chỉ tiêu công khai</p><strong>{{tong_chi_tieu}}</strong></section>',
        bindings: [{ slot: 'tong_chi_tieu', label: 'Tổng chỉ tiêu', source: 'overview', field: 'total', format: 'number' } satisfies CustomHtmlBinding],
      });
      return;
    }
    if (kind === 'notice') {
      onSettings({
        html: '<section class="custom-card"><h2>Thông tin cập nhật</h2><p>Dữ liệu được cập nhật gần nhất vào {{ngay_cap_nhat}}.</p></section>',
        bindings: [{ slot: 'ngay_cap_nhat', label: 'Ngày cập nhật', source: 'overview', field: 'updatedAt', format: 'date' } satisfies CustomHtmlBinding],
      });
      return;
    }
    onSettings({
      html: '<section class="custom-card custom-columns"><div><p>Chỉ tiêu</p><strong>{{tong_chi_tieu}}</strong></div><div><p>Tiến độ</p><strong>{{tien_do}}</strong></div></section>',
      bindings: [
        { slot: 'tong_chi_tieu', label: 'Tổng chỉ tiêu', source: 'overview', field: 'total', format: 'number' } satisfies CustomHtmlBinding,
        { slot: 'tien_do', label: 'Tiến độ chung', source: 'overview', field: 'overallProgress', format: 'percent' } satisfies CustomHtmlBinding,
      ],
    });
  }
  return <InspectorSection title="HTML và dữ liệu" icon={<Code2 />}>
    <div className="studio-html-assurance"><ShieldCheck /><span>Script, biểu mẫu, iframe và thuộc tính nguy hiểm bị loại bỏ. Nội dung chạy trong iframe sandbox không có quyền thực thi mã.</span></div>
    <div className="studio-snippets"><span>Mẫu nhanh</span><button onClick={() => setSnippet('metric')}>Thẻ số liệu</button><button onClick={() => setSnippet('notice')}>Thông báo</button><button onClick={() => setSnippet('columns')}>Hai số liệu</button></div>
    <label>Mã HTML<textarea ref={htmlTextareaRef} className="studio-code-editor" rows={11} maxLength={30000} spellCheck={false} value={html} onChange={event => onSettings({ html: event.target.value })} /></label>
    <div className="studio-binding-head"><div><b>Dữ liệu trong HTML</b><small>Chèn biến tại vị trí con trỏ, không cần viết API.</small></div><button type="button" disabled={bindings.length >= 30} title={bindings.length >= 30 ? 'Đã đạt giới hạn 30 biến dữ liệu' : undefined} onClick={addBinding}><Plus />Chèn dữ liệu</button></div>
    <div className="studio-bindings">{bindings.map((binding, index) => {
      const slotDraft = slotDrafts[index] ?? binding.slot;
      const slotDuplicate = bindings.some((item, position) => position !== index && item.slot === slotDraft);
      const slotInvalid = !/^[a-z][a-z0-9_-]{0,49}$/.test(slotDraft) || slotDuplicate;
      const slotErrorId = `binding-slot-error-${widget.id}-${index}`;
      return <article key={`${binding.slot}-${index}`}>
      <div><label>Tên gợi nhớ<input maxLength={100} value={binding.label} onChange={event => { if (event.target.value.trim()) updateBinding(index, { label: event.target.value }); }} /></label><label>Mã biến<input maxLength={50} value={slotDraft} pattern="^[a-z][a-z0-9_-]{0,49}$" aria-invalid={slotInvalid} aria-describedby={slotInvalid ? slotErrorId : undefined} onChange={event => {
        const slot = event.target.value;
        setSlotDrafts(current => ({ ...current, [index]: slot }));
        if (/^[a-z][a-z0-9_-]{0,49}$/.test(slot) && !bindings.some((item, position) => position !== index && item.slot === slot)) renameBindingSlot(index, slot);
      }} />{slotInvalid && <small id={slotErrorId} className="studio-field-error">{slotDuplicate ? 'Mã biến đang trùng với biến khác.' : 'Bắt đầu bằng chữ thường; chỉ dùng chữ thường, số, _ hoặc - (tối đa 50 ký tự).'}</small>}</label></div>
      <label>Nguồn<select value={binding.source} onChange={event => {
        const source = event.target.value as CustomHtmlBinding['source'];
        updateBinding(index, {
          source,
          field: bindingFields[source][0][0],
          targetKey: source === 'target' ? targets[0]?.key : undefined,
          documentId: source === 'document' ? documents.find(document => document.publication && !document.publication.revokedAt)?.publication?.id : undefined,
        });
      }}><option value="overview">Tổng quan</option><option value="target" disabled={!targets.length}>Một chỉ tiêu</option><option value="document" disabled={!documents.some(document => document.publication && !document.publication.revokedAt)}>Một văn bản</option></select></label>
      {binding.source === 'target' && <label>Chỉ tiêu<select value={binding.targetKey ?? ''} onChange={event => updateBinding(index, { targetKey: event.target.value })}><option value="">Chọn chỉ tiêu</option>{targets.map(target => <option key={target.key} value={target.key}>{target.code} · {target.title}</option>)}</select></label>}
      {binding.source === 'document' && <label>Văn bản<select value={binding.documentId ?? ''} onChange={event => updateBinding(index, { documentId: event.target.value })}><option value="">Chọn văn bản</option>{documents.filter(document => document.publication && !document.publication.revokedAt).map(document => <option key={document.publication!.id} value={document.publication!.id}>{document.code} · {document.publication!.title}</option>)}</select></label>}
      <div><label>Trường<select value={binding.field} onChange={event => updateBinding(index, { field: event.target.value })}>{bindingFields[binding.source].map(([field, label]) => <option key={field} value={field}>{label}</option>)}</select></label><label>Định dạng<select value={binding.format ?? 'text'} onChange={event => updateBinding(index, { format: event.target.value })}><option value="text">Văn bản</option><option value="number">Số</option><option value="percent">Phần trăm</option><option value="date">Ngày tháng</option></select></label></div>
      <footer><code>{`{{${binding.slot}}}`}</code><button type="button" onClick={() => insertToken(binding.slot)}>Chèn tại con trỏ</button><button type="button" className="danger" onClick={() => removeBinding(index)}>Xóa</button></footer>
    </article>; })}</div>
  </InspectorSection>;
}

function RevisionHistory({ items, currentRevision, saving, onRestore }: { items: PublicDashboardRevision[]; currentRevision?: number | null; saving: boolean; onRestore: (revision: number) => void }) {
  return <div className="studio-revision-list">{items.length ? items.map(item => <article key={item.revision} className={item.revision === currentRevision ? 'current' : ''}><div><History /><span><b>Phiên bản {item.revision}</b><small>{item.publishedAt ? new Date(item.publishedAt).toLocaleString('vi-VN') : 'Không rõ thời điểm'}{item.publishedBy ? ` · ${item.publishedBy}` : ''}</small></span></div><p>{item.changeNote || 'Không có ghi chú phiên bản.'}</p>{item.revision === currentRevision ? <strong><Check />Đang công khai</strong> : <button type="button" disabled={saving} onClick={() => onRestore(item.revision)}><RotateCcw />Khôi phục thành bản nháp</button>}</article>) : <div className="studio-modal-empty"><History /><strong>Chưa có phiên bản công khai</strong><p>Phiên bản đầu tiên sẽ xuất hiện sau khi bạn công bố trang.</p></div>}</div>;
}

function DocumentPublicationManager({ documents, onChanged }: { documents: DashboardEditorDocument[]; onChanged: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const filtered = documents.filter(document => `${document.code} ${document.title} ${document.publication?.title ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="studio-document-publications"><div className="studio-document-intro"><ShieldCheck /><div><strong>Chỉ công bố văn bản đã được kiểm tra</strong><p>Tên và tóm tắt dưới đây là bản chụp dành riêng cho người dân. Thu hồi không xóa văn bản gốc.</p></div></div><label className="studio-document-search">Tìm văn bản<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Mã hoặc tên văn bản" /></label><div className="studio-document-list">{filtered.map(document => <DocumentPublicationRow key={document.id} document={document} editing={editingId === document.id} onEdit={() => setEditingId(document.id)} onCancel={() => setEditingId(null)} onChanged={async () => { setEditingId(null); await onChanged(); }} />)}</div></div>;
}

function DocumentPublicationRow({ document, editing, onEdit, onCancel, onChanged }: { document: DashboardEditorDocument; editing: boolean; onEdit: () => void; onCancel: () => void; onChanged: () => Promise<void> }) {
  const publication = document.publication;
  const currentlyPublic = Boolean(publication && !publication.revokedAt);
  const [title, setTitle] = useState(publication?.title ?? document.title);
  const [summary, setSummary] = useState(publication?.summary ?? '');
  const [publicValue, setPublicValue] = useState(currentlyPublic);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setTitle(publication?.title ?? document.title);
    setSummary(publication?.summary ?? '');
    setPublicValue(currentlyPublic);
    setConfirmed(false);
    setError('');
  }, [document.id, document.title, publication?.id, publication?.version, publication?.revokedAt, editing]);
  async function save() {
    setSaving(true); setError('');
    try {
      await api(`/public-dashboard/documents/${document.id}/publication`, { method: 'PUT', body: JSON.stringify({ expectedVersion: publication?.version, title: title.trim(), summary: summary.trim() || undefined, confirmedSafe: true, public: publicValue }) });
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể cập nhật trạng thái công khai'); }
    finally { setSaving(false); }
  }
  return <article className={currentlyPublic ? 'published' : ''}><header><FileText /><div><span>{document.code}</span><strong>{document.title}</strong><small>{document.status === 'PROCESSED' ? 'Đã xử lý' : document.status}</small></div><i>{currentlyPublic ? 'Đang công khai' : publication ? 'Đã thu hồi' : 'Nội bộ'}</i></header>{editing ? <div className="studio-document-form">{error && <div className="form-error">{error}</div>}<label>Tiêu đề dành cho người dân<input required maxLength={240} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Tóm tắt an toàn<textarea rows={4} maxLength={1200} value={summary} onChange={event => setSummary(event.target.value)} /></label><label className="studio-public-toggle"><input type="checkbox" checked={publicValue} onChange={event => setPublicValue(event.target.checked)} /><span>{publicValue ? 'Cho phép xuất hiện trong thư viện khối' : 'Thu hồi khỏi trang công khai'}</span></label><label className="studio-safety-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Tôi đã kiểm tra và loại bỏ thông tin cá nhân, nội dung nội bộ và dữ liệu không được phép công bố.</span></label><footer><button className="btn secondary" onClick={onCancel}>Hủy</button><button className="btn primary" disabled={saving || !confirmed || !title.trim()} onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu trạng thái công khai'}</button></footer></div> : <button type="button" className="studio-edit-document" disabled={document.status !== 'PROCESSED'} onClick={onEdit}>{document.status === 'PROCESSED' ? publication ? 'Chỉnh sửa công bố' : 'Chuẩn bị công bố' : 'Chờ xử lý văn bản'}</button>}</article>;
}
