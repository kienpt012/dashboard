import { Card, Flex, Segmented, Table } from 'antd';
import { useMemo, useState } from 'react';
import { useThemeMode } from '@/app/theme';
import { Chart, chartColors, type ChartOption } from '@/components/Chart';
import { Query } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { query } from '@/lib/api';
import { num, pct } from '@/lib/format';
import { ExcelButton } from './shared';
import type { DirectiveFilters, DirectiveStatistics as StatisticsData } from './types';

export function DirectiveStatistics({ filters }: { filters: DirectiveFilters }) {
  const { dark } = useThemeMode();
  const [group, setGroup] = useState<'byDocument' | 'byDepartment' | 'byKind' | 'byMonth'>('byDocument');
  const suffix = query(filters);
  const data = useApi<StatisticsData>(`/directives/statistics${suffix}`, { keepPrevious: true });
  const departmentChart = useMemo<ChartOption>(() => {
    const colors = chartColors(dark);
    const rows = data.data?.byDepartment ?? [];
    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: colors.text } },
      grid: { left: 8, right: 16, top: 12, bottom: 50, containLabel: true },
      xAxis: { type: 'category', data: rows.map(item => item.name), axisLabel: { color: colors.sub, width: 90, overflow: 'break', interval: 0 }, axisLine: { lineStyle: { color: colors.line } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: colors.sub }, splitLine: { lineStyle: { color: colors.line } } },
      series: [
        { key: 'completedOnTime', name: 'Đúng hạn', color: '#389e0d' }, { key: 'completedLate', name: 'Hoàn thành trễ', color: '#d4b106' },
        { key: 'inProgress', name: 'Đang thực hiện', color: '#1677ff' }, { key: 'overdue', name: 'Quá hạn', color: '#cf1322' }, { key: 'notStarted', name: 'Chưa bắt đầu', color: '#8c96a4' },
      ].map(item => ({ type: 'bar', name: item.name, stack: 'total', barMaxWidth: 48, itemStyle: { color: item.color }, data: rows.map(row => row[item.key as 'completedOnTime']) })),
    };
  }, [data.data, dark]);
  const monthChart = useMemo<ChartOption>(() => {
    const colors = chartColors(dark);
    const rows = data.data?.byMonth ?? [];
    return {
      tooltip: { trigger: 'axis' }, legend: { bottom: 0, textStyle: { color: colors.text } },
      grid: { left: 8, right: 16, top: 12, bottom: 50, containLabel: true },
      xAxis: { type: 'category', data: rows.map(item => item.name), axisLabel: { color: colors.sub }, axisLine: { lineStyle: { color: colors.line } } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { color: colors.sub }, splitLine: { lineStyle: { color: colors.line } } },
      series: [
        { name: 'Số giao', type: 'line', data: rows.map(item => item.total), itemStyle: { color: '#1677ff' } },
        { name: 'Hoàn thành', type: 'line', data: rows.map(item => item.completedOnTime + item.completedLate), itemStyle: { color: '#389e0d' } },
        { name: 'Quá hạn', type: 'line', data: rows.map(item => item.overdue), itemStyle: { color: '#cf1322' } },
      ],
    };
  }, [data.data, dark]);
  return <Query query={data}>{result => <Flex vertical gap={16}>
    <Flex justify="space-between" gap={12} wrap align="center">
      <Segmented<'byDocument' | 'byDepartment' | 'byKind' | 'byMonth'> value={group} onChange={value => setGroup(value)} options={[{ value: 'byDocument', label: 'Văn bản' }, { value: 'byDepartment', label: 'Phòng' }, { value: 'byKind', label: 'Loại' }, { value: 'byMonth', label: 'Tháng' }]} />
      <ExcelButton path={`/directives/statistics.xlsx${suffix}`} filename={`thong-ke-van-ban-chi-dao-${filters.year ?? 'tat-ca'}.xlsx`} />
    </Flex>
    <Card className="card-flush"><Table rowKey="id" dataSource={result[group]} scroll={{ x: 1100 }} sticky pagination={{ defaultPageSize: 20, showSizeChanger: true }} columns={[
      { title: { byDocument: 'Văn bản', byDepartment: 'Phòng chủ trì', byKind: 'Loại văn bản', byMonth: 'Tháng đến hạn' }[group], dataIndex: 'name', width: 300, render: value => <span className="directive-stat-title">{value}</span> },
      { title: 'Số giao', dataIndex: 'total', align: 'right', width: 85, render: value => num(value) },
      { title: 'Hoàn thành đúng hạn', dataIndex: 'completedOnTime', align: 'right', width: 125, render: value => <span className="tone-ok">{num(value)}</span> },
      { title: 'Hoàn thành trễ', dataIndex: 'completedLate', align: 'right', width: 115, render: value => num(value) },
      { title: 'Đang thực hiện', dataIndex: 'inProgress', align: 'right', width: 115, render: value => num(value) },
      { title: 'Chưa bắt đầu', dataIndex: 'notStarted', align: 'right', width: 105, render: value => num(value) },
      { title: 'Quá hạn', dataIndex: 'overdue', align: 'right', width: 90, render: value => <span className={value ? 'tone-bad' : ''}>{num(value)}</span> },
      { title: 'Tỷ lệ hoàn thành', dataIndex: 'completionRate', align: 'right', width: 120, render: value => pct(value) },
      { title: 'Ngày trễ bình quân', dataIndex: 'averageLateDays', align: 'right', width: 125, render: value => num(value) },
    ]} /></Card>
    <div className="directive-chart-grid">
      <Card title="Kết quả theo phòng"><Chart option={departmentChart} height={360} /></Card>
      <Card title="Kết quả theo tháng đến hạn"><Chart option={monthChart} height={360} /></Card>
    </div>
  </Flex>}</Query>;
}
