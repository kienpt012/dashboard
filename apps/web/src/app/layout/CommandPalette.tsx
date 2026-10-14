import { AimOutlined, EnterOutlined, SearchOutlined } from '@ant-design/icons';
import { Empty, Input, Modal, Spin, Tag } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/app/session';
import { useApi } from '@/hooks/useApi';
import { query } from '@/lib/api';
import { can } from '@/lib/roles';
import type { Target } from '@/types/core';
import { fold, navItems } from '../nav';

type Entry = { key: string; icon: React.ReactNode; label: string; hint?: string; to: string };

function useDebounced<T>(value: T, delay = 250) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return current;
}

/** Ctrl K: tìm màn hình và chỉ tiêu theo tên hoặc mã, gõ không dấu vẫn ra. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    const pages = navItems
      .filter(item => can(user, item.roles))
      .filter(item => !needle || fold(`${item.label} ${item.keywords}`).includes(needle))
      .map(item => ({ key: item.path, icon: item.icon, label: item.label, to: item.path }));
    const found = term.length >= 2
      ? (targets.data ?? []).slice(0, 8).map(target => ({
          key: target.id,
          icon: <AimOutlined />,
          label: target.title,
          hint: target.code,
          to: `/admin/targets/${target.id}`,
        }))
      : [];
    return [...found, ...pages].slice(0, 14);
  }, [text, term, targets.data, user]);

  useEffect(() => setActive(0), [text]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function go(entry?: Entry) {
    if (!entry) return;
    onClose();
    navigate(entry.to);
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
            <button
              key={entry.key}
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
          ))
        )}
      </div>
    </Modal>
  );
}
