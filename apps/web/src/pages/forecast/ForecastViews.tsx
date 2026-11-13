import { Card, Skeleton, Tag, Tooltip, Typography, type TableColumnsType } from 'antd';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useThemeMode } from '@/app/theme';
import { Chart, chartColors, type ChartOption } from '@/components/Chart';
import { LoadError, NoData } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { query } from '@/lib/api';
import { date, num } from '@/lib/format';
import type { ReadScope } from '@/components/ReadScope';
import type { Forecast, ForecastList } from './types';
import './forecast.css';

export const RISK = { LOW: { label: 'Thấp', color: 'green' }, MEDIUM: { label: 'Trung bình', color: 'gold' }, HIGH: { label: 'Cao', color: 'red' } };
export function ForecastRiskTag({ item }: { item?: Pick<Forecast, 'risk' | 'probability'> }) {
  if (!item) return <span className="muted">—</span>;
  return <Tag color={RISK[item.risk].color}>{RISK[item.risk].label} · {num(item.probability * 100)}%</Tag>;
}

function ForecastChart({ data }: { data: Forecast }) {
  const { dark } = useThemeMode();
  const option = useMemo<ChartOption>(() => {
    const colors = chartColors(dark);
    return {
      grid: { left: 12, right: 16, top: 45, bottom: 12, containLabel: true },
      legend: { data: ['Thực hiện', 'Dự báo', 'Khoảng tin cậy'], textStyle: { color: colors.sub }, top: 0 },
      tooltip: { trigger: 'axis', valueFormatter: (value: number | null) => value == null ? '—' : num(value) },
      xAxis: { type: 'time', axisLabel: { color: colors.sub, hideOverlap: true, formatter: (value: number) => date(new Date(value).toISOString()) }, axisLine: { lineStyle: { color: colors.line } } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: colors.sub }, splitLine: { lineStyle: { color: colors.line } } },
      series: [
        { name: 'Cận dưới', type: 'line', stack: 'confidence', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, tooltip: { show: false }, data: data.series.map(point => [point.date, point.lower]) },
        { name: 'Khoảng tin cậy', type: 'line', stack: 'confidence', symbol: 'none', lineStyle: { opacity: 0 }, areaStyle: { color: '#5b8ff9', opacity: 0.16 }, tooltip: { show: false }, data: data.series.map(point => [point.date, point.lower == null || point.upper == null ? null : point.upper - point.lower]) },
        { name: 'Thực hiện', type: 'line', symbolSize: 5, lineStyle: { width: 3 }, itemStyle: { color: '#1677ff' }, data: data.series.map(point => [point.date, point.actual]) },
        { name: 'Dự báo', type: 'line', symbolSize: 5, lineStyle: { type: 'dashed', width: 2 }, itemStyle: { color: '#d89614' }, data: data.series.map(point => [point.date, point.predicted]), markLine: { symbol: 'none', label: { formatter: 'Mức giao', position: 'insideEndTop', color: colors.sub }, lineStyle: { color: '#8c8c8c', type: 'dotted' }, data: [{ yAxis: data.targetValue }] } },
      ],
    };
  }, [data, dark]);
  return <div role="img" aria-label={`Biểu đồ thực hiện và dự báo cuối kỳ ${num(data.projectedValue)} ${data.unit}`}><Chart option={option} height={280} /></div>;
}

