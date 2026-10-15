import { FileExcelOutlined, PrinterOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, Empty, Flex, Row, Select, Table, Tooltip, Typography, type TableColumnsType } from 'antd';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { localityTitle, useLocality } from '@/app/locality';
import { useMe } from '@/app/session';
import { Chart, chartColors, type ChartOption } from '@/components/Chart';
import { Metric, ProgressCell, YearSelect } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { PrintDocument } from '@/components/PrintDocument';
import { LoadError } from '@/components/States';
import { StatusTag, STATUS, STATUS_ORDER } from '@/components/Tags';
import { useThemeMode } from '@/app/theme';
import { useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments, useFrameworks } from '@/hooks/useRefs';
import { errorText, http, query, saveBlob } from '@/lib/api';
import { fromNow, currentYear, dateTime, num, pct, vn } from '@/lib/format';
import { isGlobal } from '@/lib/roles';
import type { Target } from '@/types/core';
import type { TargetStatusKey } from '@/types/domain';
import { byDate, byNumber, byRank, byText, NUMBER_FIRST, TARGET_STATUS_RANK } from '@/lib/sort';

function planText(target: Target) {
  if (target.kind === 'STAT') return '—';
  return target.targetText || num(target.targetValue);
}

function statusText(target: Target) {
  if (target.kind === 'STAT') return target.lastReportedAt ? 'Đã có số liệu' : 'Chưa có số liệu';
  return STATUS[target.status as TargetStatusKey]?.label ?? target.status;
}

function groups(rows: Target[]) {
  const result: { name: string | null; rows: Target[] }[] = [];
  for (const row of rows) {
    const name = row.groupName ?? null;
    const last = result[result.length - 1];
    if (last && last.name === name) last.rows.push(row);
    else result.push({ name, rows: [row] });
  }
  return result;
}

