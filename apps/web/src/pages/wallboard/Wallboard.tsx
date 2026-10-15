import { CaretRightOutlined, CloseOutlined, FullscreenExitOutlined, FullscreenOutlined, LeftOutlined, PauseOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { localityInitials, type PublicLocality } from '@/app/locality';
import { useUser } from '@/app/session';
import { Chart, type ChartOption } from '@/components/Chart';
import { STATUS, STATUS_ORDER } from '@/components/Tags';
import { useApi } from '@/hooks/useApi';
import { errorText } from '@/lib/api';
import { num, vn } from '@/lib/format';
import { can, FRAMEWORK_EDITORS } from '@/lib/roles';
import type { FrameworkSummary, TargetBrief, TargetStatusKey } from '@/types/domain';
import './wallboard.css';

// Trình chiếu phòng họp: dựng trên khung cố định 1920×1080 rồi co giãn đều theo màn hình, nên TV hay laptop
// đều hiện giống hệt nhau, không tràn, không chen chữ. Danh sách dài được chia trang và tự lật.

type WallTarget = TargetBrief & { missingPeriods?: string[]; explanationRequested?: boolean };
type FrameworkSlide = { type: 'framework'; id: string; title: string; kind: string; kindLabel: string; legalBasis?: string | null; summary: FrameworkSummary; targets: WallTarget[] };
type DepartmentSlide = { type: 'department'; id: string; title: string; color: string; targets: WallTarget[] };
type Slide = FrameworkSlide | DepartmentSlide;
type Stalled = WallTarget & { reason?: string; bounceCount?: number };
type Wall = { year: number; generatedAt: string; rotateSeconds: number; locality: PublicLocality; slides: Slide[]; stalled: Stalled[] };

type Frame =
  | { kind: 'overview'; key: string; group: number }
  | { kind: 'slide'; key: string; group: number; slide: Slide; rows: WallTarget[]; page: number; pages: number }
  | { kind: 'stalled'; key: string; group: number; rows: Stalled[]; page: number; pages: number };

const W = 1920;
const H = 1080;
const ROWS = 8;
const WEIGHT: Record<TargetStatusKey, number> = { OVERDUE: 0, AT_RISK: 1, NOT_STARTED: 2, ON_TRACK: 3, COMPLETED: 4 };

function useScale() {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const update = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

/** Một hàng cao 70px + khoảng cách 8px; mỗi dòng tên thêm 29px. Trang chứa tối đa chiều cao của 8 hàng một dòng. */
const ROW = 78;
const LINE = 29;

function rowHeight(title: string, charsPerLine: number) {
  return ROW + (Math.min(3, Math.ceil(title.length / charsPerLine)) - 1) * LINE;
}

/** Chia trang theo chiều cao ước tính để tên dài được xuống dòng mà trang vẫn vừa khung. */
function paginate<T>(list: T[], height: (item: T) => number, budget: number) {
  const pages: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const item of list) {
    const size = height(item);
    if (current.length && used + size > budget) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += size;
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

function sortTargets(targets: WallTarget[]) {
  return [...targets].sort((a, b) => WEIGHT[a.status] - WEIGHT[b.status] || (a.progress ?? 0) - (b.progress ?? 0));
}

function Clock() {
  const [now, setNow] = useState(() => vn());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(vn()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="wb-clock">
      <strong>{now.format('HH:mm')}</strong>
      <span>{now.format('dddd, DD/MM/YYYY')}</span>
    </div>
  );
}

function Donut({ counts, center, sub, size = 300 }: { counts: Partial<Record<TargetStatusKey, number>>; center: string; sub: string; size?: number }) {
  const option = useMemo<ChartOption>(
    () => ({
      tooltip: { show: false },
      animation: false,
      series: [
        {
          type: 'pie',
          radius: ['72%', '94%'],
          padAngle: 1.5,
          itemStyle: { borderRadius: 4 },
          label: { show: false },
          silent: true,
          data: STATUS_ORDER.map(key => ({ value: counts[key] ?? 0, itemStyle: { color: STATUS[key].hex } })),
        },
      ],
    }),
    [counts],
  );
  return (
    <div className="wb-donut" style={{ width: size, height: size }}>
      <Chart option={option} height={size} />
      <div className="wb-donut-center">
        <strong>{center}</strong>
        <span>{sub}</span>
      </div>
    </div>
  );
}

function Counts({ counts }: { counts: Partial<Record<TargetStatusKey, number>> }) {
  return (
    <div className="wb-counts">
      {STATUS_ORDER.map(key => (
        <div key={key}>
          <i style={{ background: STATUS[key].hex }} />
          <span>{STATUS[key].label}</span>
          <b>{num(counts[key] ?? 0)}</b>
        </div>
      ))}
    </div>
  );
}

function countsOf(targets: WallTarget[]) {
  return targets.reduce<Partial<Record<TargetStatusKey, number>>>((acc, target) => ({ ...acc, [target.status]: (acc[target.status] ?? 0) + 1 }), {});
}

function frameworkResult(slide: FrameworkSlide) {
  const s = slide.summary;
  if (slide.kind === 'SCORE' && s.score !== null) return { center: num(s.score), sub: `/ ${num(s.maxScore ?? 100)} điểm` };
  if (slide.kind === 'STAT') return { center: `${num(s.reported)}/${num(s.total)}`, sub: 'có số liệu' };
  return { center: `${num(s.progress ?? 0)}%`, sub: 'tiến độ' };
}

function Rows({ rows, showDepartment }: { rows: WallTarget[]; showDepartment: boolean }) {
  const statOnly = rows.every(target => target.kind === 'STAT');
  return (
    <div className={`wb-table${statOnly ? ' stat' : ''}`}>
      <div className="wb-thead">
        <span />
        <span>Chỉ tiêu</span>
        <span className="right">{statOnly ? 'Số liệu' : 'Thực hiện / Kế hoạch'}</span>
        <span>{statOnly ? 'Tình trạng' : 'Tiến độ'}</span>
      </div>
      {rows.map(target => {
        const color = STATUS[target.status].hex;
        const stat = target.kind === 'STAT';
        const who = showDepartment ? target.departmentName : target.assigneeName ?? (target.valueSource === 'MANUAL' ? 'Chưa giao người' : 'Tự tính');
        return (
          <div className="wb-row" key={target.id}>
            <i className="wb-row-bar" style={{ background: color }} />
            <div className="wb-row-main">
              <span className="wb-row-title">{target.title}</span>
              <span className="wb-row-sub">
                {who}
                {target.missingPeriods?.length ? <em> · thiếu {target.missingPeriods.slice(-2).join(', ')}</em> : null}
                {target.explanationRequested ? <em> · đang giải trình</em> : null}
              </span>
            </div>
            <div className="wb-row-value">
              {stat ? (target.hasReport ? `${num(target.currentValue)} ${target.unit}` : '—') : `${num(target.currentValue)} / ${target.targetText || num(target.targetValue)}`}
            </div>
            <div className="wb-row-progress">
              {stat ? (
                <b style={{ color }}>{target.hasReport ? 'Có số liệu' : 'Chưa có'}</b>
              ) : (
                <>
                  <div className="wb-bar">
                    <i style={{ width: `${Math.min(100, Math.max(0, target.progress ?? 0))}%`, background: color }} />
                  </div>
                  <b>{num(Math.round(target.progress ?? 0))}%</b>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Pager({ page, pages, extra }: { page: number; pages: number; extra?: ReactNode }) {
  if (pages <= 1 && !extra) return null;
  return (
    <div className="wb-pager">
      {pages > 1 && (
        <>
          <span>
            Trang {page + 1}/{pages}
          </span>
          <div className="wb-pager-dots">
            {Array.from({ length: pages }, (_, index) => (
              <i key={index} className={index === page ? 'on' : ''} />
            ))}
          </div>
        </>
      )}
      {extra}
    </div>
  );
}

function SlideView({ frame }: { frame: Extract<Frame, { kind: 'slide' }> }) {
  const slide = frame.slide;
  const framework = slide.type === 'framework';
  const counts = framework ? slide.summary.counts : countsOf(slide.targets);
  const result = framework ? frameworkResult(slide) : (() => {
    const planned = slide.targets.filter(target => target.kind !== 'STAT');
    const avg = planned.length ? Math.round(planned.reduce((sum, target) => sum + Math.min(100, target.progress ?? 0), 0) / planned.length) : 0;
    return { center: `${num(avg)}%`, sub: 'tiến độ bình quân' };
  })();
  const mini = framework
    ? [
        { label: 'Chỉ tiêu', value: num(slide.summary.total) },
        { label: 'Có chỉ đạo', value: num(slide.summary.withDirective) },
        { label: 'Đã đánh giá', value: num(slide.summary.withEvaluation) },
      ]
    : [
        { label: 'Chỉ tiêu', value: num(slide.targets.length) },
        { label: 'Thiếu báo cáo', value: num(slide.targets.filter(target => target.missingPeriods?.length).length), warn: true },
        { label: 'Đang giải trình', value: num(slide.targets.filter(target => target.explanationRequested).length), warn: true },
      ];
  return (
    <div className="wb-slide">
      <aside className="wb-side">
        <span className="wb-chip" style={!framework ? { background: slide.color } : undefined}>
          {framework ? slide.kindLabel : 'Phòng ban'}
        </span>
        <Donut counts={counts} center={result.center} sub={result.sub} />
        <Counts counts={counts} />
        <div className="wb-mini">
          {mini.map(item => (
            <div key={item.label}>
              <span>{item.label}</span>
              <b className={'warn' in item && item.warn && item.value !== '0' ? 'warn' : undefined}>{item.value}</b>
            </div>
          ))}
        </div>
      </aside>
      <section className="wb-main">
        <h2>
          {!framework && <i className="wb-dot" style={{ background: slide.color }} />}
          <span>{slide.title}</span>
        </h2>
        {framework && slide.legalBasis && <p className="wb-basis">{slide.legalBasis}</p>}
        <Rows rows={frame.rows} showDepartment={framework} />
        <Pager page={frame.page} pages={frame.pages} />
      </section>
    </div>
  );
}

function OverviewView({ data }: { data: Wall }) {
  const frameworks = data.slides.filter((slide): slide is FrameworkSlide => slide.type === 'framework').slice(0, 4);
  const departments = data.slides
    .filter((slide): slide is DepartmentSlide => slide.type === 'department')
    .map(slide => {
      const planned = slide.targets.filter(target => target.kind !== 'STAT');
      const avg = planned.length ? Math.round(planned.reduce((sum, target) => sum + Math.min(100, target.progress ?? 0), 0) / planned.length) : 0;
      return { ...slide, avg, counts: countsOf(slide.targets), total: slide.targets.length };
    })
    .sort((a, b) => b.avg - a.avg);
  return (
    <div className="wb-overview">
      <section>
        <h2>Bộ chỉ tiêu năm {data.year}</h2>
        <div className={`wb-fw-grid n${frameworks.length}`}>
          {frameworks.map(slide => {
            const result = frameworkResult(slide);
            return (
              <div className="wb-fw" key={slide.id}>
                <Donut counts={slide.summary.counts} center={result.center} sub={result.sub} size={200} />
                <div className="wb-fw-text">
                  <span className="wb-chip small">{slide.kindLabel}</span>
                  <strong>{slide.title}</strong>
                  <span>
                    {num(slide.summary.total)} chỉ tiêu · {num(slide.summary.counts.COMPLETED ?? 0)} hoàn thành · {num((slide.summary.counts.AT_RISK ?? 0) + (slide.summary.counts.OVERDUE ?? 0))} cần chú ý
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <h2>Tiến độ theo phòng</h2>
        <div className="wb-dept-list">
          {departments.slice(0, 8).map(item => (
            <div className="wb-dept" key={item.id}>
              <div className="wb-dept-head">
                <span>
                  <i style={{ background: item.color }} />
                  {item.title}
                </span>
                <b>{num(item.avg)}%</b>
              </div>
              <div className="wb-dist">
                {STATUS_ORDER.map(key =>
                  item.counts[key] ? <i key={key} style={{ width: `${((item.counts[key] ?? 0) / Math.max(1, item.total)) * 100}%`, background: STATUS[key].hex }} /> : null,
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StalledView({ frame }: { frame: Extract<Frame, { kind: 'stalled' }> }) {
  return (
    <div className="wb-slide single">
      <section className="wb-main">
        <h2>
          <span>Việc bị treo</span>
        </h2>
        <div className="wb-table">
          <div className="wb-thead stalled">
            <span />
            <span>Chỉ tiêu</span>
            <span>Lý do</span>
          </div>
          {frame.rows.map(item => (
            <div className="wb-row stalled" key={item.id}>
              <i className="wb-row-bar" style={{ background: STATUS.OVERDUE.hex }} />
              <div className="wb-row-main">
                <span className="wb-row-title">{item.title}</span>
                <span className="wb-row-sub">
                  {item.code} · {item.departmentName}
                </span>
              </div>
              <div className="wb-row-reason">{item.reason ?? (item.explanationRequested ? 'Quá hạn trả lời giải trình' : 'Chưa giao người phụ trách')}</div>
            </div>
          ))}
        </div>
        <Pager page={frame.page} pages={frame.pages} />
      </section>
    </div>
  );
}

export default function Wallboard() {
  const navigate = useNavigate();
  const user = useUser();
  const scale = useScale();
  const wall = useApi<Wall>('/ioc/wallboard', { refetchInterval: 120_000 });
  const data = wall.data;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [full, setFull] = useState(false);

  const frames = useMemo<Frame[]>(() => {
    if (!data) return [];
    const list: Frame[] = [];
    let group = 0;
    if (data.slides.some(slide => slide.type === 'framework')) list.push({ kind: 'overview', key: 'overview', group: group++ });
    for (const slide of data.slides) {
      if (!slide.targets.length) continue;
      const perLine = slide.targets.every(target => target.kind === 'STAT') ? 66 : 50;
      const pages = paginate(slide.type === 'department' ? slide.targets : sortTargets(slide.targets), target => rowHeight(target.title, perLine), ROWS * ROW);
      pages.forEach((rows, page) => list.push({ kind: 'slide', key: `${slide.type}-${slide.id}-${page}`, group, slide, rows, page, pages: pages.length }));
      group += 1;
    }
    if (data.stalled.length) {
      const pages = paginate(data.stalled, item => rowHeight(item.title, 95), (ROWS + 1) * ROW);
      pages.forEach((rows, page) => list.push({ kind: 'stalled', key: `stalled-${page}`, group, rows, page, pages: pages.length }));
      group += 1;
    }
    return list;
  }, [data]);

  const total = frames.length;
  const position = total ? index % total : 0;
  const frame = frames[position];
  const groups = total ? frames[total - 1].group + 1 : 0;
  // Trang con của cùng một bộ lật nhanh hơn để cả bộ không quá dài.
  const seconds = frame && 'pages' in frame && frame.pages > 1 ? Math.max(8, Math.round((data?.rotateSeconds ?? 20) * 0.6)) : data?.rotateSeconds ?? 20;

  const go = useCallback((delta: number) => setIndex(value => (total ? (((value + delta) % total) + total) % total : 0)), [total]);

  useEffect(() => {
    if (paused || total < 2) return;
    const timer = window.setTimeout(() => go(1), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [index, paused, total, seconds, go]);

  useEffect(() => {
    document.title = `Trình chiếu · ${data?.locality.brandName ?? 'IOC'}`;
  }, [data?.locality.brandName]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') go(1);
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(-1);
      else if (event.key === ' ') {
        event.preventDefault();
        setPaused(value => !value);
      } else if (event.key.toLowerCase() === 'f') void toggleFull();
      else if (event.key === 'Escape' && !document.fullscreenElement) navigate('/admin');
    };
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, [go, navigate]);

  async function toggleFull() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else await document.documentElement.requestFullscreen().catch(() => undefined);
  }

  const canvasStyle = { width: W, height: H, transform: `scale(${scale})`, left: (window.innerWidth - W * scale) / 2, top: (window.innerHeight - H * scale) / 2 };

  let body: ReactNode;
  if (!data) {
    body = wall.error ? (
      <div className="wb-empty">
        <span>{errorText(wall.error, 'Không tải được dữ liệu trình chiếu')}</span>
        <Button size="large" icon={<ReloadOutlined />} onClick={() => void wall.refetch()}>
          Thử lại
        </Button>
      </div>
    ) : (
      <div className="wb-empty">
        <Spin size="large" />
      </div>
    );
  } else if (!frame) {
    body = (
      <div className="wb-empty">
        <span>Chưa có bộ chỉ tiêu nào bật trình chiếu</span>
        {can(user, FRAMEWORK_EDITORS) && (
          <Button size="large" type="primary" onClick={() => navigate('/admin/bo-chi-tieu')}>
            Mở Bộ chỉ tiêu
          </Button>
        )}
      </div>
    );
  } else {
    body = (
      <main className="wb-stage" key={frame.key}>
        {frame.kind === 'overview' ? <OverviewView data={data} /> : frame.kind === 'slide' ? <SlideView frame={frame} /> : <StalledView frame={frame} />}
      </main>
    );
  }

  return (
    <div className="wb-viewport">
      <div className="wb" style={canvasStyle}>
        <header className="wb-top">
          <div className="wb-brand">
            <span className="wb-mark">{localityInitials(data?.locality ?? ({ shortName: 'IOC', name: 'IOC' } as PublicLocality))}</span>
            <div className="wb-brand-text">
              <strong>{data?.locality.brandName ?? 'IOC'}</strong>
              <span>
                {data?.locality.agencyName}
                {data ? ` · Năm ${data.year}` : ''}
              </span>
            </div>
          </div>
          <div className="wb-dots">
            {Array.from({ length: groups }, (_, group) => (
              <button
                key={group}
                type="button"
                className={frame && frame.group === group ? 'on' : ''}
                onClick={() => setIndex(frames.findIndex(item => item.group === group))}
                aria-label={`Phần ${group + 1}`}
              />
            ))}
          </div>
          <Clock />
        </header>
        {body}
        <footer className="wb-bottom">
          <span>{data ? `Số liệu lúc ${vn(data.generatedAt).format('HH:mm DD/MM/YYYY')}` : ''}</span>
          <div className="wb-controls">
            <button type="button" onClick={() => go(-1)} aria-label="Trang trước">
              <LeftOutlined />
            </button>
            <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Chạy tiếp' : 'Tạm dừng'}>
              {paused ? <CaretRightOutlined /> : <PauseOutlined />}
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Trang sau">
              <RightOutlined />
            </button>
            <button type="button" onClick={() => void toggleFull()} aria-label="Toàn màn hình">
              {full ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            </button>
            <button type="button" onClick={() => navigate('/admin')} aria-label="Thoát trình chiếu">
              <CloseOutlined />
            </button>
          </div>
        </footer>
        {!paused && total > 1 && <div className="wb-timer" key={`t-${index}`} style={{ animationDuration: `${seconds}s` }} />}
      </div>
    </div>
  );
}
