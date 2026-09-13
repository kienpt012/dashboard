import {
  CornerDownLeft,
  Download,
  LogOut,
  MoonStar,
  Plus,
  Search,
  Sparkles,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../api';
import { hasAnyRole } from '../authz';
import { navGroups } from '../nav';
import { readTheme, writeTheme } from '../theme';
import type { Role } from '../types';

/** Bỏ dấu tiếng Việt để gõ "chi tieu" vẫn tìm ra "Quản lý chỉ tiêu". */
function fold(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

type Command = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  group: string;
  keywords: string;
  roles?: readonly Role[];
  run: () => void;
};

/** Tô đậm phần khớp với từ khoá đang gõ. */
function Highlight({ text, query }: { text: string; query: string }) {
  const folded = fold(text);
  const needle = fold(query).trim();
  const at = needle ? folded.indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

/** Bảng lệnh mở bằng Ctrl/⌘ + K.
 *
 *  Hệ thống có 13 màn hình nghiệp vụ; tìm bằng bàn phím nhanh hơn nhiều so với
 *  rà thanh bên, nhất là với cán bộ dùng hằng ngày.
 */
export default function CommandPalette({
  open,
  onClose,
  onOpenCopilot,
}: {
  open: boolean;
  onClose: () => void;
  onOpenCopilot: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const user = auth.user;

  const commands = useMemo<Command[]>(() => {
    const pages: Command[] = navGroups.flatMap(group =>
      group.items.map(item => ({
        id: `nav:${item.to}`,
        label: item.label,
        hint: item.hint,
        icon: item.icon,
        group: group.label,
        keywords: item.keywords ?? '',
        roles: item.roles,
        run: () => navigate(item.to),
      })),
    );

    const actions: Command[] = [
      {
        id: 'act:copilot',
        label: 'Hỏi IOC Copilot',
        hint: 'Mở trợ lý điều hành — Ctrl + J',
        icon: Sparkles,
        group: 'Thao tác nhanh',
        keywords: 'copilot tro ly ai hoi dap',
        run: onOpenCopilot,
      },
      {
        id: 'act:new-target',
        label: 'Đặt chỉ tiêu mới',
        hint: 'Mở biểu mẫu tạo chỉ tiêu',
        icon: Plus,
        group: 'Thao tác nhanh',
        keywords: 'tao chi tieu moi them',
        roles: ['ADMIN'],
        run: () => navigate('/admin/targets?new=1'),
      },
      {
        id: 'act:import',
        label: 'Nhập số liệu từ Excel',
        hint: 'Tải tệp báo cáo lên hệ thống',
        icon: Upload,
        group: 'Thao tác nhanh',
        keywords: 'nhap excel import tai len',
        roles: ['ADMIN', 'MANAGER', 'STAFF'],
        run: () => navigate('/admin/imports'),
      },
      {
        id: 'act:report',
        label: 'Xuất báo cáo chỉ tiêu',
        hint: 'Mở trang báo cáo để tải tệp Excel',
        icon: Download,
        group: 'Thao tác nhanh',
        keywords: 'xuat bao cao excel tai ve',
        run: () => navigate('/admin/reports'),
      },
      {
        id: 'act:theme',
        label: 'Đổi giao diện sáng / tối',
        hint: 'Luân phiên sáng, tối và theo hệ thống',
        icon: MoonStar,
        group: 'Hệ thống',
        keywords: 'giao dien sang toi dark mode theme',
        run: () => {
          const current = readTheme();
          writeTheme(current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light');
        },
      },
      {
        id: 'act:logout',
        label: 'Đăng xuất',
        hint: 'Kết thúc phiên làm việc',
        icon: LogOut,
        group: 'Hệ thống',
        keywords: 'dang xuat thoat logout',
        run: () => {
          auth.clear();
          navigate('/admin/login', { replace: true });
        },
      },
    ];

    return [...pages, ...actions].filter(command => !command.roles || hasAnyRole(user, command.roles));
  }, [navigate, onOpenCopilot, user]);

  const results = useMemo(() => {
    const needle = fold(query).trim();
    if (!needle) return commands;
    return commands
      .map(command => {
        const label = fold(command.label);
        const haystack = `${label} ${fold(command.hint)} ${command.keywords}`;
        if (!haystack.includes(needle)) return null;
        // Khớp ngay đầu nhãn được ưu tiên, rồi đến khớp giữa nhãn, cuối cùng là từ khoá.
        const rank = label.startsWith(needle) ? 0 : label.includes(needle) ? 1 : 2;
        return { command, rank };
      })
      .filter((entry): entry is { command: Command; rank: number } => entry !== null)
      .sort((a, b) => a.rank - b.rank)
      .map(entry => entry.command);
  }, [commands, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>();
    results.forEach(command => {
      const bucket = map.get(command.group) ?? [];
      bucket.push(command);
      map.set(command.group, bucket);
    });
    return [...map.entries()];
  }, [results]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Giữ mục đang chọn nằm trong tầm nhìn khi di chuyển bằng phím mũi tên.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  if (!open) return null;

  const run = (command: Command) => {
    onClose();
    command.run();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor(value => (results.length ? (value + 1) % results.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor(value => (results.length ? (value - 1 + results.length) % results.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const command = results[cursor];
      if (command) run(command);
    }
  };

  let index = -1;

  return (
    <div className="cmdk-backdrop" onMouseDown={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Bảng lệnh"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="cmdk-input">
          <Search aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Tìm màn hình hoặc thao tác…"
            aria-label="Tìm màn hình hoặc thao tác"
            aria-controls="cmdk-results"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="kbd">Esc</kbd>
        </div>

        <div className="cmdk-list" id="cmdk-results" ref={listRef} role="listbox">
          {!results.length && <div className="cmdk-empty">Không tìm thấy mục nào khớp với “{query}”.</div>}
          {grouped.map(([group, entries]) => (
            <div key={group}>
              <p className="cmdk-group">{group}</p>
              {entries.map(command => {
                index += 1;
                const position = index;
                const Icon = command.icon;
                return (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={position === cursor}
                    className="cmdk-item"
                    data-active={position === cursor}
                    onMouseMove={() => setCursor(position)}
                    onClick={() => run(command)}
                  >
                    <Icon aria-hidden="true" />
                    <div>
                      <strong>
                        <Highlight text={command.label} query={query} />
                      </strong>
                      <small>{command.hint}</small>
                    </div>
                    {position === cursor && <CornerDownLeft aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="cmdk-foot">
          <span>
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> di chuyển
          </span>
          <span>
            <kbd className="kbd">↵</kbd> chọn
          </span>
          <span>
            <kbd className="kbd">Esc</kbd> đóng
          </span>
        </div>
      </div>
    </div>
  );
}