function ReportPrint({ rows, title, scope, at }: { rows: Target[]; title: string; scope: string; at: Date }) {
  const sections = groups(rows);
  const statOnly = rows.every(row => row.kind === 'STAT');
  const span = statOnly ? 6 : 8;
  // Dòng tổng cộng đếm chỉ tiêu lá (như màn hình và tệp Excel); bảng vẫn liệt kê đủ chỉ tiêu cha để giữ cấu trúc văn bản.
  const leaves = rows.filter(row => !rows.some(other => other.parentId === row.id));
  const stats = leaves.filter(row => row.kind === 'STAT');
  const count = (status: TargetStatusKey) => leaves.filter(row => row.kind !== 'STAT' && row.status === status).length;
  let index = 0;
  return (
    <PrintDocument kind="PHỤ LỤC" title={title} subtitle={`(${scope}; số liệu đến ${vn(at).format('HH')} giờ ${vn(at).format('mm')} ngày ${vn(at).format('DD/MM/YYYY')})`} orientation="landscape">
      <table>
        <thead>
          <tr>
            <th className="w-stt">STT</th>
            <th className="w-title">Chỉ tiêu</th>
            <th className="w-unit">Đơn vị tính</th>
            {!statOnly && <th className="w-plan">Kế hoạch</th>}
            <th className="w-num">{statOnly ? 'Số liệu' : 'Thực hiện'}</th>
            {!statOnly && <th className="w-num">Tỷ lệ (%)</th>}
            <th className="w-eval">Đánh giá</th>
            <th className="w-dept">Phòng chủ trì</th>
          </tr>
        </thead>
        <tbody>
          {sections.map(section => (
            <Fragment key={section.name ?? 'none'}>
              {section.name && sections.length > 1 && (
                <tr className="group">
                  <td colSpan={span}>{section.name}</td>
                </tr>
              )}
              {section.rows.map(row => {
                index += 1;
                return (
                  <tr key={row.id}>
                    <td className="c">{row.ordinal || index}</td>
                    <td>{row.title}</td>
                    <td className="c">{row.unit}</td>
                    {!statOnly && <td className="c">{planText(row)}</td>}
                    <td className="c">{row.lastReportedAt ? num(row.currentValue) : '—'}</td>
                    {!statOnly && <td className="c">{row.kind === 'STAT' || !row.lastReportedAt ? '—' : num(Math.round(row.progress ?? 0))}</td>}
                    <td className="c">{statusText(row)}</td>
                    <td>{row.department.name}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
          <tr className="total">
            <td colSpan={span}>
              {statOnly ? `Tổng cộng: ${leaves.length} chỉ tiêu thống kê — đã có số liệu ${stats.filter(row => row.lastReportedAt).length}, chưa có số liệu ${stats.filter(row => !row.lastReportedAt).length}.` : <>Tổng cộng: {leaves.length} chỉ tiêu — Hoàn thành {count('COMPLETED')}; Đúng tiến độ {count('ON_TRACK')}; Có nguy cơ {count('AT_RISK')}; Quá hạn {count('OVERDUE')}; Chưa bắt đầu {count('NOT_STARTED')}
              {stats.length ? `; Thống kê có số liệu ${stats.filter(row => row.lastReportedAt).length}/${stats.length}` : ''}.</>}
            </td>
          </tr>
        </tbody>
      </table>
    </PrintDocument>
  );
}

export default function Reports() {
  const user = useMe();
  const { message } = App.useApp();
  const locality = useLocality();
  const { dark } = useThemeMode();
  const global = isGlobal(user);
  const [params, setParams] = useSearchParams();
  const year = Number(params.get('year')) || currentYear();
  const departmentId = params.get('departmentId') ?? '';
  const frameworks = useFrameworks();
  const yearFrameworks = useMemo(() => (frameworks.data ?? []).filter(item => (item.year ?? year) === year), [frameworks.data, year]);
  const frameworkId = params.get('frameworkId') ?? '';
  const departments = useDepartments();
  const [exporting, setExporting] = useState(false);
  const [printedAt, setPrintedAt] = useState(() => new Date());

  useEffect(() => {
    if (!frameworkId && yearFrameworks.length) {
      const next = new URLSearchParams(params);
      next.set('frameworkId', yearFrameworks[0].id);
      setParams(next, { replace: true });
    }
  }, [frameworkId, yearFrameworks, params, setParams]);

  const list = useApi<Target[]>(frameworkId ? `/targets${query({ year, frameworkId, departmentId: global ? departmentId || undefined : undefined })}` : null, { keepPrevious: true });
  // Báo cáo của một phòng chỉ gồm chỉ tiêu phòng chủ trì (máy chủ trả cả chỉ tiêu phòng phối hợp).
  const scopeDepartment = global ? departmentId : user.departmentId;
  const rows = useMemo(() => (list.data ?? []).filter(row => !scopeDepartment || row.department.id === scopeDepartment), [list.data, scopeDepartment]);
  const framework = yearFrameworks.find(item => item.id === frameworkId);
  const department = (departments.data ?? []).find(item => item.id === (global ? departmentId : user.departmentId));
  const scope = department ? department.name : locality.configured ? localityTitle(locality) : 'Toàn địa phương';
  const title = framework ? `Kết quả thực hiện ${framework.name.charAt(0).toLowerCase()}${framework.name.slice(1)}` : `Kết quả thực hiện các chỉ tiêu ngoài bộ năm ${year}`;

  function update(next: Record<string, string | null>) {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    setParams(copy, { replace: true });
  }

  const counts = useMemo(() => {
    const result: Record<TargetStatusKey, number> = { COMPLETED: 0, ON_TRACK: 0, AT_RISK: 0, OVERDUE: 0, NOT_STARTED: 0 };
    for (const row of rows) if (row.kind !== 'STAT' && !rows.some(other => other.parentId === row.id)) result[row.status as TargetStatusKey] += 1;
    return result;
  }, [rows]);
  // Cách tính khớp trang Bộ chỉ tiêu: đếm chỉ tiêu lá; tiến độ chung theo trọng số các chỉ tiêu cấp trên cùng.
  const leaves = rows.filter(row => !rows.some(other => other.parentId === row.id));
  const planned = leaves.filter(row => row.kind !== 'STAT');
  const stat = leaves.filter(row => row.kind === 'STAT');
  const top = rows.filter(row => row.kind !== 'STAT' && (!row.parentId || !rows.some(other => other.id === row.parentId)));
  const topWeight = top.reduce((sum, row) => sum + (row.weight || 1), 0);
  const avg = topWeight ? top.reduce((sum, row) => sum + Math.min(100, row.progress ?? 0) * (row.weight || 1), 0) / topWeight : null;
  const last = rows.reduce<string | null>((latest, row) => (row.lastReportedAt && (!latest || row.lastReportedAt > latest) ? row.lastReportedAt : latest), null);

  const byDepartment = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number; sum: number }>();
    for (const row of planned) {
      const entry = map.get(row.department.id) ?? { name: row.department.name, color: row.department.color, total: 0, sum: 0 };
      entry.total += 1;
      entry.sum += Math.min(100, row.progress ?? 0);
      map.set(row.department.id, entry);
    }
    return [...map.values()].map(entry => ({ ...entry, avg: Math.round(entry.sum / entry.total) })).sort((a, b) => a.avg - b.avg);
  }, [planned]);

  const chart = useMemo<ChartOption>(() => {
    const colors = chartColors(dark);
    return {
      grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (value: number) => `${value}%` },
      xAxis: { type: 'value', max: 100, axisLabel: { color: colors.sub, formatter: '{value}%' }, splitLine: { lineStyle: { color: colors.line } } },
      yAxis: { type: 'category', data: byDepartment.map(item => item.name), axisLabel: { color: colors.text, width: 180, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
      series: [
        {
          type: 'bar',
          barMaxWidth: 18,
          data: byDepartment.map(item => ({ value: item.avg, itemStyle: { color: item.color, borderRadius: [0, 4, 4, 0] } })),
          label: { show: true, position: 'right', formatter: '{c}%', color: colors.sub },
        },
      ],
    };
  }, [byDepartment, dark]);

  async function exportExcel() {
    setExporting(true);
    try {
      const blob = await http.blob(`/exports/targets.xlsx${query({ year, frameworkId, departmentId: global ? departmentId || undefined : undefined })}`);
      const parts = ['bao-cao', framework?.code ?? 'ngoai-bo', department?.code, String(year)].filter(Boolean);
      saveBlob(blob, `${parts.join('-')}.xlsx`.toLowerCase());
    } catch (error) {
      message.error(errorText(error, 'Không xuất được tệp Excel'));
    } finally {
      setExporting(false);
    }
  }

  const statOnly = rows.length > 0 && rows.every(row => row.kind === 'STAT');
  const order = new Map(rows.map((row, index) => [row.id, index + 1]));
  const allColumns: (TableColumnsType<Target>[number] & { hideForStat?: boolean })[] = [
    { title: 'STT', key: 'stt', width: 72, align: 'center', sorter: byNumber(row => order.get(row.id)), defaultSortOrder: 'ascend', render: (_, row) => <span className="muted">{row.ordinal || order.get(row.id)}</span> },
    {
      title: 'Chỉ tiêu',
      key: 'title',
      sorter: byText(row => row.title),
      render: (_, row) => (
        <div className="cell-title">
          <Link to={`/admin/targets/${row.id}`}>{row.title}</Link>
          <span>
            {row.code}
            {row.groupName ? ` · ${row.groupName}` : ''}
          </span>
        </div>
      ),
    },
    { title: 'ĐVT', dataIndex: 'unit', width: 110, sorter: byText(row => row.unit) },
    { title: 'Kế hoạch', key: 'plan', width: 130, align: 'right', hideForStat: true, sorter: byNumber(row => row.targetValue), sortDirections: NUMBER_FIRST, render: (_, row) => <span className="num">{planText(row)}</span> },
    { title: statOnly ? 'Số liệu' : 'Thực hiện', key: 'current', width: 120, align: 'right', sorter: byNumber(row => (row.lastReportedAt ? row.currentValue : null)), sortDirections: NUMBER_FIRST, render: (_, row) => (row.lastReportedAt ? <span className="num">{num(row.currentValue)}</span> : <span className="muted">—</span>) },
    { title: 'Tỷ lệ', key: 'progress', width: 150, hideForStat: true, sorter: byNumber(row => (row.kind === 'STAT' ? null : row.progress)), sortDirections: NUMBER_FIRST, render: (_, row) => (row.kind === 'STAT' ? <span className="muted">—</span> : <ProgressCell value={row.progress ?? 0} status={row.status} />) },
    { title: 'Đánh giá', key: 'status', width: 130, sorter: byRank(TARGET_STATUS_RANK, row => row.status), render: (_, row) => (row.kind === 'STAT' ? <span className={row.lastReportedAt ? 'tone-ok' : 'muted'}>{statusText(row)}</span> : <StatusTag status={row.status} />) },
    { title: 'Phòng chủ trì', key: 'dept', width: 200, sorter: byText(row => row.department.name), render: (_, row) => row.department.name },
    {
      title: 'Cập nhật',
      key: 'updated',
      width: 128,
      sorter: byDate(row => row.lastReportedAt),
      render: (_, row) => (row.lastReportedAt ? <Tooltip title={dateTime(row.lastReportedAt)}>{fromNow(row.lastReportedAt)}</Tooltip> : <span className="muted">Chưa báo cáo</span>),
    },
  ];
  const columns = allColumns.filter(column => !(statOnly && column.hideForStat)).map(({ hideForStat: _hide, ...column }) => column) as TableColumnsType<Target>;

  return (
    <Page
      title={global ? 'Báo cáo tổng hợp' : 'Báo cáo của phòng'}
      meta={last && <span>Số liệu cập nhật gần nhất {dateTime(last)}</span>}
      extra={
        <>
          <Button icon={<FileExcelOutlined />} loading={exporting} onClick={() => void exportExcel()}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PrinterOutlined />}
            disabled={!rows.length}
            onClick={() => {
              setPrintedAt(new Date());
              window.setTimeout(() => window.print(), 50);
            }}
          >
            In báo cáo
          </Button>
        </>
      }
      wide
    >
      <Card className="card-flush" style={{ marginBottom: 16 }}>
        <div className="table-filters">
          <FilterBar
            active={departmentId ? 1 : 0}
            filters={
              <>
                <YearSelect value={year} onChange={value => update({ year: String(value), frameworkId: null })} />
                <Select
                  value={frameworkId || undefined}
                  placeholder="Bộ chỉ tiêu"
                  onChange={value => update({ frameworkId: value })}
                  options={[...yearFrameworks.map(item => ({ value: item.id, label: item.name })), { value: 'none', label: 'Chỉ tiêu ngoài bộ' }]}
                  style={{ width: 480, maxWidth: '100%' }}
                  popupMatchSelectWidth={false}
                />
                {global && (
                  <Select allowClear placeholder="Toàn địa phương" value={departmentId || undefined} onChange={value => update({ departmentId: value ?? null })} options={departmentOptions(departments.data, false)} style={{ width: 230 }} popupMatchSelectWidth={false} />
                )}
              </>
            }
          />
        </div>
        <div className="metric-grid metric-grid-5" style={{ borderTop: 0 }}>
          {planned.length === 0 && stat.length > 0 ? (
            // Bộ thống kê không có mục tiêu: chỉ theo dõi đã có số liệu hay chưa.
            <>
              <Metric label="Chỉ tiêu thống kê" value={num(stat.length)} />
              <Metric label="Đã có số liệu" value={num(stat.filter(row => row.lastReportedAt).length)} tone="ok" foot={pct((stat.filter(row => row.lastReportedAt).length / stat.length) * 100)} />
              <Metric label="Chưa có số liệu" value={num(stat.filter(row => !row.lastReportedAt).length)} tone={stat.some(row => !row.lastReportedAt) ? 'warn' : undefined} />
              <Metric label="Phòng chủ trì" value={num(new Set(stat.map(row => row.department.id)).size)} />
              <Metric label="Cập nhật gần nhất" value={last ? fromNow(last) : '—'} foot={last ? dateTime(last) : undefined} />
            </>
          ) : (
            <>
              <Metric label="Chỉ tiêu" value={num(leaves.length)} foot={stat.length ? `${num(stat.length)} chỉ tiêu thống kê` : undefined} />
              <Metric label="Tiến độ chung" value={avg === null ? '—' : pct(avg)} />
              <Metric label="Hoàn thành" value={num(counts.COMPLETED)} tone="ok" />
              <Metric label="Có nguy cơ / quá hạn" value={`${num(counts.AT_RISK)} / ${num(counts.OVERDUE)}`} tone={counts.AT_RISK || counts.OVERDUE ? 'warn' : undefined} />
              <Metric
                label={stat.length ? 'Thống kê có số liệu' : 'Chưa có số liệu'}
                value={stat.length ? `${num(stat.filter(row => row.lastReportedAt).length)} / ${num(stat.length)}` : num(planned.filter(row => !row.lastReportedAt).length)}
              />
            </>
          )}
        </div>
      </Card>

      {list.error && !list.data ? (
        <LoadError error={list.error} retry={() => void list.refetch()} />
      ) : !frameworkId && !frameworks.isLoading ? (
        <Card>
          <Empty description={`Chưa có bộ chỉ tiêu năm ${year}`} />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} xxl={byDepartment.length > 1 ? 17 : 24}>
            <Card className="card-flush" title={<Typography.Text strong>{title}</Typography.Text>}>
              <Table
                rowKey="id"
                size="middle"
                loading={list.isLoading || list.isFetching}
                dataSource={rows}
                columns={columns}
                scroll={{ x: 1000 }}
                pagination={{ defaultPageSize: 50, showSizeChanger: true, pageSizeOptions: [50, 100, 200], showTotal: total => `${num(total)} chỉ tiêu` }}
              />
            </Card>
          </Col>
          {byDepartment.length > 1 && (
            <Col xs={24} xxl={7}>
              <Card title="Tiến độ bình quân theo phòng">
                <Chart option={chart} height={Math.max(180, byDepartment.length * 40)} />
                <Flex wrap gap={8} style={{ marginTop: 12 }} className="legend">
                  {STATUS_ORDER.map(key => (
                    <span key={key}>
                      <i style={{ background: STATUS[key].hex }} />
                      {STATUS[key].label} {num(counts[key])}
                    </span>
                  ))}
                </Flex>
              </Card>
            </Col>
          )}
        </Row>
      )}
      {rows.length > 0 && <ReportPrint rows={rows} title={title} scope={scope} at={printedAt} />}
    </Page>
  );
}
