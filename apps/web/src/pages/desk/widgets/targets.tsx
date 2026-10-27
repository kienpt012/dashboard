import { AimOutlined, CheckCircleOutlined, EyeOutlined, LineChartOutlined, LockOutlined, SettingOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Progress, Tooltip } from 'antd';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useThemeMode } from '@/app/theme';
import { Chart, chartColors, type ChartOption } from '@/components/Chart';
import { STATUS } from '@/components/Tags';
import { useApi } from '@/hooks/useApi';
import { errorText } from '@/lib/api';
import { date, num, pct, until } from '@/lib/format';
import { WidgetSkeleton } from '../WidgetFrame';
import { deskApi } from '../api';
import type { SeriesTarget, WatchMode, WatchTarget } from '../types';
import { useSettings, useWidget } from './context';
import { seriesTable, shortPeriod } from './logic';
import { MoreLink, Note } from './parts';
import { statusOf } from './useDepartmentData';

// Widget chỉ tiêu: thẻ một chỉ tiêu (số lớn, kế hoạch, vòng tiến độ, xu hướng), danh sách theo dõi (chọn tay hoặc tự
// động), biểu đồ nhiều chỉ tiêu theo kỳ. Quyền xem theo phạm vi của người dùng như danh mục chỉ tiêu.

const PALETTE = ['#2f6fed', '#0f9d8a', '#e08a00', '#b4529f', '#5b6ee1', '#c2410c'];

function ChooseTargets({ text }: { text: string }) {
  const { openSettings, editing } = useWidget();
  return (
    <Note
      icon={<AimOutlined />}
      action={
        <Button size="small" icon={<SettingOutlined />} onClick={openSettings}>
          {editing ? 'Cài đặt' : 'Chọn chỉ tiêu'}
        </Button>
      }
    >
      {text}
    </Note>
  );
}

function QueryNote({ error, retry }: { error: unknown; retry: () => void }) {
  if (statusOf(error) === 403) return <Note icon={<LockOutlined />}>Bạn không xem được chỉ tiêu này</Note>;
  return (
    <Note
      icon={<WarningOutlined />}
      tone="warn"
      action={
        <Button size="small" onClick={retry}>
          Thử lại
        </Button>
      }
    >
      {errorText(error, 'Không tải được số liệu chỉ tiêu')}
    </Note>
  );
}

function planText(target: { kind: string; unit: string; targetValue: number; targetText: string | null }) {
  if (target.kind === 'STAT') return 'Chỉ tiêu thống kê';
  return `Kế hoạch ${target.targetText || `${num(target.targetValue)} ${target.unit}`}`;
}

/* ───────────── Thẻ chỉ tiêu ───────────── */

