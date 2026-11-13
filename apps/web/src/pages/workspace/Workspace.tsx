import {
  AppstoreAddOutlined, ArrowDownOutlined, ArrowUpOutlined, CheckOutlined, CloudSyncOutlined,
  CopyOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, EllipsisOutlined, ExpandOutlined,
  FullscreenExitOutlined, HolderOutlined, LinkOutlined, PlusOutlined, SearchOutlined,
  SettingOutlined, DesktopOutlined, RobotOutlined, UploadOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, ConfigProvider, Drawer, Dropdown, Empty, Input, Modal, Select, Slider, Spin, Switch, Tooltip, theme } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout';
import { useNavigate } from 'react-router-dom';
import { fold, navItems } from '@/app/nav';
import { useMe } from '@/app/session';
import { useThemeMode } from '@/app/theme';
import { lunarLabel } from '@/lib/lunar';
import { DeskBriefingHeader, DeskSystemNotes } from './DeskBriefing';
import { DeskNotesLayer, NoteComposerButton } from './DeskNotes';
import { APP_ICONS, DeskApps, WorkAppIcon } from './DeskApps';
import { WidgetIcon } from './WidgetIcon';
import { can } from '@/lib/roles';
import { errorText, saveBlob } from '@/lib/api';
import { WIDGETS, makeWidget, safeShortcut, templateWidgets, uid, validConfig, type Shortcut, type WidgetType, type WorkspaceConfig, type WorkspaceWidget } from './model';
import { useWorkspace } from './useWorkspace';
import { WidgetSettings, WorkspaceWidgetBody, widgetSettingsError } from './Widgets';
import { EXTRA_WALLPAPERS, WallpaperArtwork } from './background/presets';
import { resolveDaylightPreset } from './background/daylight';
import 'react-grid-layout/css/styles.css';
import './workspace.css';

const WALLPAPERS = [
  { id: 'aurora', name: 'Cực quang', caption: 'Yên tĩnh, sâu lắng' },
  { id: 'summit', name: 'Miền xanh', caption: 'Một góc thiên nhiên' },
  { id: 'dusk', name: 'Chạng vạng', caption: 'Ấm áp, đầy cảm hứng' },
  { id: 'cosmos', name: 'Vũ trụ', caption: 'Không gian sáng tạo' },
  { id: 'ocean', name: 'Đại dương', caption: 'Trong trẻo, thư thái' },
  { id: 'graphite', name: 'Tối giản', caption: 'Tập trung vào điều chính' },
  ...EXTRA_WALLPAPERS,
];
const ACCENTS = ['#7ce6c5', '#9bbcff', '#c4a6ff', '#f2b7cc', '#f4ce8b', '#9ddbe7'];
const ICONS = Object.keys(APP_ICONS);
const requestCommand = () => window.dispatchEvent(new Event('ioc:open-command'));
const requestJarvis = () => window.dispatchEvent(new Event('ioc:open-jarvis'));

function Landscape() {
  return <svg className="ws-landscape" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="ws-mountain" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#408b82" stopOpacity=".34"/><stop offset="1" stopColor="#061d29" stopOpacity=".1"/></linearGradient></defs>
    <path d="M0 520 Q190 340 340 470 T650 330 Q760 240 920 390 T1180 350 Q1390 160 1600 380 V900 H0Z" fill="url(#ws-mountain)"/>
    <path d="M0 650 Q160 420 370 580 T790 510 Q900 420 1090 600 T1600 480 V900 H0Z" fill="#0e3844" opacity=".37"/>
    <path d="M0 770 Q240 580 470 730 T940 670 T1600 720 V900 H0Z" fill="#071d2b" opacity=".55"/>
  </svg>;
}

export default function Workspace() {
  const me = useMe();
  return <WorkspaceForUser key={me.id} />;
}

