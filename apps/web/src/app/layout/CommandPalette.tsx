import { AimOutlined, BgColorsOutlined, EnterOutlined, LogoutOutlined, RobotOutlined, SearchOutlined } from '@ant-design/icons';
import { Empty, Input, Modal, Spin, Tag } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/app/session';
import { useApi } from '@/hooks/useApi';
import { query } from '@/lib/api';
import { can } from '@/lib/roles';
import type { Target } from '@/types/core';
import { fold, navItems } from '../nav';

type Entry = { key: string; icon: React.ReactNode; label: string; hint?: string; to?: string; run?: () => void; group: 'target' | 'page' | 'action' };

function useDebounced<T>(value: T, delay = 250) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return current;
}

/** Ctrl K: tìm màn hình và chỉ tiêu theo tên hoặc mã, gõ không dấu vẫn ra. */
export function CommandPalette({ open, onClose, onCopilot, onTheme, onLogout }: { open: boolean; onClose: () => void; onCopilot: () => void; onTheme: () => void; onLogout: () => void }) {
  const navigate = useNavigate();
  const user = useUser();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const term = useDebounced(text.trim());
  const targets = useApi<Target[]>(open && term.length >= 2 ? `/targets${query({ search: term })}` : null, { keepPrevious: true });

  useEffect(() => {
    if (open) {
      setText('');
      setActive(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const needle = fold(text.trim());
    const match = (value: string) => !needle || fold(value).includes(needle);
    const pages: Entry[] = navItems
      .filter(item => can(user, item.roles))
      .filter(item => match(`${item.label} ${item.keywords}`))
      .map(item => ({ key: item.path, icon: item.icon, label: item.label, to: item.path, group: 'page' }));
    const found: Entry[] =
      term.length >= 2
        ? (targets.data ?? []).slice(0, 8).map(target => ({
            key: target.id,
            icon: <AimOutlined />,
            label: target.title,
            hint: target.code,
            to: `/admin/targets/${target.id}`,
            group: 'target',
          }))
        : [];
    const actions: Entry[] = [
      { key: 'act-copilot', icon: <RobotOutlined />, label: 'Mở Trợ lý', hint: 'Ctrl J', run: onCopilot, group: 'action' as const },
      { key: 'act-theme', icon: <BgColorsOutlined />, label: 'Đổi giao diện sáng/tối', run: onTheme, group: 'action' as const },
      { key: 'act-logout', icon: <LogoutOutlined />, label: 'Đăng xuất', run: onLogout, group: 'action' as const },
    ].filter(item => match(`${item.label} tro ly giao dien sang toi dang xuat`));
    return [...found, ...pages, ...actions];
  }, [text, term, targets.data, user, onCopilot, onTheme, onLogout]);

  useEffect(() => setActive(0), [text]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function go(entry?: Entry) {
    if (!entry) return;
    onClose();
    if (entry.run) entry.run();
    else if (entry.to) navigate(entry.to);
  }

  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} width={600} destroyOnHidden className="palette" styles={{ body: { padding: 0 } }} style={{ top: 96 }}>
      <Input
        autoFocus
        size="large"
        variant="borderless"
        prefix={<SearchOutlined />}
        suffix={targets.isFetching ? <Spin size="small" /> : <Tag style={{ marginInlineEnd: 0 }}>Esc</Tag>}
        placeholder="Tìm màn hình, mã hoặc tên chỉ tiêu"
        value={text}
        onChange={event => setText(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(value => Math.min(entries.length - 1, value + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(value => Math.max(0, value - 1));
          } else if (event.key === 'Enter') {
            go(entries[active]);
          }
        }}
        style={{ padding: '14px 16px' }}
      />
      <div className="palette-list" ref={listRef}>
        {entries.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không tìm thấy" />
        ) : (
          entries.map((entry, index) => (
            <div key={entry.key}>
              {(index === 0 || entries[index - 1].group !== entry.group) && (
                <div className="palette-group">{entry.group === 'target' ? 'Chỉ tiêu' : entry.group === 'page' ? 'Màn hình' : 'Thao tác'}</div>
              )}
            <button
              type="button"
              data-index={index}
              className={`palette-item${index === active ? ' active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(entry)}
            >
              <span className="palette-icon">{entry.icon}</span>
              <span className="palette-label">{entry.label}</span>
              {entry.hint && <span className="palette-hint">{entry.hint}</span>}
              {index === active && <EnterOutlined className="palette-enter" />}
            </button>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
