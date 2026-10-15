import { CaretRightOutlined, CloseOutlined, FullscreenExitOutlined, FullscreenOutlined, LeftOutlined, PauseOutlined, RightOutlined } from '@ant-design/icons';
import { Spin } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { localityInitials, type PublicLocality } from '@/app/locality';
import { Chart, type ChartOption } from '@/components/Chart';
import { LoadError } from '@/components/States';
import { STATUS, STATUS_ORDER } from '@/components/Tags';
import { useApi } from '@/hooks/useApi';
import { num, vn } from '@/lib/format';
import { periodLabel } from '@/lib/periods';
import type { FrameworkSummary, TargetBrief, TargetStatusKey } from '@/types/domain';
import './wallboard.css';

type WallTarget = TargetBrief & { missingPeriods?: string[]; explanationRequested?: boolean };
type Slide =
  | { type: 'framework'; id: string; title: string; kind: string; kindLabel: string; legalBasis?: string | null; summary: FrameworkSummary; targets: WallTarget[] }
  | { type: 'department'; id: string; title: string; color: string; targets: WallTarget[] };
type Wall = { year: number; generatedAt: string; rotateSeconds: number; locality: PublicLocality; slides: Slide[]; stalled: (TargetBrief & { reason: string })[] };

const WEIGHT: Record<TargetStatusKey, number> = { OVERDUE: 0, AT_RISK: 1, NOT_STARTED: 2, ON_TRACK: 3, COMPLETED: 4 };
const ROWS = 9;

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