export function TargetKpi() {
  const { targetId, showTrend = true } = useSettings<{ targetId: string | null; showTrend: boolean }>();
  const { year, refreshMs, maximized } = useWidget();
  const { dark } = useThemeMode();
  const query = useApi<{ targets: SeriesTarget[] }>(targetId ? deskApi.seriesPath([targetId], year) : null, { refetchInterval: refreshMs });
  const target = query.data?.targets[0];
  const trend = useMemo<ChartOption | null>(() => {
    if (!target || target.points.length < 2) return null;
    const color = STATUS[target.status]?.hex ?? '#2f6fed';
    return {
      grid: { left: 2, right: 2, top: 6, bottom: 2 },
      xAxis: { type: 'category', show: false, data: target.points.map(point => point.label), boundaryGap: false },
      yAxis: { type: 'value', show: false, scale: true },
      tooltip: { trigger: 'axis', formatter: (items: { name: string; value: number }[]) => `${items[0].name}: <b>${num(items[0].value)}</b> ${target.unit}` },
      series: [
        {
          type: 'line',
          data: target.points.map(point => point.value),
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color },
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${color}55` }, { offset: 1, color: `${color}00` }] } },
        },
      ],
    };
  }, [target]);

  if (!targetId) return <ChooseTargets text="Chọn một chỉ tiêu để theo dõi" />;
  if (!query.data) return query.isError ? <QueryNote error={query.error} retry={() => void query.refetch()} /> : <WidgetSkeleton />;
  if (!target) return <Note icon={<LockOutlined />}>Chỉ tiêu không còn hoặc bạn không xem được</Note>;
  const meta = STATUS[target.status];
  const progress = Math.max(0, Math.min(100, target.progress));
  return (
    <Link to={`/admin/targets/${target.id}`} className={`dws-kpi${maximized ? ' large' : ''}`} title={`${target.code} · ${target.title}`}>
      <span className="dws-kpi-title">
        <span className="dws-kpi-code">{target.code}</span>
        <span className="clamp-2">{target.title}</span>
      </span>
      <span className="dws-kpi-main">
        <span className="dws-kpi-value">
          <strong>{num(target.currentValue)}</strong>
          <span>{target.unit}</span>
        </span>
        {target.kind !== 'STAT' && (
          <Progress
            type="circle"
            percent={progress}
            size={maximized ? 92 : 56}
            strokeWidth={9}
            strokeColor={meta?.hex}
            railColor={chartColors(dark).line}
            format={() => pct(target.progress)}
          />
        )}
      </span>
      <span className="dws-kpi-foot">
        <span className="dws-kpi-status" style={{ color: meta?.hex }}>
          <i style={{ background: meta?.hex }} />
          {meta?.label}
        </span>
        <span className="wr-meta">{planText(target)}</span>
      </span>
      {showTrend && trend && (
        <span className="dws-kpi-trend">
          <Chart option={trend} style={{ height: '100%' }} />
        </span>
      )}
    </Link>
  );
}

/* ───────────── Chỉ tiêu theo dõi ───────────── */

const MODE_EMPTY: Record<WatchMode, string> = {
  manual: 'Chưa chọn chỉ tiêu',
  mine: 'Bạn chưa phụ trách chỉ tiêu nào năm nay',
  risk: 'Không có chỉ tiêu đang chậm',
  overdue: 'Không có chỉ tiêu quá hạn',
};

export function TargetWatchlist() {
  const { mode = 'mine', targetIds = [], maxItems = 8 } = useSettings<{ mode: WatchMode; targetIds: string[]; maxItems: number }>();
  const { departmentId, year, refreshMs, maximized } = useWidget();
  const take = maximized ? 20 : maxItems;
  const path = mode === 'manual' ? (targetIds.length ? deskApi.targetsByIdsPath(targetIds) : null) : deskApi.watchPath(mode, departmentId, year, take);
  const query = useApi<WatchTarget[]>(path, { refetchInterval: refreshMs, keepPrevious: true });

  if (mode === 'manual' && !targetIds.length) return <ChooseTargets text="Chọn các chỉ tiêu muốn theo dõi" />;
  if (!query.data) return query.isError ? <QueryNote error={query.error} retry={() => void query.refetch()} /> : <WidgetSkeleton />;
  const list = query.data.slice(0, take);
  if (!list.length) return <Note icon={mode === 'risk' || mode === 'overdue' ? <CheckCircleOutlined /> : <EyeOutlined />} tone={mode === 'risk' || mode === 'overdue' ? 'ok' : undefined}>{MODE_EMPTY[mode]}</Note>;
  return (
    <div className="wl">
      {list.map(target => {
        const meta = STATUS[target.status];
        const due = target.kind !== 'STAT' && target.status !== 'COMPLETED' ? target.dueDate : null;
        return (
          <Link key={target.id} to={`/admin/targets/${target.id}`} className="dws-watch">
            <span className="dws-watch-head">
              <span className="wr-title" title={`${target.code} · ${target.title}`}>
                {target.title}
              </span>
              <Tooltip title={meta?.label}>
                <span className="dws-watch-pct" style={{ color: meta?.hex }}>
                  {target.kind === 'STAT' ? num(target.currentValue) : pct(target.progress)}
                </span>
              </Tooltip>
            </span>
            {target.kind !== 'STAT' && (
              <span className="dws-watch-bar" aria-hidden>
                <i style={{ width: `${Math.max(2, Math.min(100, target.progress))}%`, background: meta?.hex }} />
              </span>
            )}
            <span className="wr-meta">
              {[target.code, target.kind === 'STAT' ? target.unit : `${num(target.currentValue)} / ${target.targetText || `${num(target.targetValue)} ${target.unit}`}`, mode !== 'mine' ? target.assigneeName : null, due ? (target.status === 'OVERDUE' ? `hạn ${date(due)}` : until(due)) : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </Link>
        );
      })}
      {mode === 'mine' && <MoreLink to={`/admin/targets?assignee=me&year=${year}`}>Mở danh mục chỉ tiêu của tôi</MoreLink>}
    </div>
  );
}

/* ───────────── Biểu đồ chỉ tiêu ───────────── */

export function TargetChart() {
  const { targetIds = [], chartType = 'line', showPlan = true } = useSettings<{ targetIds: string[]; chartType: 'line' | 'bar' | 'area'; showPlan: boolean }>();
  const { year, refreshMs } = useWidget();
  const { dark } = useThemeMode();
  const query = useApi<{ targets: SeriesTarget[] }>(targetIds.length ? deskApi.seriesPath(targetIds, year) : null, { refetchInterval: refreshMs, keepPrevious: true });
  const targets = query.data?.targets;

  const option = useMemo<ChartOption | null>(() => {
    if (!targets?.length) return null;
    const table = seriesTable(targets);
    if (!table.keys.length) return null;
    const colors = chartColors(dark);
    const years = new Set(table.keys.map(key => key.slice(0, 4)));
    const unit = table.normalized ? '%' : targets[0].unit.trim();
    const many = table.rows.length > 1;
    return {
      color: PALETTE,
      grid: { left: 8, right: 12, top: many ? 34 : 16, bottom: 4, containLabel: true },
      legend: many ? { top: 0, left: 0, type: 'scroll', itemWidth: 12, itemHeight: 8, textStyle: { color: colors.sub, fontSize: 11 }, formatter: (name: string) => name.split(' · ')[0] } : undefined,
      tooltip: {
        trigger: 'axis',
        formatter: (items: { seriesIndex: number; dataIndex: number; marker: string; axisValueLabel: string }[]) =>
          [
            `<b>${items[0]?.axisValueLabel ?? ''}</b>`,
            ...items.map(item => {
              const row = table.rows[item.seriesIndex];
              const raw = row?.raw[item.dataIndex];
              if (!row || raw === null || raw === undefined) return '';
              return `${item.marker}${row.name.split(' · ')[0]}: <b>${num(raw)}</b> ${row.unit}${table.normalized ? ` (${num(row.values[item.dataIndex])}%)` : ''}`;
            }),
          ]
            .filter(Boolean)
            .join('<br/>'),
      },
      xAxis: {
        type: 'category',
        data: table.keys.map(key => shortPeriod(key, years.size > 1)),
        boundaryGap: chartType === 'bar',
        axisLine: { lineStyle: { color: colors.line } },
        axisTick: { show: false },
        axisLabel: { color: colors.sub, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: colors.line } },
        axisLabel: { color: colors.sub, fontSize: 11, formatter: (value: number) => (unit.length <= 2 ? `${num(value)}${unit}` : num(value)) },
      },
      series: table.rows.map((row, index) => ({
        name: row.name,
        type: chartType === 'bar' ? 'bar' : 'line',
        data: row.values,
        smooth: chartType !== 'bar',
        connectNulls: true,
        symbolSize: 6,
        barMaxWidth: 22,
        itemStyle: chartType === 'bar' ? { borderRadius: [4, 4, 0, 0] } : undefined,
        areaStyle: chartType === 'area' ? { opacity: 0.16 } : undefined,
        markLine:
          showPlan && row.plan !== null && (index === 0 || !table.normalized)
            ? {
                symbol: 'none',
                silent: true,
                lineStyle: { type: 'dashed', color: table.normalized ? colors.sub : PALETTE[index % PALETTE.length], opacity: 0.7 },
                label: { formatter: table.normalized ? 'Kế hoạch' : `KH ${num(row.plan)}`, color: colors.sub, fontSize: 10, position: 'insideEndTop' },
                data: [{ yAxis: row.plan }],
              }
            : undefined,
      })),
    };
  }, [targets, chartType, showPlan, dark]);

  if (!targetIds.length) return <ChooseTargets text="Chọn một đến sáu chỉ tiêu để vẽ biểu đồ" />;
  if (!query.data) return query.isError ? <QueryNote error={query.error} retry={() => void query.refetch()} /> : <WidgetSkeleton />;
  if (!targets?.length) return <Note icon={<LockOutlined />}>Các chỉ tiêu đã chọn không còn hoặc bạn không xem được</Note>;
  if (!option) return <Note icon={<LineChartOutlined />}>Các chỉ tiêu đã chọn chưa có số liệu theo kỳ được duyệt</Note>;
  const normalized = new Set(targets.map(target => target.unit.trim().toLocaleLowerCase('vi'))).size > 1;
  const unit = targets[0].unit.trim();
  return (
    <div className="dws-chart">
      <Chart option={option} style={{ height: '100%' }} />
      <span className="wr-meta">
        {normalized ? 'Các chỉ tiêu khác đơn vị nên quy về % kế hoạch' : unit.length > 2 ? `Đơn vị: ${unit}` : null}
        {targets.length < targetIds.length ? `${normalized || unit.length > 2 ? ' · ' : ''}${num(targetIds.length - targets.length)} chỉ tiêu không còn hoặc bạn không xem được` : null}
      </span>
    </div>
  );
}
