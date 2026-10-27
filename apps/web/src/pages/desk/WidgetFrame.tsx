import { CloseOutlined, CopyOutlined, DeleteOutlined, ExpandOutlined, ExportOutlined, HolderOutlined, MoreOutlined, ReloadOutlined, SettingOutlined, WarningOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Dropdown, Skeleton, Tooltip, type MenuProps } from 'antd';
import { Component, Suspense, useMemo, type KeyboardEvent, type ReactNode } from 'react';
import { invalidate } from '@/hooks/useApi';
import { DeskIcon } from './icons';
import type { WidgetDefinition, WidgetInstance } from './types';
import { WidgetContext, type WidgetContextValue } from './widgets/context';
import { WIDGET_COMPONENTS } from './widgets/registry';

// Khung chung của mọi widget: đầu widget (biểu tượng, tên, làm mới, phóng to, menu), ranh giới lỗi riêng, chế độ tùy
// biến (tay kéo, phím mũi tên dời/đổi cỡ, Delete để gỡ).

class WidgetBoundary extends Component<{ resetKey: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(previous: { resetKey: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="dw-state">
          <WarningOutlined />
          <span>Widget gặp lỗi khi hiển thị</span>
          <Button size="small" onClick={() => this.setState({ error: null })}>
            Thử lại
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WidgetSkeleton() {
  return (
    <div className="dw-skeleton">
      <Skeleton active paragraph={{ rows: 3 }} title={false} />
    </div>
  );
}

const PLAIN_BY_DEFAULT = new Set(['hero']);
/** Widget không cần đầu (lời chào, dải chữ chạy cao một hàng): chỉ hiện đầu khi đang tùy biến. */
const HEADERLESS = new Set(['hero', 'dept.ticker']);

export interface WidgetFrameProps {
  widget: WidgetInstance;
  def: WidgetDefinition | undefined;
  context: Omit<WidgetContextValue, 'widget' | 'def'>;
  spaces: { id: string; name: string }[];
  onSettings: () => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (spaceId: string) => void;
  onMaximize: () => void;
  onClose?: () => void;
  onNudge: (dx: number, dy: number, dw: number, dh: number) => void;
}

export function WidgetFrame({ widget, def, context, spaces, onSettings, onRemove, onDuplicate, onMove, onMaximize, onClose, onNudge }: WidgetFrameProps) {
  const client = useQueryClient();
  const { editing, maximized } = context;
  const value = useMemo<WidgetContextValue | null>(() => (def ? { ...context, widget, def } : null), [context, widget, def]);

  if (!def || !value) {
    return (
      <div className="dw dw-missing">
        <div className="dw-state">
          <WarningOutlined />
          <span>Widget “{widget.type}” không còn dùng được</span>
          <Button size="small" danger onClick={onRemove}>
            Gỡ widget
          </Button>
        </div>
      </div>
    );
  }

  const appearance = widget.style.appearance === 'inherit' ? (PLAIN_BY_DEFAULT.has(def.type) ? 'plain' : 'inherit') : widget.style.appearance;
  const title = widget.title || def.title;
  const Body = WIDGET_COMPONENTS[def.type];
  const others = spaces.filter(space => space.id !== context.spaceId);
  const menu: MenuProps['items'] = [
    { key: 'settings', icon: <SettingOutlined />, label: 'Cài đặt widget', onClick: onSettings },
    { key: 'duplicate', icon: <CopyOutlined />, label: 'Nhân bản', onClick: onDuplicate },
    ...(others.length
      ? [{ key: 'move', icon: <ExportOutlined />, label: 'Chuyển sang không gian', children: others.map(space => ({ key: `move-${space.id}`, label: space.name, onClick: () => onMove(space.id) })) }]
      : []),
    { type: 'divider' as const },
    { key: 'remove', icon: <DeleteOutlined />, label: 'Gỡ khỏi bàn làm việc', danger: true, onClick: onRemove },
  ];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!editing || event.target !== event.currentTarget) return;
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = step[event.key];
    if (move) {
      event.preventDefault();
      if (event.shiftKey) onNudge(0, 0, move[0], move[1]);
      else onNudge(move[0], move[1], 0, 0);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onRemove();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onSettings();
    }
  };

  const showHeader = editing || (!widget.style.hideHeader && !HEADERLESS.has(def.type));
  return (
    <div
      className={`dw dw-${appearance} dw-type-${def.type.replace('.', '-')}${editing ? ' editing' : ''}${maximized ? ' maximized' : ''}`}
      style={widget.style.accent ? ({ '--dw-accent': widget.style.accent } as React.CSSProperties) : undefined}
      data-widget={widget.id}
      tabIndex={editing ? 0 : undefined}
      onKeyDown={onKeyDown}
      role="region"
      aria-label={editing ? `${title} — mũi tên để dời, Shift + mũi tên để đổi cỡ, Delete để gỡ, Enter để cài đặt` : title}
    >
      {showHeader && (
        <div className={`dw-head${editing ? ' dw-handle' : ''}`}>
          {editing && <HolderOutlined className="dw-grip" />}
          <span className="dw-icon">
            <DeskIcon name={def.icon} size={14} />
          </span>
          <span className="dw-title" title={title}>
            {title}
          </span>
          <span className="dw-actions">
            {def.refresh !== undefined && !editing && (
              <Tooltip title="Làm mới">
                <button type="button" className="dw-btn" aria-label="Làm mới" onClick={() => void invalidate(client, ['/desk/data', '/my-work', '/notifications', '/documents'])}>
                  <ReloadOutlined />
                </button>
              </Tooltip>
            )}
            {maximized ? (
              <Tooltip title="Thu nhỏ (Esc)">
                <button type="button" className="dw-btn" aria-label="Thu nhỏ" onClick={onClose}>
                  <CloseOutlined />
                </button>
              </Tooltip>
            ) : (
              !editing && (
                <Tooltip title="Phóng to">
                  <button type="button" className="dw-btn" aria-label="Phóng to" onClick={onMaximize}>
                    <ExpandOutlined />
                  </button>
                </Tooltip>
              )
            )}
            {!maximized && (
              <Dropdown menu={{ items: menu }} trigger={['click']} placement="bottomRight">
                <button type="button" className="dw-btn" aria-label="Thao tác với widget" onMouseDown={event => event.stopPropagation()}>
                  <MoreOutlined />
                </button>
              </Dropdown>
            )}
          </span>
        </div>
      )}
      <div className="dw-body">
        <WidgetContext.Provider value={value}>
          <WidgetBoundary resetKey={JSON.stringify(widget.settings)}>
            <Suspense fallback={<WidgetSkeleton />}>{Body ? <Body /> : <div className="dw-state muted">{def.description}</div>}</Suspense>
          </WidgetBoundary>
        </WidgetContext.Provider>
      </div>
    </div>
  );
}
