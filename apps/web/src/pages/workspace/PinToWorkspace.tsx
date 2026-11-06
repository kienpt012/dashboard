import { PushpinOutlined } from '@ant-design/icons';
import { App, Button, Tooltip } from 'antd';
import { useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMe } from '@/app/session';
import { ApiError, errorText, http, session } from '@/lib/api';
import { defaultConfig, safeShortcut, uid, validConfig, type WorkspaceConfig } from './model';
import { readWorkspaceDraft, reconcileWorkspaceDraft, workspaceDraftKey } from './workspace-draft';

/** Pin the current filtered view using the same per-user, versioned workspace. */
export function PinToWorkspace({ title }: { title: string }) {
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
      const config = result.config ?? defaultConfig();
      if (!validConfig(config)) throw new Error('Cấu hình bàn làm việc không hợp lệ.');
      // This tab can recover its own draft; other tabs retain their version checks.
      const tab = sessionStorage.getItem('ioc_workspace_tab');
      if (tab) {
        const draft = readWorkspaceDraft(localStorage, workspaceDraftKey(user.id, tab), user.id);
        if (reconcileWorkspaceDraft(config, result.version, draft).status !== 'saved') {
          throw new Error('Bàn làm việc còn thay đổi chưa đồng bộ. Hãy trở về bàn làm việc để lưu trước khi ghim trang.');
        }
      }
      if (config.shortcuts.some(item => item.url === path)) { void message.info('Trang này đã có trong lối tắt của bạn.'); return; }
      if (config.shortcuts.length >= 80) throw new Error('Bạn đã có 80 lối tắt. Hãy gỡ bớt trước khi ghim trang mới.');
      config.shortcuts.push({ id: uid(), title: title.slice(0, 80), url: path, icon: '⚑', color: config.appearance.accent });
      if (!ownsSession()) return;
      await http.put('/workspace', { config, expectedVersion: result.version });
      if (ownsSession()) void message.success(`Đã ghim “${title}” vào bàn làm việc, kèm bộ lọc hiện tại.`);
    } catch (error) {
      if (ownsSession()) void message.error(error instanceof ApiError && error.status === 409
        ? 'Bàn làm việc vừa thay đổi ở phiên khác. Bấm ghim lại để dùng bản mới nhất.' : errorText(error));
    } finally { running.current = false; setBusy(false); }
  }

  return <Tooltip title="Ghim trang và bộ lọc hiện tại vào bàn làm việc"><Button type="text" className="head-btn" icon={<PushpinOutlined />} loading={busy} onClick={() => void pin()} aria-label="Ghim trang này vào bàn làm việc" /></Tooltip>;
}