function WorkspaceForUser() {
  const me = useMe();
  const navigate = useNavigate();
  const { dark } = useThemeMode();
  const { message, modal } = App.useApp();
  const { config, setConfig, ready, status, error, reload, retry, keepLocal } = useWorkspace(me.id);
  const { width, containerRef, mounted } = useContainerWidth();
  const [editing, setEditing] = useState(false);
  const [focus, setFocus] = useState(false);
  const [library, setLibrary] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [help, setHelp] = useState(false);
  const [category, setCategory] = useState('Tất cả');
  const [search, setSearch] = useState('');
  const [widgetDraft, setWidgetDraft] = useState<WorkspaceWidget | null>(null);
  const [shortcutDraft, setShortcutDraft] = useState<Shortcut | null>(null);
  const [spaceDraft, setSpaceDraft] = useState<{ id?: string; name: string } | null>(null);
  const [now, setNow] = useState(new Date());
  const [undo, setUndo] = useState<WorkspaceConfig | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const wallpaperRef = useRef<HTMLInputElement>(null);
  const space = config.spaces.find(s => s.id === config.activeSpace) ?? config.spaces[0];
  const mobile = width < 760;
  const shortcuts = config.shortcuts.filter(s => !s.url.startsWith('/admin') || !navItems.some(n => n.path === s.url && !can(me, n.roles)));
  const change = useCallback((fn: (previous: WorkspaceConfig) => WorkspaceConfig) => setConfig(fn), [setConfig]);
  const changeWidgets = (fn: (widgets: WorkspaceWidget[]) => WorkspaceWidget[]) => change(c => ({ ...c, spaces: c.spaces.map(s => s.id === c.activeSpace ? { ...s, widgets: fn(s.widgets) } : s) }));
  const snapshot = () => setUndo(structuredClone(config));

  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ioc:workspace-focus', { detail: focus }));
    return () => { window.dispatchEvent(new CustomEvent('ioc:workspace-focus', { detail: false })); };
  }, [focus]);
  const openShortcut = useCallback((shortcut: Shortcut) => {
    if (!safeShortcut(shortcut.url)) return;
    if (shortcut.url.startsWith('/')) navigate(shortcut.url);
    else window.open(shortcut.url, '_blank', 'noopener,noreferrer');
  }, [navigate]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocus(false);
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable=true]') || library || appearance || widgetDraft || shortcutDraft || spaceDraft || help) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const shortcut = shortcuts.find(s => s.hotkey === event.key);
        if (shortcut) { event.preventDefault(); openShortcut(shortcut); }
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e') { event.preventDefault(); setEditing(v => !v); }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); setFocus(v => !v); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [shortcuts, openShortcut, library, appearance, widgetDraft, shortcutDraft, spaceDraft, help]);

  function addWidget(type: WidgetType) {
    if (space.widgets.length >= 40) { void message.warning('Mỗi không gian có tối đa 40 tiện ích.'); return; }
    snapshot();
    const next = makeWidget(type, 0, Math.max(0, ...space.widgets.map(w => w.y + w.h)));
    changeWidgets(widgets => [...widgets, next]);
    setLibrary(false);
    if (['api', 'embed', 'countdown'].includes(type)) setWidgetDraft(next);
    void message.success(`Đã thêm ${next.title.toLowerCase()}`);
  }
  function updateLayout(layout: Layout) {
    if (mobile || !layout.some(l => {
      const w = space.widgets.find(item => item.id === l.i);
      return w && (w.x !== l.x || w.y !== l.y || w.w !== l.w || w.h !== l.h);
    })) return;
    changeWidgets(widgets => widgets.map(w => {
      const l = layout.find(item => item.i === w.id);
      return l && (w.x !== l.x || w.y !== l.y || w.w !== l.w || w.h !== l.h) ? { ...w, x: l.x, y: l.y, w: l.w, h: l.h } : w;
    }));
  }
  function exportWorkspace() {
    saveBlob(new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' }), `ban-lam-viec-${now.toISOString().slice(0, 10)}.json`);
  }
  async function importWorkspace(file?: File) {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('Bản sao không được vượt quá 2 MB.');
      const next: unknown = JSON.parse(await file.text());
      if (!validConfig(next)) throw new Error('Bản sao không đúng định dạng bàn làm việc.');
      modal.confirm({ title: 'Khôi phục bàn làm việc từ bản sao?', content: 'Bố cục, tiện ích và lối tắt hiện tại sẽ được thay thế. Bạn có thể hoàn tác một lần từ menu bàn làm việc.', okText: 'Khôi phục', cancelText: 'Giữ hiện tại', onOk: () => { snapshot(); setConfig(next); void message.success('Đã khôi phục bàn làm việc.'); } });
    } catch (err) { void message.error(errorText(err)); }
    if (importRef.current) importRef.current.value = '';
  }
  async function uploadWallpaper(file?: File) {
    if (!file) return;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15_000_000) throw new Error('Chọn ảnh JPG, PNG hoặc WebP dưới 15 MB.');
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1920 / bitmap.width, 1080 / bitmap.height);
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const data = canvas.toDataURL('image/jpeg', 0.8);
      if (data.length > 1_350_000) throw new Error('Ảnh còn quá lớn sau khi tối ưu. Hãy chọn ảnh nhẹ hơn.');
      change(c => ({ ...c, appearance: { ...c.appearance, wallpaper: 'custom', customWallpaper: data, daylight: false } }));
      void message.success('Đã đặt hình nền của bạn.');
    } catch (err) { void message.error(errorText(err)); }
    if (wallpaperRef.current) wallpaperRef.current.value = '';
  }
  function applyTemplate(name: string) {
    modal.confirm({ title: 'Áp dụng bố cục mẫu?', content: `Các tiện ích trong “${space.name}” sẽ được thay thế. Các không gian khác được giữ nguyên.`, okText: 'Áp dụng', cancelText: 'Hủy', onOk: () => { snapshot(); changeWidgets(() => templateWidgets(name)); setAppearance(false); } });
  }
  function commitShortcut() {
    if (!shortcutDraft) return;
    const next = { ...shortcutDraft, title: shortcutDraft.title.trim(), url: shortcutDraft.url.trim() };
    if (!next.title || !safeShortcut(next.url)) { void message.warning('Nhập tên và đường dẫn nội bộ hoặc URL http/https hợp lệ.'); return; }
    if (next.hotkey && config.shortcuts.some(s => s.id !== next.id && s.hotkey === next.hotkey)) { void message.warning('Phím tắt này đã được gán cho một lối tắt khác.'); return; }
    if (config.shortcuts.length >= 80 && !config.shortcuts.some(s => s.id === next.id)) { void message.warning('Bạn đã có 80 lối tắt.'); return; }
    snapshot();
    change(c => ({ ...c, shortcuts: c.shortcuts.some(s => s.id === next.id) ? c.shortcuts.map(s => s.id === next.id ? next : s) : [...c.shortcuts, next] }));
    setShortcutDraft(null);
  }
  function commitSpace() {
    if (!spaceDraft?.name.trim()) return;
    const id = spaceDraft.id ?? uid();
    if (!spaceDraft.id && config.spaces.length >= 8) { void message.warning('Bạn có thể tạo tối đa 8 không gian.'); return; }
    snapshot();
    change(c => ({ ...c, activeSpace: id, spaces: spaceDraft.id ? c.spaces.map(s => s.id === id ? { ...s, name: spaceDraft.name.trim() } : s) : [...c.spaces, { id, name: spaceDraft.name.trim(), widgets: [] }] }));
    setSpaceDraft(null);
  }
  function widgetCard(widget: WorkspaceWidget) {
    const entry = WIDGETS.find(w => w.type === widget.type)!;
    return <div key={widget.id} className={`ws-card ws-card-${widget.type}${editing ? ' ws-card-edit' : ''}`} style={mobile ? { minHeight: widget.h * 44, height: widget.h * 44 + 40 } : undefined}>
      <div className="ws-card-head">
        <div className="ws-drag-handle" title={editing ? 'Kéo để di chuyển tiện ích' : undefined}>{editing ? <HolderOutlined /> : <span className="ws-card-symbol"><WidgetIcon type={entry.type} /></span>}<h2>{widget.title}</h2></div>
        <Dropdown trigger={['click']} menu={{ items: [
          { key: 'settings', label: 'Cài đặt tiện ích', icon: <SettingOutlined />, onClick: () => setWidgetDraft(structuredClone(widget)) },
          { key: 'copy', label: 'Nhân bản', icon: <CopyOutlined />, disabled: space.widgets.length >= 40, onClick: () => { snapshot(); changeWidgets(list => [...list, { ...structuredClone(widget), id: uid(), x: 0, y: Math.max(0, ...list.map(w => w.y + w.h)) }]); } },
          { key: 'up', label: 'Đưa lên đầu', icon: <ArrowUpOutlined />, onClick: () => { snapshot(); changeWidgets(list => [{ ...widget, x: 0, y: 0 }, ...list.filter(w => w.id !== widget.id).map(w => ({ ...w, y: w.y + widget.h }))]); } },
          { key: 'down', label: 'Đưa xuống cuối', icon: <ArrowDownOutlined />, onClick: () => { snapshot(); changeWidgets(list => [...list.filter(w => w.id !== widget.id), { ...widget, x: 0, y: Math.max(0, ...list.map(w => w.y + w.h)) }]); } },
          { key: 'wide', label: widget.w === 12 ? 'Thu về nửa hàng' : 'Mở rộng cả hàng', icon: <ExpandOutlined />, onClick: () => { snapshot(); changeWidgets(list => list.map(w => w.id === widget.id ? { ...w, x: 0, w: w.w === 12 ? 6 : 12 } : w)); } },
          { type: 'divider' },
          { key: 'delete', label: 'Gỡ tiện ích', icon: <DeleteOutlined />, danger: true, onClick: () => { snapshot(); changeWidgets(list => list.filter(w => w.id !== widget.id)); } },
        ] }}><button className="ws-icon-btn ws-card-menu" aria-label={`Tùy chọn ${widget.title}`}><EllipsisOutlined /></button></Dropdown>
      </div>
      <div className="ws-card-body"><WorkspaceWidgetBody widget={widget} onChange={settings => changeWidgets(list => list.map(w => w.id === widget.id ? { ...w, settings } : w))} /></div>
    </div>;
  }
  const filtered = useMemo(() => WIDGETS.filter(w => (category === 'Tất cả' || category === w.category) && fold(`${w.title} ${w.description}`).includes(fold(search))), [category, search]);
  const hour = new Date(now.getTime() + 7 * 3_600_000).getUTCHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const name = /quản trị|hệ thống|tài khoản|văn thư|người xem|chuyên viên|trưởng phòng|lãnh đạo/i.test(me.fullName) ? me.fullName.trim() : me.fullName.trim().split(/\s+/).at(-1);
  const visibleWallpaper = config.appearance.daylight ? resolveDaylightPreset(now) : config.appearance.wallpaper;
  const backgroundStyle = { '--ws-accent': config.appearance.accent, '--ws-blur': `${config.appearance.blur}px`, '--ws-overlay': config.appearance.overlay / 100 } as CSSProperties;

  return <ConfigProvider theme={{ algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { colorPrimary: dark ? config.appearance.accent : '#176e61', colorBgBase: dark ? '#101e29' : '#ffffff', borderRadius: 12, fontFamily: "'Be Vietnam Pro', system-ui, sans-serif" } }}>
    <section className={`ws-root ws-theme-${visibleWallpaper}${dark ? '' : ' ws-light'} ws-dock-${config.appearance.dock ?? 'bottom'}${focus ? ' ws-is-focused' : ''}`} style={backgroundStyle} aria-label="Bàn làm việc cá nhân">
      <div className="ws-background" style={visibleWallpaper === 'custom' && config.appearance.customWallpaper ? { backgroundImage: `url("${config.appearance.customWallpaper}")` } : undefined}><Landscape /><WallpaperArtwork preset={visibleWallpaper} /></div>
      <div className="ws-shade" />
      <main className="ws-main">
        <header className="ws-toolbar">
          <div className="ws-identity"><span className="ws-logo"><DesktopOutlined /></span><div><strong>Bàn làm việc</strong><small>{me.department?.name || me.position || 'Cá nhân'}</small></div></div>
          <div className="ws-toolbar-actions">
            <span className={`ws-save ws-save-${status}`} aria-live="polite">{status === 'saved' ? <CheckOutlined /> : status === 'saving' ? <CloudSyncOutlined spin /> : <span className="ws-status-dot" />}{({ loading: 'Đang tải', saved: 'Đã đồng bộ', pending: 'Chờ lưu', saving: 'Đang lưu', error: 'Chưa lưu', conflict: 'Cần đồng bộ' })[status]}</span>
            <Tooltip title="Tìm trong IOC · Ctrl K"><button className="ws-icon-btn" aria-label="Tìm trong IOC" onClick={requestCommand}><SearchOutlined /></button></Tooltip>
            <Tooltip title={focus ? 'Thoát tập trung · Esc' : 'Chế độ tập trung · Ctrl Shift F'}><button className="ws-icon-btn" aria-label={focus ? 'Thoát tập trung' : 'Chế độ tập trung'} onClick={() => setFocus(v => !v)}>{focus ? <FullscreenExitOutlined /> : <ExpandOutlined />}</button></Tooltip>
            <NoteComposerButton /><button className="ws-button ws-customize" onClick={() => setAppearance(true)} disabled={!ready}><SettingOutlined /> Cá nhân hóa</button>
            <Dropdown trigger={['click']} menu={{ items: [
              { key: 'export', label: 'Xuất bản sao bàn làm việc', icon: <DownloadOutlined />, disabled: !ready, onClick: exportWorkspace },
              { key: 'import', label: 'Nhập bản sao JSON', icon: <UploadOutlined />, disabled: !ready, onClick: () => importRef.current?.click() },
              { key: 'undo', label: 'Hoàn tác thao tác bố cục gần nhất', disabled: !undo, onClick: () => { if (undo) { setConfig(undo); setUndo(null); } } },
              { type: 'divider' }, { key: 'help', label: 'Phím tắt & hướng dẫn', onClick: () => setHelp(true) },
            ] }}><button className="ws-icon-btn" aria-label="Menu bàn làm việc"><EllipsisOutlined /></button></Dropdown>
          </div>
        </header>
        <div ref={containerRef} className="ws-content">
        {!ready ? <div className="ws-loading">{error ? <><h2>Chưa tải được bàn làm việc</h2><p>{error}</p><Button onClick={() => void reload()}>Thử lại</Button></> : <><Spin size="large" /><p>Đang tải bàn làm việc…</p></>}</div> : <>
          {error && <Alert className="ws-error" type="warning" showIcon title={status === 'conflict' ? 'Bàn làm việc đã được cập nhật ở phiên khác' : 'Thay đổi đang được giữ trong phiên này, chưa lưu lên máy chủ'} description={error} action={<div className="ws-error-actions"><Button onClick={exportWorkspace}>Xuất bản sao</Button>{status === 'conflict' ? <Button onClick={() => void keepLocal()}>Giữ bản của tôi</Button> : <Button onClick={retry}>Lưu lại</Button>}<Button onClick={() => modal.confirm({ title: 'Tải lại bản đã lưu trên máy chủ?', content: 'Hãy xuất bản sao nếu muốn giữ thay đổi chưa lưu ở phiên này.', okText: 'Tải lại', cancelText: 'Hủy', onOk: () => reload() })}>Tải bản đã lưu</Button></div>} />}
          <div className="ws-hero">
            <div className="ws-hero-copy"><h1>{greeting}, {name}</h1><p className="ws-date-line">{now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}<span> · {lunarLabel(now)} âm lịch</span></p></div>
            <div className="ws-hero-time"><time>{now.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</time><button className="ws-jarvis" onClick={requestJarvis}><RobotOutlined /> Jarvis</button></div>
          </div>
          <DeskBriefingHeader />
          <DeskSystemNotes />
          <DeskNotesLayer />
          {editing && <section className="ws-shortcuts-section" aria-label="Lối tắt của bạn">
            <div className="ws-section-label">TRUY CẬP NHANH <span>Alt + số để mở</span></div>
            <div className="ws-shortcuts">
              {shortcuts.map((shortcut, index) => <div className="ws-shortcut-wrap" key={shortcut.id}>
                <button className="ws-shortcut" onClick={() => openShortcut(shortcut)} title={`${shortcut.url}${shortcut.hotkey ? ` · Alt ${shortcut.hotkey}` : ''}`}><span className="ws-shortcut-icon" style={{ '--shortcut-color': shortcut.color } as CSSProperties}><WorkAppIcon icon={shortcut.icon} color={shortcut.color} /></span><span>{shortcut.title}</span>{shortcut.hotkey && <kbd>{shortcut.hotkey}</kbd>}</button>
                {editing && <Dropdown trigger={['click']} menu={{ items: [
                  { key: 'edit', label: 'Sửa lối tắt', onClick: () => setShortcutDraft({ ...shortcut }) },
                  { key: 'left', label: 'Chuyển lên trước', disabled: index === 0, onClick: () => { snapshot(); change(c => { const list = [...c.shortcuts]; const at = list.findIndex(s => s.id === shortcut.id); if (at > 0) [list[at - 1], list[at]] = [list[at], list[at - 1]]; return { ...c, shortcuts: list }; }); } },
                  { key: 'remove', label: 'Gỡ lối tắt', danger: true, onClick: () => { snapshot(); change(c => ({ ...c, shortcuts: c.shortcuts.filter(s => s.id !== shortcut.id) })); } },
                ] }}><button className="ws-shortcut-edit ws-icon-btn" aria-label={`Sửa ${shortcut.title}`}><EditOutlined /></button></Dropdown>}
              </div>)}
              <button className="ws-shortcut ws-shortcut-add" onClick={() => setShortcutDraft({ id: uid(), title: '', url: '', icon: 'link', color: ACCENTS[0] })}><span className="ws-shortcut-icon"><PlusOutlined /></span><span>Thêm lối tắt</span></button>
            </div>
          </section>}
          <div className="ws-space-bar">
            <div className="ws-spaces" role="tablist" aria-label="Không gian làm việc">{config.spaces.map(s => <button key={s.id} role="tab" aria-selected={s.id === space.id} className={`ws-space-tab${s.id === space.id ? ' active' : ''}`} onClick={() => change(c => ({ ...c, activeSpace: s.id }))}>{s.id === space.id && <span className="ws-tab-dot" />}{s.name}</button>)}<button className="ws-icon-btn" onClick={() => setSpaceDraft({ name: '' })} disabled={config.spaces.length >= 8} aria-label="Thêm không gian"><PlusOutlined /></button></div>
            <div className="ws-space-actions"><button className={`ws-button ws-edit-button${editing ? ' active' : ''}`} onClick={() => setEditing(v => !v)}>{editing ? <CheckOutlined /> : <HolderOutlined />}{editing ? 'Xong' : 'Sắp xếp'}</button><button className="ws-button ws-primary" onClick={() => setLibrary(true)}><PlusOutlined /> Thêm tiện ích</button></div>
          </div>
          {editing && <div className="ws-edit-hint"><HolderOutlined /><span>{mobile ? 'Dùng menu của tiện ích để đổi thứ tự và kích thước.' : 'Kéo thanh tiêu đề để sắp xếp. Kéo góc dưới để đổi kích thước.'} Mọi thay đổi được tự động lưu.</span><button onClick={() => setSpaceDraft({ id: space.id, name: space.name })}>Đổi tên không gian</button>{config.spaces.length > 1 && <button onClick={() => modal.confirm({ title: `Xóa không gian “${space.name}”?`, content: 'Bạn có thể hoàn tác từ menu bàn làm việc.', okText: 'Xóa không gian', cancelText: 'Hủy', onOk: () => { snapshot(); change(c => { const spaces = c.spaces.filter(s => s.id !== c.activeSpace); return { ...c, spaces, activeSpace: spaces[0].id }; }); } })}>Xóa không gian</button>}</div>}
          <div className="ws-grid-container">
            {!space.widgets.length ? <div className="ws-empty"><span><AppstoreAddOutlined /></span><h2>Chưa có tiện ích</h2><button className="ws-button ws-primary" onClick={() => setLibrary(true)}><AppstoreAddOutlined /> Thêm tiện ích</button></div> : mounted && (mobile ? <div className="ws-mobile-grid">{[...space.widgets].sort((a,b) => a.y - b.y || a.x - b.x).map(widgetCard)}</div> : <GridLayout key={space.id} width={width} layout={space.widgets.map(w => ({ i: w.id, x: w.x, y: w.y, w: w.w, h: w.h, minW: 3, minH: 4, maxH: 24 }))} gridConfig={{ cols: 12, rowHeight: 38, margin: [18,18], containerPadding: [0,0] }} dragConfig={{ enabled: editing, handle: '.ws-drag-handle', cancel: 'button,input,textarea,a' }} resizeConfig={{ enabled: editing, handles: ['se'] }} onLayoutChange={updateLayout}>{space.widgets.map(widgetCard)}</GridLayout>)}
          </div>
          <DeskApps shortcuts={shortcuts} position={config.appearance.dock ?? 'bottom'} editing={editing} onAdd={() => setShortcutDraft({ id: uid(), title: '', url: '', icon: 'link', color: ACCENTS[0] })} onEdit={setShortcutDraft} />
          <footer className="ws-footer"><span><i/> {me.fullName}</span><button onClick={() => setHelp(true)}>Phím tắt bàn phím</button></footer>
        </>}
        </div>
      </main>
      <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={event => void importWorkspace(event.target.files?.[0])}/>
      <input ref={wallpaperRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => void uploadWallpaper(event.target.files?.[0])}/>
    </section>

    <Drawer title={<span className="ws-drawer-title"><AppstoreAddOutlined /> Kho tiện ích</span>} open={library} onClose={() => setLibrary(false)} size={620} className="ws-drawer">
      <Input size="large" prefix={<SearchOutlined />} placeholder="Tìm tiện ích, biểu đồ, ghi chú…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Tìm tiện ích"/>
      <div className="ws-category-tabs">{['Tất cả','Năng suất','Dữ liệu','Hằng ngày','Kết nối'].map(c => <button key={c} className={category === c ? 'active' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div>
      <div className="ws-library-grid">{filtered.map(w => <button key={w.type} className={`ws-library-card ws-library-${w.type}`} onClick={() => addWidget(w.type)}><span className="ws-library-icon"><WidgetIcon type={w.type} /></span><span className="ws-library-plus"><PlusOutlined /></span><Tooltip title={w.description}><h3>{w.title}</h3></Tooltip><small>{w.category}</small></button>)}</div>
      {!filtered.length && <Empty description="Chưa tìm thấy tiện ích phù hợp" />}
    </Drawer>

    <Drawer title="Cá nhân hóa không gian" open={appearance} onClose={() => setAppearance(false)} size={460} className="ws-drawer">
      <section className="ws-settings-section"><h3>Khay ứng dụng</h3><Select style={{ width: '100%', marginTop: 12 }} aria-label="Vị trí khay ứng dụng" value={config.appearance.dock ?? 'bottom'} options={[{ value: 'bottom', label: 'Đáy bàn' }, { value: 'left', label: 'Cạnh trái' }, { value: 'hidden', label: 'Ẩn' }]} onChange={dock => change(c => ({ ...c, appearance: { ...c.appearance, dock } }))} /></section>
      <section className="ws-settings-section"><h3>Hình nền</h3><label className="ws-daylight-toggle"><span>Theo nhịp ngày đêm<small>Tự đổi cảnh sáng, trưa, chiều và đêm</small></span><Switch aria-label="Hình nền theo nhịp ngày đêm" checked={!!config.appearance.daylight} onChange={daylight => change(c => ({ ...c, appearance: { ...c.appearance, daylight } }))}/></label><div className="ws-wallpapers">{WALLPAPERS.map(w => <button key={w.id} className={`ws-wallpaper-option${visibleWallpaper === w.id ? ' selected' : ''}`} onClick={() => change(c => ({ ...c, appearance: { ...c.appearance, wallpaper: w.id, daylight: false } }))}><span className={`ws-wallpaper-preview ws-theme-${w.id}`}><span className="ws-background"><WallpaperArtwork preset={w.id}/></span>{visibleWallpaper === w.id && <CheckOutlined />}</span><strong>{w.name}</strong></button>)}</div><Button block icon={<UploadOutlined />} onClick={() => wallpaperRef.current?.click()}>Tải hình nền của bạn</Button><small className="ws-setting-note">JPG, PNG, WebP · tối đa 15 MB · tự tối ưu trước khi lưu</small>{config.appearance.customWallpaper && <Button block onClick={() => change(c => ({ ...c, appearance: { ...c.appearance, wallpaper: 'custom', daylight: false } }))}>Dùng lại ảnh đã tải</Button>}</section>
      <section className="ws-settings-section"><h3>Màu nhấn</h3><div className="ws-colors">{ACCENTS.map(color => <button key={color} aria-label={`Màu ${color}`} style={{ background: color }} className={config.appearance.accent === color ? 'selected' : ''} onClick={() => change(c => ({ ...c, appearance: { ...c.appearance, accent: color } }))}>{config.appearance.accent === color && <CheckOutlined />}</button>)}<input type="color" aria-label="Chọn màu nhấn riêng" value={config.appearance.accent} onChange={e => change(c => ({ ...c, appearance: { ...c.appearance, accent: e.target.value } }))}/></div><label>Độ tối hình nền <span>{config.appearance.overlay}%</span></label><Slider value={config.appearance.overlay} min={0} max={90} onChange={overlay => change(c => ({ ...c, appearance: { ...c.appearance, overlay } }))}/><label>Độ mờ kính <span>{config.appearance.blur}px</span></label><Slider value={config.appearance.blur} min={0} max={40} onChange={blur => change(c => ({ ...c, appearance: { ...c.appearance, blur } }))}/></section>
      <section className="ws-settings-section"><h3>Bắt đầu từ một bố cục</h3><p>Áp dụng cho không gian “{space.name}”.</p><div className="ws-template-list">{[{id:'default',icon:'◈',name:'Ngày làm việc',text:'Điều hành, ghi chú, việc cần làm & thời tiết'},{id:'focus',icon:'◷',name:'Tập trung sâu',text:'Pomodoro, việc ưu tiên & góc ghi chú'},{id:'data',icon:'⌁',name:'Góc dữ liệu',text:'IOC, công việc & kết nối API'}].map(t => <button key={t.id} onClick={() => applyTemplate(t.id)}><b>{t.icon}</b><span><strong>{t.name}</strong><small>{t.text}</small></span><span>↗</span></button>)}</div></section>
    </Drawer>

    <Modal title="Cài đặt tiện ích" open={!!widgetDraft} onCancel={() => setWidgetDraft(null)} okText="Lưu cài đặt" cancelText="Hủy" onOk={() => { if (!widgetDraft?.title.trim()) { void message.warning('Hãy nhập tên tiện ích.'); return; } const settingsError = widgetSettingsError(widgetDraft); if (settingsError) { void message.warning(settingsError); return; } const draft = widgetDraft; changeWidgets(list => list.map(w => w.id === draft.id ? draft : w)); setWidgetDraft(null); }} destroyOnHidden width={620}>
      {widgetDraft && <div className="ws-form"><label>Tên tiện ích<Input maxLength={120} value={widgetDraft.title} onChange={e => setWidgetDraft({ ...widgetDraft, title: e.target.value })}/></label><WidgetSettings widget={widgetDraft} onChange={settings => setWidgetDraft({ ...widgetDraft, settings })}/></div>}
    </Modal>
    <Modal title={shortcutDraft && config.shortcuts.some(s => s.id === shortcutDraft.id) ? 'Sửa lối tắt' : 'Thêm lối tắt'} open={!!shortcutDraft} onCancel={() => setShortcutDraft(null)} onOk={commitShortcut} okText="Lưu lối tắt" cancelText="Hủy" destroyOnHidden>
      {shortcutDraft && <div className="ws-form"><label>Chọn nhanh tính năng IOC<Select<string> placeholder="Hoặc nhập website bên dưới" value={undefined} options={navItems.filter(n => can(me,n.roles)).map(n => ({ value:n.path,label:n.label }))} onChange={url => { const item = navItems.find(n => n.path === url)!; setShortcutDraft({ ...shortcutDraft, url, title: item.label }); }}/></label><label>Tên hiển thị<Input maxLength={80} value={shortcutDraft.title} onChange={e => setShortcutDraft({ ...shortcutDraft,title:e.target.value })} placeholder="Ví dụ: Cổng dịch vụ công"/></label><label>Đường dẫn<Input maxLength={2048} prefix={<LinkOutlined />} value={shortcutDraft.url} onChange={e => setShortcutDraft({ ...shortcutDraft,url:e.target.value })} placeholder="https://… hoặc /admin/…"/></label><label>Biểu tượng<div className="ws-icon-picker">{ICONS.map(icon => <button key={icon} className={shortcutDraft.icon === icon ? 'selected' : ''} aria-label={icon} onClick={() => setShortcutDraft({ ...shortcutDraft,icon })}>{APP_ICONS[icon as keyof typeof APP_ICONS]}</button>)}</div></label><label>Màu biểu tượng<input type="color" value={shortcutDraft.color} onChange={e => setShortcutDraft({ ...shortcutDraft,color:e.target.value })}/></label><label>Phím tắt bàn phím<Select allowClear placeholder="Chưa gán" value={shortcutDraft.hotkey || undefined} options={Array.from({length:9},(_,i) => ({ value:String(i+1),label:`Alt + ${i+1}` }))} onChange={hotkey => setShortcutDraft({ ...shortcutDraft, hotkey })}/></label><p className="ws-setting-note">Website bên ngoài mở trong thẻ mới. Các trang IOC vẫn kiểm tra phân quyền khi truy cập.</p></div>}
    </Modal>
    <Modal title={spaceDraft?.id ? 'Đổi tên không gian' : 'Tạo không gian mới'} open={!!spaceDraft} onCancel={() => setSpaceDraft(null)} onOk={commitSpace} okText="Lưu" cancelText="Hủy" destroyOnHidden><Input autoFocus maxLength={80} placeholder="Ví dụ: Dự án của tôi" value={spaceDraft?.name ?? ''} onChange={e => setSpaceDraft(s => s ? { ...s,name:e.target.value } : null)} onPressEnter={commitSpace}/></Modal>
    <Modal title="Làm quen với bàn làm việc" open={help} onCancel={() => setHelp(false)} footer={<Button onClick={() => setHelp(false)}>Đã hiểu</Button>}><div className="ws-help"><p>Mỗi tài khoản có bàn làm việc riêng, tự lưu trên máy chủ. Tạo đến 8 không gian và chọn tiện ích từ thư viện.</p>{[['Ctrl K','Tìm kiếm màn hình và chỉ tiêu'],['Ctrl J','Mở trợ lý Jarvis'],['Ctrl Shift E','Bật / tắt sắp xếp'],['Ctrl Shift F','Bật / tắt chế độ tập trung'],['Alt 1 … 9','Mở lối tắt được gán'],['Esc','Thoát chế độ tập trung']].map(([key,desc]) => <div key={key}><kbd>{key}</kbd><span>{desc}</span></div>)}<p>API: nhập URL HTTPS trả về JSON công khai, chọn đường dẫn dữ liệu và dạng hiển thị. Không nhập mật khẩu hoặc khóa bí mật vào URL. Website có thể chặn nhúng; khi đó dùng nút mở trang.</p><p>Menu ⋯ có xuất/nhập bản sao và hoàn tác thao tác bố cục gần nhất.</p></div></Modal>
  </ConfigProvider>;
}
