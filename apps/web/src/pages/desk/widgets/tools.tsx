import { AimOutlined, ExportOutlined, LoadingOutlined, PlusOutlined, RocketOutlined, SearchOutlined, SendOutlined, WarningOutlined } from '@ant-design/icons';
import { AutoComplete, Button, Input, Tooltip } from 'antd';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { askJarvis } from '@/app/layout/jarvis/ask';
import { navItems } from '@/app/nav';
import { useMe } from '@/app/session';
import { STATUS } from '@/components/Tags';
import { useApi } from '@/hooks/useApi';
import { errorText, http } from '@/lib/api';
import { pct } from '@/lib/format';
import type { CopilotResponse } from '@/types/core';
import { deskApi } from '../api';
import { DeskIcon } from '../icons';
import { LinkTile, useVisibleItems, type TileSize } from '../LinkTile';
import type { DockItem, TargetOption } from '../types';
import { useDesk } from '../useDesk';
import { useSettings, useWidget } from './context';
import { Note } from './parts';
import { matchScreens, providerUrl } from './tools-logic';

// Widget công cụ: lưới lối tắt, ô tìm kiếm (trong hệ thống và các trang tra cứu), hỏi Jarvis ngay trên bàn làm việc.

/* ───────────── Lối tắt ───────────── */

export function Launcher() {
  const { items = [], size = 'm', showLabels = true } = useSettings<{ items: DockItem[]; size: TileSize; showLabels: boolean }>();
  const { openSettings, editing } = useWidget();
  const visible = useVisibleItems(items);
  if (!visible.length) {
    return (
      <Note
        icon={<RocketOutlined />}
        action={
          <Button size="small" icon={<PlusOutlined />} onClick={openSettings}>
            Thêm lối tắt
          </Button>
        }
      >
        {items.length ? 'Các lối tắt ở đây bạn không có quyền mở' : 'Ghim chức năng hay dùng, trang đã lọc, trang web ngoài'}
      </Note>
    );
  }
  return (
    <div className={`tw-launcher tw-${size}${showLabels ? '' : ' no-label'}`}>
      {visible.map(item => (
        <LinkTile key={item.id} item={item} size={size} showLabel={showLabels} />
      ))}
      {editing && (
        <button type="button" className="lt tw-add" onClick={openSettings} aria-label="Thêm lối tắt">
          <span className="lt-icon">
            <PlusOutlined />
          </span>
          {showLabels && <span className="lt-label">Thêm</span>}
        </button>
      )}
    </div>
  );
}

/* ───────────── Tìm kiếm ───────────── */

