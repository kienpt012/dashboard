import {
  CloudUploadOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { App, Badge, Button, Card, Descriptions, Dropdown, Input, Segmented, Select, Space, Table, Tag, Tooltip, type MenuProps, type TableColumnsType } from 'antd';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMe } from '@/app/session';
import { ProgressCell, TitleCell, YearSelect } from '@/components/Data';
import { FilterBar, Page } from '@/components/Page';
import { ReasonModal } from '@/components/ReasonModal';
import { LoadError } from '@/components/States';
import { DeptTag, KindTag, StatusTag, STATUS, STATUS_ORDER } from '@/components/Tags';
import { useAction, useApi } from '@/hooks/useApi';
import { departmentOptions, frameworkOptions, useDepartments, useFrameworks } from '@/hooks/useRefs';
import { errorText, http, query, saveBlob } from '@/lib/api';
import { currentYear, date, dateTime, fromNow, num } from '@/lib/format';
import { frequencyLabel, periodLabel } from '@/lib/periods';
import { can, IMPORTERS, isGlobal, LEADERSHIP, REPORTERS } from '@/lib/roles';
import type { Target } from '@/types/core';
import type { FrameworkKind, TargetStatusKey } from '@/types/domain';
import { KIND_OPTIONS, TargetForm } from './TargetForm';

const ISSUING: Record<string, string> = { CENTRAL: 'Trung ương giao', PROVINCE: 'Tỉnh/Thành phố giao', LOCAL: 'Địa phương tự đặt' };
const STATUS_SORT: TargetStatusKey[] = ['OVERDUE', 'AT_RISK', 'NOT_STARTED', 'ON_TRACK', 'COMPLETED'];

function planText(target: Target) {
  return target.targetText || `${num(target.targetValue)} ${target.unit}`;
}

function inSync(target: Target) {
  if (!target.isPublic || !target.publishedAt) return false;
  return (
    target.publishedValue === target.currentValue &&
    target.publishedTargetValue === target.targetValue &&
    target.publishedDirection === target.direction &&
    target.publishedStatus === target.status &&
    target.publishedCode === target.code &&
    target.publishedTitle === target.title &&
    (target.publishedDescription ?? '') === (target.description ?? '') &&
    target.publishedUnit === target.unit &&
    target.publishedWeight === target.weight &&
    target.publishedYear === target.year &&
    target.publishedFrequency === target.frequency &&
    Boolean(target.publishedDueDate) &&
    new Date(target.publishedDueDate!).getTime() === new Date(target.dueDate).getTime() &&
    target.publishedDepartmentName === target.department.name &&
    target.publishedDepartmentColor === target.department.color &&
    target.publishedHighlighted === target.isHighlighted &&
    (target.publishedOrder ?? null) === (target.publicOrder ?? null)
  );
}

