import { PushpinOutlined } from '@ant-design/icons';
import { App, Button, Tooltip } from 'antd';
import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMe } from '@/app/session';
import { ApiError, errorText, http, session } from '@/lib/api';
import { defaultConfig, makeWidget, migrateConfig, safeShortcut, uid, validConfig, type WorkspaceConfig } from './model';
import { readWorkspaceDraft, reconcileWorkspaceDraft, workspaceDraftKey } from './workspace-draft';

/** Pin the current filtered view using the same per-user, versioned workspace. */
export function PinToWorkspace({ title, targetId, documentId }: { title: string; targetId?: string; documentId?: string }) {
  const { message } = App.useApp();
  const user = useMe();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  async function pin() {
    if (running.current) return;
    const path = location.pathname + location.search + location.hash;
    if (!safeShortcut(path)) return;
    const token = session.token;
    const ownsSession = () => session.user?.id === user.id && !!token && session.token === token;
    if (!ownsSession()) return;
    running.current = true; setBusy(true);
    try {
      const result = await http.get<{ config: WorkspaceConfig | null; version: number }>('/workspace');
      if (!ownsSession()) return;
      const config = migrateConfig(result.config ?? defaultConfig(user.role));
      if (!validConfig(config)) throw new Error('Cấu hình bàn làm việc không hợp lệ.');
      // This tab can recover its own draft; other tabs retain their version checks.
      const tab = sessionStorage.getItem('ioc_workspace_tab');
      if (tab) {
        const draft = readWorkspaceDraft(localStorage, workspaceDraftKey(user.id, tab), user.id);
        if (reconcileWorkspaceDraft(config, result.version, draft).status !== 'saved') {
          throw new Error('Bàn làm việc còn thay đổi chưa đồng bộ. Hãy trở về bàn làm việc để lưu trước khi ghim trang.');
        }
      }
      if (targetId || documentId) {
        const kind = targetId ? 'target' : 'document';
        const id = targetId ?? documentId!;
        const space = config.spaces.find(item => item.id === config.activeSpace)!;
        let widget = space.widgets.find(item => item.type === 'pins');
        if (!widget) {
          if (space.widgets.length >= 40) throw new Error('Không gian đã có 40 tiện ích. Hãy gỡ bớt trước khi ghim.');
          const y = Math.max(0, ...space.widgets.map(item => item.y + item.h));
          if (y > 1000) throw new Error('Không còn vị trí trong không gian hiện tại.');
          widget = makeWidget('pins', 0, y); space.widgets.push(widget);
        }
        const items = (Array.isArray(widget.settings.items) ? widget.settings.items : []) as { kind: string; id: string; title: string }[];
        if (items.some(item => item.kind === kind && item.id === id)) { void message.info('Mục này đã được ghim.'); return; }
        if (items.length >= 80) throw new Error('Đã có 80 mục ghim. Hãy gỡ bớt trước khi thêm.');
        widget.settings = { ...widget.settings, items: [...items, { kind, id, title: title.slice(0, 300) }] };
      } else {
        if (config.shortcuts.some(item => item.url === path)) { void message.info('Trang này đã có trong lối tắt của bạn.'); return; }
        if (config.shortcuts.length >= 80) throw new Error('Bạn đã có 80 lối tắt. Hãy gỡ bớt trước khi ghim trang mới.');
        config.shortcuts.push({ id: uid(), title: title.slice(0, 80), url: path, icon: 'pin', color: config.appearance.accent });
      }
      if (!ownsSession()) return;
      await http.put('/workspace', { config, expectedVersion: result.version });
      if (ownsSession()) void message.success(`Đã ghim “${title}” vào bàn làm việc.`);
    } catch (error) {
      if (ownsSession()) void message.error(error instanceof ApiError && error.status === 409
        ? 'Bàn làm việc vừa thay đổi ở phiên khác. Bấm ghim lại để dùng bản mới nhất.' : errorText(error));
    } finally { running.current = false; setBusy(false); }
  }

  return <Tooltip title="Ghim vào bàn làm việc"><Button type="text" className="head-btn" icon={<PushpinOutlined />} loading={busy} onClick={() => void pin()} aria-label="Ghim vào bàn làm việc" /></Tooltip>;
}