function useDebounced<T>(value: T, delay = 250) {
  const [current, setCurrent] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setCurrent(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return current;
}

function Suggestion({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <span className="tw-option">
      <span className="tw-suggest-icon">{icon}</span>
      <span className="tw-suggest-text">
        <span className="wr-title">{title}</span>
        <span className="wr-meta">{sub}</span>
      </span>
    </span>
  );
}

/**
 * Tìm trong hệ thống (chức năng được phép mở, chỉ tiêu trong phạm vi xem) và tra cứu trên các trang ngoài. Gợi ý hiện
 * trong bảng nổi nên không bị khung widget che; Enter mở gợi ý đang chọn, không có gợi ý thì mở danh mục chỉ tiêu đã lọc.
 */
export function Search() {
  const { internal = true, providerIds = [] } = useSettings<{ internal: boolean; providerIds: string[] }>();
  const { year } = useWidget();
  const desk = useDesk();
  const user = useMe();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const term = useDebounced(text.trim());
  const query = text.trim();
  const providers = (desk.profile?.config.searchProviders ?? []).filter(provider => !providerIds.length || providerIds.includes(provider.id));
  const targets = useApi<TargetOption[]>(internal && term.length >= 2 ? deskApi.targetsPath(null, term, year) : null, { keepPrevious: true });

  const options = useMemo(() => {
    if (!internal || !term) return [];
    const screens = matchScreens(term, user.role, navItems, 4);
    const found = term.length >= 2 ? (targets.data ?? []).slice(0, 6) : [];
    return [
      ...(screens.length
        ? [{ label: 'Chức năng', options: screens.map(item => ({ value: `screen:${item.path}`, label: <Suggestion icon={item.icon} title={item.label} sub="Mở chức năng" /> })) }]
        : []),
      ...(found.length
        ? [
            {
              label: 'Chỉ tiêu',
              options: found.map(target => ({
                value: `target:${target.id}`,
                label: <Suggestion icon={<AimOutlined />} title={target.title} sub={`${target.code} · ${STATUS[target.status]?.label ?? ''} · ${pct(target.progress)}`} />,
              })),
            },
          ]
        : []),
    ];
  }, [internal, term, user.role, targets.data]);

  const hasOptions = options.some(group => group.options.length);
  const searchAll = () => {
    if (!query) return;
    if (internal) navigate(`/admin/targets?q=${encodeURIComponent(query)}&year=${year}`);
    else if (providers[0]) window.open(providerUrl(providers[0].url, query), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="tw-search">
      <AutoComplete
        className="tw-search-box"
        value={text}
        options={options}
        open={focused && query.length > 0 && (hasOptions || providers.length > 0 || internal)}
        defaultActiveFirstOption={false}
        popupMatchSelectWidth={360}
        onChange={value => setText(String(value ?? ''))}
        onSelect={value => {
          setText('');
          const raw = String(value);
          navigate(raw.startsWith('target:') ? `/admin/targets/${raw.slice(7)}` : raw.slice(7));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        popupRender={menu => (
          <div className="tw-search-pop">
            {internal &&
              (hasOptions ? (
                menu
              ) : (
                <span className="tw-none">{term.length < 2 || targets.isFetching ? 'Đang tìm…' : 'Không thấy chỉ tiêu hay chức năng khớp'}</span>
              ))}
            {internal && (
              <button type="button" className="tw-search-all" onMouseDown={event => event.preventDefault()} onClick={searchAll}>
                <SearchOutlined /> Tìm “{query}” trong danh mục chỉ tiêu
              </button>
            )}
            {providers.length > 0 && (
              <div className="tw-providers">
                <span>Tra cứu trên web</span>
                {providers.map(provider => (
                  <a key={provider.id} className="tw-provider" href={providerUrl(provider.url, query)} target="_blank" rel="noopener noreferrer" onMouseDown={event => event.preventDefault()}>
                    {provider.name} <ExportOutlined />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      >
        <Input
          variant="filled"
          allowClear
          prefix={internal && targets.isFetching ? <LoadingOutlined /> : <SearchOutlined />}
          placeholder={internal ? 'Tìm chỉ tiêu, chức năng… hoặc tra cứu trên web' : 'Tra cứu trên các trang đã chọn'}
          aria-label="Tìm kiếm"
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter' && !hasOptions) searchAll();
          }}
        />
      </AutoComplete>
    </div>
  );
}

/* ───────────── Hỏi Jarvis ───────────── */

type Exchange = { question: string; answer?: CopilotResponse; error?: string; busy: boolean };

export function JarvisWidget() {
  const { prompts = [] } = useSettings<{ prompts: string[] }>();
  const [text, setText] = useState('');
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const busy = useRef(false);

  const ask = async (question: string) => {
    const content = question.trim();
    if (!content || busy.current) return;
    busy.current = true;
    setText('');
    setExchange({ question: content, busy: true });
    try {
      const answer = await http.post<CopilotResponse>('/copilot/messages', { message: content });
      setExchange({ question: content, answer, busy: false });
    } catch (error) {
      setExchange({ question: content, error: errorText(error, 'Jarvis chưa trả lời được'), busy: false });
    } finally {
      busy.current = false;
    }
  };

  const rows = exchange?.answer?.rows?.length ?? 0;
  return (
    <div className="tw-jarvis">
      {exchange ? (
        <div className="tw-jarvis-turn" aria-live="polite">
          <span className="tw-jarvis-q">{exchange.question}</span>
          {exchange.busy ? (
            <span className="tw-jarvis-thinking">
              <DeskIcon name="jarvis" size={16} /> Jarvis đang trả lời…
            </span>
          ) : exchange.error ? (
            <span className="tw-jarvis-error">
              <WarningOutlined /> {exchange.error}
            </span>
          ) : (
            <>
              <div className="tw-jarvis-a pre-line">{exchange.answer?.reply}</div>
              {exchange.answer?.pendingAction && <span className="tw-jarvis-note">Câu này cần bạn xác nhận thao tác — mở trong Jarvis để xem và xác nhận.</span>}
              {!exchange.answer?.pendingAction && rows > 0 && <span className="tw-jarvis-note">Kèm {rows} dòng kết quả — mở trong Jarvis để xem bảng.</span>}
              <div className="tw-jarvis-actions">
                <Button size="small" type={exchange.answer?.pendingAction ? 'primary' : 'default'} icon={<DeskIcon name="jarvis" size={14} />} onClick={() => askJarvis(exchange.question, exchange.answer)}>
                  Mở trong Jarvis
                </Button>
                <Button size="small" type="text" onClick={() => setExchange(null)}>
                  Hỏi câu khác
                </Button>
              </div>
            </>
          )}
        </div>
      ) : prompts.length ? (
        <div className="tw-prompts">
          {prompts.map(prompt => (
            <button key={prompt} type="button" className="tw-prompt" onClick={() => void ask(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      ) : (
        <Note icon={<DeskIcon name="jarvis" size={20} />}>Hỏi Jarvis về chỉ tiêu, báo cáo, việc của phòng</Note>
      )}
      <Input
        className="tw-jarvis-input"
        variant="filled"
        value={text}
        maxLength={500}
        onChange={event => setText(event.target.value)}
        onPressEnter={() => void ask(text)}
        placeholder="Hỏi Jarvis…"
        aria-label="Câu hỏi cho Jarvis"
        suffix={
          <Tooltip title="Gửi (Enter)">
            <Button type="text" size="small" icon={<SendOutlined />} disabled={!text.trim() || exchange?.busy} onClick={() => void ask(text)} aria-label="Gửi" />
          </Tooltip>
        }
      />
    </div>
  );
}