export default function Targets() {
  const user = useMe();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const global = isGlobal(user);
  const leader = can(user, LEADERSHIP);

  const year = Number(params.get('year')) || currentYear();
  const search = params.get('q') ?? '';
  const frameworkId = params.get('frameworkId') ?? '';
  const departmentId = params.get('departmentId') ?? '';
  const kind = params.get('kind') ?? '';
  const status = params.get('status') ?? '';
  const assignee = params.get('assignee') ?? '';
  const archived = params.get('archived') === '1';
  const formDefaults = useMemo(() => ({
    year,
    departmentId: departmentId || undefined,
    frameworkId: frameworkId && frameworkId !== 'none' ? frameworkId : undefined,
  }), [year, departmentId, frameworkId]);

  const [text, setText] = useState(search);
  const [editing, setEditing] = useState<Target | null>(null);
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [archiving, setArchiving] = useState<Target | null>(null);
  const [exporting, setExporting] = useState(false);

  const departments = useDepartments();
  const frameworks = useFrameworks();
  const list = useApi<Target[]>(
    `/targets${query({ year, archived, frameworkId: frameworkId || undefined, departmentId: global ? departmentId || undefined : undefined, kind: kind || undefined, mine: assignee === 'me' ? true : undefined })}`,
    { keepPrevious: true },
  );

  function update(next: Record<string, string | null>) {
    const copy = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value) copy.set(key, value);
      else copy.delete(key);
    }
    copy.delete('new');
    setParams(copy, { replace: true });
  }

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('vi');
    return (list.data ?? []).filter(target => {
      if (status && target.status !== status) return false;
      if (assignee === 'none' && (target.assigneeId || target.valueSource === 'COMPUTED' || target.valueSource === 'CHILDREN')) return false;
      if (!needle) return true;
      return `${target.code} ${target.standardCode ?? ''} ${target.title} ${target.groupName ?? ''} ${target.assignee?.fullName ?? ''}`.toLocaleLowerCase('vi').includes(needle);
    });
  }, [list.data, search, status, assignee]);

  const counts = useMemo(() => {
    const result: Partial<Record<TargetStatusKey, number>> = {};
    for (const target of list.data ?? []) result[target.status as TargetStatusKey] = (result[target.status as TargetStatusKey] ?? 0) + 1;
    return result;
  }, [list.data]);

  const visibility = useAction(
    ({ target, isPublic, publish }: { target: Target; isPublic: boolean; publish?: boolean }) =>
      publish
        ? http.post(`/targets/${target.id}/publish`, { expectedVersion: target.version, expectedPublicationVersion: target.publicationVersion })
        : http.patch(`/targets/${target.id}/visibility`, { isPublic, expectedVersion: target.version, expectedPublicationVersion: target.publicationVersion }),
    { success: 'Đã cập nhật trang công khai', refresh: ['/targets'] },
  );

  const archive = useAction(
    ({ target, reason }: { target: Target; reason: string }) =>
      http.post(`/targets/${target.id}/${target.isArchived ? 'unarchive' : 'archive'}`, { reason, expectedVersion: target.version, expectedPublicationVersion: target.publicationVersion }),
    {
      success: () => (archiving?.isArchived ? 'Đã khôi phục chỉ tiêu' : 'Đã lưu trữ chỉ tiêu'),
      refresh: ['/targets', '/ioc', '/frameworks'],
      onDone: () => setArchiving(null),
    },
  );

  async function exportExcel() {
    setExporting(true);
    try {
      const blob = await http.blob(`/exports/targets.xlsx${query({ year, departmentId: global ? departmentId || undefined : undefined })}`);
      saveBlob(blob, `chi-tieu-${year}.xlsx`);
    } catch (error) {
      message.error(errorText(error, 'Không xuất được tệp Excel'));
    } finally {
      setExporting(false);
    }
  }

  function rowMenu(target: Target): MenuProps['items'] {
    const items: MenuProps['items'] = [{ key: 'open', icon: <FolderOpenOutlined />, label: 'Mở hồ sơ', onClick: () => navigate(`/admin/targets/${target.id}`) }];
    if (can(user, REPORTERS) && target.valueSource === 'MANUAL' && !target.isArchived) {
      items.push({ key: 'report', icon: <EditOutlined />, label: 'Báo cáo số liệu', onClick: () => navigate(`/admin/targets/${target.id}?bao-cao=1`) });
    }
    if (!leader) return items;
    if (!target.isArchived) {
      items.push({ key: 'edit', icon: <EditOutlined />, label: 'Sửa', onClick: () => setEditing(target) });
      items.push({ type: 'divider' });
      items.push(
        target.isPublic
          ? { key: 'hide', icon: <EyeInvisibleOutlined />, label: 'Ẩn khỏi trang công khai', onClick: () => visibility.mutate({ target, isPublic: false }) }
          : { key: 'show', icon: <EyeOutlined />, label: target.lastReportedAt ? 'Hiển thị trên trang công khai' : 'Chưa có số liệu chính thức', disabled: !target.lastReportedAt, onClick: () => visibility.mutate({ target, isPublic: true }) },
      );
      if (target.isPublic && !inSync(target)) {
        items.push({ key: 'publish', icon: <CloudUploadOutlined />, label: 'Cập nhật bản công khai', onClick: () => visibility.mutate({ target, isPublic: true, publish: true }) });
      }
      items.push({ type: 'divider' });
    }
    items.push({
      key: 'archive',
      icon: target.isArchived ? <UndoOutlined /> : <InboxOutlined />,
      label: target.isArchived ? 'Khôi phục' : 'Lưu trữ',
      danger: !target.isArchived,
      onClick: () => setArchiving(target),
    });
    return items;
  }

  const columns: TableColumnsType<Target> = [
    {
      title: 'Chỉ tiêu',
      key: 'title',
      sorter: (a, b) => a.title.localeCompare(b.title, 'vi'),
      render: (_, target) => (
        <TitleCell
          title={target.title}
          to={`/admin/targets/${target.id}`}
          sub={[target.code, target.standardCode ? `Mã ${target.standardCode}` : null, target.ordinal ? `STT ${target.ordinal}` : null].filter(Boolean).join(' · ')}
        />
      ),
    },
    {
      title: 'Phụ trách',
      key: 'owner',
      className: 'table-group-end',
      width: 200,
      sorter: (a, b) => a.department.name.localeCompare(b.department.name, 'vi') || (a.assignee?.fullName ?? '').localeCompare(b.assignee?.fullName ?? '', 'vi'),
      render: (_, target) => (
        <div className="cell-title">
          <DeptTag name={target.department.name} color={target.department.color} />
          {target.valueSource === 'COMPUTED' ? <span>Tự tính từ dữ liệu</span> : target.valueSource === 'CHILDREN' ? <span>Tổng hợp từ chỉ tiêu con</span> : target.assignee ? <span>{target.assignee.fullName}</span> : <span className="tone-warn">Chưa giao người</span>}
        </div>
      ),
    },
    {
      title: 'Kế hoạch',
      key: 'plan',
      width: 130,
      align: 'right',
      sorter: (a, b) => a.targetValue - b.targetValue,
      sortDirections: ['descend', 'ascend'],
      render: (_, target) => <span className="num">{planText(target)}</span>,
    },
    {
      title: 'Thực hiện',
      key: 'current',
      width: 140,
      align: 'right',
      sorter: (a, b) => (a.lastReportedAt ? a.currentValue : -Infinity) - (b.lastReportedAt ? b.currentValue : -Infinity),
      sortDirections: ['descend', 'ascend'],
      render: (_, target) =>
        target.lastReportedAt ? (
          <Tooltip title={`Cập nhật ${dateTime(target.lastReportedAt)}`}>
            <div className="cell-title" style={{ alignItems: 'flex-end' }}>
              <span className="num" style={{ color: 'var(--ioc-color-text)', fontSize: 14 }}>
                {num(target.currentValue)} {target.kind !== 'SCORE' ? target.unit : ''}
              </span>
              <span>{fromNow(target.lastReportedAt)}</span>
            </div>
          </Tooltip>
        ) : (
          <span className="muted">Chưa có số liệu</span>
        ),
    },
    {
      title: 'Tiến độ',
      key: 'progress',
      className: 'table-group-end',
      width: 150,
      sorter: (a, b) => (a.progress ?? 0) - (b.progress ?? 0),
      sortDirections: ['descend', 'ascend'],
      render: (_, target) => (target.kind === 'STAT' ? <span className="muted">—</span> : <ProgressCell value={target.progress ?? 0} status={target.status} />),
    },
    {
      title: 'Tình trạng',
      key: 'status',
      width: 128,
      sorter: (a, b) => STATUS_SORT.indexOf(a.status as TargetStatusKey) - STATUS_SORT.indexOf(b.status as TargetStatusKey),
      render: (_, target) => (
        <Space size={4} wrap>
          <StatusTag status={target.status} />
          {Boolean(target.pendingUpdates) && (
            <Tooltip title="Báo cáo chờ duyệt">
              <Badge count={target.pendingUpdates} size="small" color="gold" />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: 'Hạn',
      dataIndex: 'dueDate',
      width: 120,
      sorter: (a, b) => a.dueDate.localeCompare(b.dueDate),
      defaultSortOrder: 'ascend',
      render: value => date(value),
    },
    {
      key: 'actions',
      width: 52,
      fixed: 'right',
      render: (_, target) => (
        <Dropdown menu={{ items: rowMenu(target) }} trigger={['click']} placement="bottomRight">
          <Button type="text" icon={<MoreOutlined />} aria-label="Thao tác" onClick={event => event.stopPropagation()} />
        </Dropdown>
      ),
    },
  ];

  const scoped = !global;

  return (
    <Page
      title={scoped ? 'Chỉ tiêu của phòng' : 'Danh mục chỉ tiêu'}
      meta={
        list.data && (
          <span>
            {num(rows.length)}
            {rows.length !== list.data.length ? ` / ${num(list.data.length)}` : ''} chỉ tiêu · Năm {year}
            {archived ? ' · Đã lưu trữ' : ''}
          </span>
        )
      }
      extra={
        <>
          <Button icon={<FileExcelOutlined />} loading={exporting} onClick={() => void exportExcel()}>
            Xuất Excel
          </Button>
          {can(user, IMPORTERS) && (
            <Link to="/admin/imports">
              <Button>Nhập Excel</Button>
            </Link>
          )}
          {leader && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              Thêm chỉ tiêu
            </Button>
          )}
        </>
      }
      wide
    >
      <Card className="card-flush">
        <div className="table-filters">
          <FilterBar
            active={[frameworkId, departmentId, kind, status, assignee].filter(Boolean).length}
            search={
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Mã, tên chỉ tiêu, người phụ trách"
              value={text}
              onChange={event => {
                setText(event.target.value);
                if (!event.target.value) update({ q: null });
              }}
              onPressEnter={() => update({ q: text.trim() || null })}
              onBlur={() => update({ q: text.trim() || null })}
              style={{ width: '100%', maxWidth: 300 }}
            />
            }
            filters={
              <>
            <YearSelect value={year} onChange={value => update({ year: String(value) })} />
            <Select
              allowClear
              placeholder="Bộ chỉ tiêu"
              value={frameworkId || undefined}
              onChange={value => update({ frameworkId: value ?? null })}
              options={[...frameworkOptions(frameworks.data), { value: 'none', label: 'Không thuộc bộ nào' }]}
              style={{ width: 240 }}
              popupMatchSelectWidth={false}
            />
            {global && (
              <Select
                allowClear
                placeholder="Phòng ban"
                value={departmentId || undefined}
                onChange={value => update({ departmentId: value ?? null })}
                options={departmentOptions(departments.data, false)}
                style={{ width: 200 }}
                popupMatchSelectWidth={false}
              />
            )}
            <Select allowClear placeholder="Loại" value={kind || undefined} onChange={value => update({ kind: value ?? null })} options={KIND_OPTIONS} style={{ width: 150 }} popupMatchSelectWidth={false} />
            <Select
              allowClear
              placeholder="Tình trạng"
              value={status || undefined}
              onChange={value => update({ status: value ?? null })}
              options={STATUS_ORDER.map(key => ({ value: key, label: `${STATUS[key].label} (${counts[key] ?? 0})` }))}
              style={{ width: 170 }}
              popupMatchSelectWidth={false}
            />
            <Select
              allowClear
              placeholder="Người phụ trách"
              value={assignee || undefined}
              onChange={value => update({ assignee: value ?? null })}
              options={[
                { value: 'me', label: 'Tôi phụ trách' },
                { value: 'none', label: 'Chưa giao người' },
              ]}
              style={{ width: 160 }}
            />
              </>
            }
            extra={
              global && (
                <Segmented
                  value={archived ? 'archived' : 'active'}
                  onChange={value => update({ archived: value === 'archived' ? '1' : null })}
                  options={[
                    { value: 'active', label: 'Đang theo dõi' },
                    { value: 'archived', label: 'Lưu trữ' },
                  ]}
                />
              )
            
            }
          />
        </div>
        {list.error && !list.data ? (
          <LoadError error={list.error} retry={() => void list.refetch()} />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={list.isLoading || (list.isFetching && !list.data)}
            scroll={{ x: 1220 }}
            onRow={target => ({ onDoubleClick: () => navigate(`/admin/targets/${target.id}`) })}
            pagination={{ defaultPageSize: 20, showSizeChanger: true, pageSizeOptions: [20, 50, 100], showTotal: total => `${num(total)} chỉ tiêu`, hideOnSinglePage: false }}
            expandable={{
              expandedRowRender: target => <TargetDetail target={target} />,
            }}
            locale={{ emptyText: archived ? 'Không có chỉ tiêu lưu trữ' : 'Không có chỉ tiêu phù hợp' }}
          />
        )}
      </Card>

      <TargetForm
        open={creating || Boolean(editing)}
        target={editing}
        defaults={formDefaults}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ReasonModal
        open={Boolean(archiving)}
        title={archiving?.isArchived ? `Khôi phục ${archiving.code}` : `Lưu trữ ${archiving?.code ?? ''}`}
        okText={archiving?.isArchived ? 'Khôi phục' : 'Lưu trữ'}
        danger={!archiving?.isArchived}
        initial={archiving?.isArchived ? 'Khôi phục để tiếp tục kỳ kế hoạch' : 'Kết thúc kỳ kế hoạch'}
        loading={archive.isPending}
        onCancel={() => setArchiving(null)}
        onSubmit={reason => archiving && archive.mutate({ target: archiving, reason })}
      />
    </Page>
  );
}

function TargetDetail({ target }: { target: Target }) {
  return (
    <div className="expand-panel">
      <Descriptions
        size="small"
        column={{ xs: 1, md: 2, xl: 4 }}
        items={[
          { label: 'Loại', children: target.kind ? <KindTag kind={target.kind as FrameworkKind} /> : '—' },
          { label: 'Cấp giao', children: target.issuingLevel ? ISSUING[target.issuingLevel] : '—' },
          { label: 'Kỳ báo cáo', children: frequencyLabel[target.frequency] },
          { label: 'Hạn hoàn thành', children: date(target.dueDate) },
          { label: 'Chiều đánh giá', children: target.direction === 'LOWER_IS_BETTER' ? 'Càng thấp càng tốt' : 'Càng cao càng tốt' },
          { label: 'Văn bản chỉ đạo', children: num(target.directiveCount ?? 0) },
          { label: 'Đánh giá', children: num(target.evaluationCount ?? 0) },
          { label: 'Chỉ tiêu con', children: num(target.childCount ?? 0) },
          { label: 'Phối hợp', children: target.coordinators?.length ? target.coordinators.map(item => item.department.name).join(', ') : '—', span: { xs: 1, md: 2, xl: 2 } },
          {
            label: 'Trang công khai',
            children: target.isPublic ? <Tag color={inSync(target) ? 'green' : 'gold'}>{inSync(target) ? 'Đang hiển thị' : 'Có thay đổi chưa công bố'}</Tag> : 'Không hiển thị',
          },
          { label: 'Bộ chỉ tiêu', children: target.framework?.name ?? '—', span: { xs: 1, md: 2, xl: 2 } },
          { label: 'Nhóm', children: target.groupName ?? '—', span: { xs: 1, md: 2, xl: 2 } },
          ...(target.updates?.length
            ? [
                {
                  label: 'Số liệu gần nhất',
                  span: { xs: 1, md: 2, xl: 4 },
                  children: (
                    <Space orientation="vertical" size={2}>
                      {target.updates.map(update => (
                        <span key={update.id}>
                          <b className="num">{update.valueText || `${num(update.value)} ${target.unit}`}</b>
                          {update.periodKey && <span className="secondary"> · {periodLabel(update.periodKey)}</span>}
                          <span className="muted">
                            {' '}
                            · {update.user?.fullName} · {dateTime(update.createdAt)}
                          </span>
                        </span>
                      ))}
                    </Space>
                  ),
                },
              ]
            : []),
          ...(target.isArchived ? [{ label: 'Lý do lưu trữ', children: target.archiveReason ?? '—', span: { xs: 1, md: 2, xl: 4 } }] : []),
        ]}
      />
      <div style={{ marginTop: 10 }}>
        <Link to={`/admin/targets/${target.id}`}>
          <Button size="small" icon={<FolderOpenOutlined />}>
            Mở hồ sơ
          </Button>
        </Link>
      </div>
    </div>
  );
}