function Donut({ counts, center, sub }: { counts: Partial<Record<TargetStatusKey, number>>; center: string; sub: string }) {
  const option = useMemo<ChartOption>(
    () => ({
      tooltip: { show: false },
      series: [
        {
          type: 'pie',
          radius: ['70%', '92%'],
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
    <div className="wb-donut">
      <Chart option={option} height={300} />
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

function TargetRows({ targets, showDept }: { targets: WallTarget[]; showDept?: boolean }) {
  const sorted = [...targets].sort((a, b) => WEIGHT[a.status] - WEIGHT[b.status] || (a.progress ?? 0) - (b.progress ?? 0));
  const shown = sorted.slice(0, ROWS);
  return (
    <div className="wb-rows">
      {shown.map(target => {
        const color = STATUS[target.status].hex;
        const stat = target.kind === 'STAT';
        return (
          <div className="wb-row" key={target.id}>
            <i className="wb-row-bar" style={{ background: color }} />
            <div className="wb-row-main">
              <span className="wb-row-title">{target.title}</span>
              <span className="wb-row-sub">
                {showDept ? target.departmentName : target.assigneeName ?? (target.valueSource === 'COMPUTED' ? 'Tự tính' : 'Chưa giao người')}
                {target.missingPeriods?.length ? <em> · thiếu {target.missingPeriods.map(periodLabel).join(', ')}</em> : null}
                {target.explanationRequested ? <em> · đang giải trình</em> : null}
              </span>
            </div>
            <div className="wb-row-value">
              {stat ? (target.hasReport ? num(target.currentValue) : '—') : `${num(target.currentValue)} / ${target.targetText || num(target.targetValue)}`}
              <small>{target.unit}</small>
            </div>
            <div className="wb-row-progress">
              {!stat && (
                <>
                  <div className="wb-bar">
                    <i style={{ width: `${Math.min(100, target.progress ?? 0)}%`, background: color }} />
                  </div>
                  <b>{num(Math.round(target.progress ?? 0))}%</b>
                </>
              )}
              {stat && <b style={{ color }}>{target.hasReport ? 'Có số liệu' : 'Chưa có'}</b>}
            </div>
          </div>
        );
      })}
      {sorted.length > ROWS && <div className="wb-more">và {num(sorted.length - ROWS)} chỉ tiêu khác</div>}
    </div>
  );
}

function FrameworkSlide({ slide }: { slide: Extract<Slide, { type: 'framework' }> }) {
  const s = slide.summary;
  const center = slide.kind === 'SCORE' && s.score !== null ? num(s.score) : slide.kind === 'STAT' ? `${num(s.reported)}/${num(s.total)}` : `${num(s.progress ?? 0)}%`;
  const sub = slide.kind === 'SCORE' ? `/ ${num(s.maxScore ?? 100)} điểm` : slide.kind === 'STAT' ? 'có số liệu' : 'tiến độ';
  return (
    <div className="wb-slide">
      <aside className="wb-side">
        <span className="wb-kind">{slide.kindLabel}</span>
        <Donut counts={s.counts} center={center} sub={sub} />
        <Counts counts={s.counts} />
        <div className="wb-mini">
          <div>
            <span>Chỉ tiêu</span>
            <b>{num(s.total)}</b>
          </div>
          <div>
            <span>Có chỉ đạo</span>
            <b>{num(s.withDirective)}</b>
          </div>
          <div>
            <span>Đã đánh giá</span>
            <b>{num(s.withEvaluation)}</b>
          </div>
        </div>
      </aside>
      <section className="wb-main">
        <h2>{slide.title}</h2>
        {slide.legalBasis && <p className="wb-basis">{slide.legalBasis}</p>}
        <TargetRows targets={slide.targets} showDept />
      </section>
    </div>
  );
}

function DepartmentSlide({ slide }: { slide: Extract<Slide, { type: 'department' }> }) {
  const counts = slide.targets.reduce<Partial<Record<TargetStatusKey, number>>>((acc, target) => ({ ...acc, [target.status]: (acc[target.status] ?? 0) + 1 }), {});
  const planned = slide.targets.filter(target => target.kind !== 'STAT');
  const avg = planned.length ? Math.round(planned.reduce((sum, target) => sum + Math.min(100, target.progress ?? 0), 0) / planned.length) : 0;
  const missing = slide.targets.filter(target => target.missingPeriods?.length).length;
  return (
    <div className="wb-slide">
      <aside className="wb-side">
        <span className="wb-kind" style={{ background: slide.color }}>
          Phòng ban
        </span>
        <Donut counts={counts} center={`${num(avg)}%`} sub="tiến độ bình quân" />
        <Counts counts={counts} />
        <div className="wb-mini">
          <div>
            <span>Chỉ tiêu</span>
            <b>{num(slide.targets.length)}</b>
          </div>
          <div>
            <span>Thiếu báo cáo</span>
            <b style={{ color: missing ? '#fbbf24' : undefined }}>{num(missing)}</b>
          </div>
          <div>
            <span>Giải trình</span>
            <b>{num(slide.targets.filter(target => target.explanationRequested).length)}</b>
          </div>
        </div>
      </aside>
      <section className="wb-main">
        <h2>
          <i className="wb-dot" style={{ background: slide.color }} />
          {slide.title}
        </h2>
        <TargetRows targets={slide.targets} />
      </section>
    </div>
  );
}

function StalledSlide({ items }: { items: Wall['stalled'] }) {
  return (
    <div className="wb-slide single">
      <section className="wb-main">
        <h2>Việc bị treo ({num(items.length)})</h2>
        <div className="wb-rows">
          {items.slice(0, ROWS + 1).map(item => (
            <div className="wb-row" key={item.id}>
              <i className="wb-row-bar" style={{ background: STATUS.OVERDUE.hex }} />
              <div className="wb-row-main">
                <span className="wb-row-title">{item.title}</span>
                <span className="wb-row-sub">
                  {item.code} · {item.departmentName}
                </span>
              </div>
              <div className="wb-row-reason">{item.reason}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function Wallboard() {
  const navigate = useNavigate();
  const wall = useApi<Wall>('/ioc/wallboard', { refetchInterval: 120_000 });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [full, setFull] = useState(false);
  const data = wall.data;
  const slides = useMemo(() => {
    if (!data) return [];
    const list: ({ key: string; node: 'stalled' } | { key: string; node: Slide })[] = data.slides.filter(slide => slide.targets.length).map(slide => ({ key: `${slide.type}-${slide.id}`, node: slide }));
    if (data.stalled.length) list.push({ key: 'stalled', node: 'stalled' });
    return list;
  }, [data]);
  const total = slides.length;
  const current = slides[index % Math.max(1, total)];

  const go = useCallback((delta: number) => setIndex(value => (total ? (value + delta + total) % total : 0)), [total]);

  useEffect(() => {
    if (paused || total < 2) return;
    const timer = window.setTimeout(() => go(1), (data?.rotateSeconds ?? 20) * 1000);
    return () => window.clearTimeout(timer);
  }, [index, paused, total, data?.rotateSeconds, go]);

  useEffect(() => {
    document.title = `Trình chiếu · ${data?.locality.brandName ?? 'IOC'}`;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === ' ') {
        event.preventDefault();
        setPaused(value => !value);
      }
      if (event.key.toLowerCase() === 'f') void toggleFull();
    };
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, [go, data?.locality.brandName]);

  async function toggleFull() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else await document.documentElement.requestFullscreen().catch(() => undefined);
  }

  if (wall.error && !data) return <LoadError error={wall.error} retry={() => void wall.refetch()} />;
  if (!data)
    return (
      <div className="wb wb-loading">
        <Spin size="large" />
      </div>
    );

  return (
    <div className="wb">
      <header className="wb-top">
        <div className="wb-brand">
          <span className="wb-mark">{localityInitials(data.locality)}</span>
          <div>
            <strong>{data.locality.brandName}</strong>
            <span>
              {data.locality.agencyName} · Năm {data.year}
            </span>
          </div>
        </div>
        <div className="wb-dots">
          {slides.map((slide, position) => (
            <button key={slide.key} type="button" className={position === index % total ? 'on' : ''} onClick={() => setIndex(position)} aria-label={`Trang ${position + 1}`} />
          ))}
        </div>
        <Clock />
      </header>

      <main className="wb-stage" key={current?.key}>
        {!current ? (
          <div className="wb-empty">Chưa có dữ liệu trình chiếu</div>
        ) : current.node === 'stalled' ? (
          <StalledSlide items={data.stalled} />
        ) : current.node.type === 'framework' ? (
          <FrameworkSlide slide={current.node} />
        ) : (
          <DepartmentSlide slide={current.node} />
        )}
      </main>

      <footer className="wb-bottom">
        <span>
          Số liệu lúc {vn(data.generatedAt).format('HH:mm DD/MM/YYYY')} · Trang {total ? (index % total) + 1 : 0}/{total}
        </span>
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
      {!paused && total > 1 && <div className="wb-timer" key={`t-${index}`} style={{ animationDuration: `${data.rotateSeconds}s` }} />}
    </div>
  );
}