export function ForecastCard({ targetId }: { targetId: string }) {
  const forecast = useApi<Forecast>(`/forecast/targets/${targetId}`);
  const data = forecast.data;
  return <Card title="Dự báo" className="forecast-card">
    {forecast.error ? <LoadError error={forecast.error} retry={() => void forecast.refetch()} /> : !data ? <Skeleton active paragraph={{ rows: 3 }} /> : data.applicable === false ? <NoData text={data.reason || 'Chỉ tiêu không thuộc kỳ dự báo'} /> : <>
      <div className="forecast-figures">
        <div><span className="muted">Xác suất không đạt đúng hạn</span><strong>{num(data.probability * 100)}%</strong><ForecastRiskTag item={data} /></div>
        <div><span className="muted">Giá trị dự báo cuối kỳ</span><strong>{num(data.projectedValue)} <small>{data.unit}</small></strong><span>Mức giao {num(data.targetValue)} {data.unit}</span></div>
        <div><span className="muted">Khoảng tin cậy</span><strong>{data.interval ? `${num(data.interval.lower)} – ${num(data.interval.upper)}` : 'Chưa đủ kỳ'}</strong><span>Hạn {date(data.dueDate)}</span></div>
      </div>
      {data.factors.length > 0 && <ul className="forecast-factors">{data.factors.map(factor => <li key={factor}>{factor}</li>)}</ul>}
      <ForecastChart data={data} />
      <Typography.Paragraph type="secondary" className="forecast-source">{data.sourceLabel}</Typography.Paragraph>
    </>}
  </Card>;
}

export function ForecastTop({ year, scope }: { year: number; scope: ReadScope }) {
  const forecast = useApi<ForecastList>(`/forecast${query({ year, scope })}`, { staleTime: 60_000 });
  const rows = [...(forecast.data?.items ?? [])].sort((a, b) => b.probability - a.probability).slice(0, 5);
  return <Card title="Dự báo nguy cơ" className="forecast-card">
    {forecast.error ? <LoadError error={forecast.error} retry={() => void forecast.refetch()} /> : forecast.isLoading ? <Skeleton active paragraph={{ rows: 3 }} /> : !rows.length ? <NoData text="Không có chỉ tiêu còn hạn trong phạm vi này" /> : <div className="forecast-top">{rows.map(item => <div key={item.targetId} className="forecast-top-row"><div><Link to={`/admin/targets/${item.targetId}`}>{item.title}</Link><span className="muted">{item.departmentName}</span><span>{item.factors[0]}</span></div><ForecastRiskTag item={item} /></div>)}</div>}
    {forecast.data && <Typography.Paragraph type="secondary" className="forecast-source">{forecast.data.model.sourceLabel}</Typography.Paragraph>}
  </Card>;
}

export function forecastColumns(): TableColumnsType<Forecast> {
  return [
    { title: 'Chỉ tiêu', key: 'title', render: (_, item) => <div className="cell-title"><Link to={`/admin/targets/${item.targetId}`}>{item.title}</Link><span>{item.departmentName}</span></div> },
    { title: 'Nguy cơ (dự báo)', key: 'risk', width: 180, sorter: (a, b) => a.probability - b.probability, defaultSortOrder: 'descend', render: (_, item) => <ForecastRiskTag item={item} /> },
    { title: 'Mức giao', dataIndex: 'targetValue', width: 130, align: 'right', render: (value, item) => `${num(value)} ${item.unit}` },
    { title: 'Dự báo cuối kỳ', dataIndex: 'projectedValue', width: 145, align: 'right', render: (value, item) => <Tooltip title={item.interval ? `Khoảng tin cậy: ${num(item.interval.lower)} – ${num(item.interval.upper)}` : 'Chưa đủ kỳ để tính khoảng tin cậy'}>{num(value)} {item.unit}</Tooltip> },
    { title: 'Hạn', dataIndex: 'dueDate', width: 112, render: value => date(value) },
  ];
}

export function ForecastWall({ items, sourceLabel }: { items: Forecast[]; sourceLabel?: string }) {
  const rows = [...items].sort((a, b) => b.probability - a.probability).slice(0, 5);
  return <section className="wb-forecast"><h2>Dự báo nguy cơ</h2><p>Xác suất không đạt mức giao đúng hạn</p>{!rows.length ? <p>Không có chỉ tiêu còn hạn trong phạm vi này</p> : rows.map(item => <div className="wb-forecast-row" key={item.targetId}><div><strong>{item.title}</strong><span>{item.departmentName} · {item.factors[0]}</span></div><div><b>{num(item.probability * 100)}%</b><span>{RISK[item.risk].label}</span></div><div><b>{num(item.projectedValue)} {item.unit}</b><span>Dự báo / Mức giao {num(item.targetValue)}</span></div></div>)}<p className="wb-forecast-source">{sourceLabel}</p></section>;
}
