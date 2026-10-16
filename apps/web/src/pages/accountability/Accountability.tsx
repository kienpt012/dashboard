import { PrinterOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Flex, Table, Tooltip, type TableColumnsType } from 'antd';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/app/session';
import { Metric, YearSelect } from '@/components/Data';
import { Page } from '@/components/Page';
import { PrintDocument } from '@/components/PrintDocument';
import { PageSkeleton, Query } from '@/components/States';
import { DeptTag } from '@/components/Tags';
import { useApi } from '@/hooks/useApi';
import { currentYear, dateTime, fromNow, num, vn } from '@/lib/format';
import { isGlobal } from '@/lib/roles';

type Person = { id: string; fullName: string; position?: string | null; lastLoginAt?: string | null };
type Row = {
  id: string;
  name: string;
  color: string;
  managers: Person[];
  targets: number;
  pendingReports: number;
  oldestPendingDays: number;
  autoApprovedReports: number;
  rejectedProposals: number;
  rejectionReasons: { actorName: string; reason?: string | null; at: string; candidateId?: string | null }[];
  autoApprovedProposals: number;
  bounces: number;
  escalations: number;
  unassigned: number;
  missingReports: number;
  openExplanations: number;
  overdueExplanations: number;
  withoutDirective: number;
  withoutEvaluation: number;
};
type Data = { year: number; generatedAt: string; departments: Row[]; leaders: Person[]; autoApprovedProposalsTotal: number; autoApprovedReportsTotal: number };
type NumKey = 'targets' | 'pendingReports' | 'oldestPendingDays' | 'autoApprovedReports' | 'rejectedProposals' | 'autoApprovedProposals' | 'bounces' | 'escalations' | 'unassigned' | 'missingReports' | 'overdueExplanations';

const THRESHOLD: Partial<Record<NumKey, [number, number]>> = {
  pendingReports: [1, 5],
  oldestPendingDays: [3, 7],
  autoApprovedReports: [1, 3],
  rejectedProposals: [3, 10],
  autoApprovedProposals: [1, 3],
  bounces: [2, 5],
  escalations: [1, 5],
  unassigned: [1, 10],
  missingReports: [1, 5],
  overdueExplanations: [1, 1],
};

function cell(key: NumKey) {
  return (value: number) => {
    const [warn, bad] = THRESHOLD[key] ?? [Infinity, Infinity];
    const tone = value >= bad ? 'tone-bad' : value >= warn ? 'tone-warn' : value === 0 ? 'muted' : '';
    return <span className={`num ${tone}`}>{num(value)}</span>;
  };
}

function login(person: Person) {
  if (!person.lastLoginAt) return <span className="tone-bad">chưa đăng nhập</span>;
  const days = (Date.now() - new Date(person.lastLoginAt).getTime()) / 86_400_000;
  return <span className={days > 7 ? 'tone-warn' : 'muted'}>đăng nhập {fromNow(person.lastLoginAt)}</span>;
}

function numCol(key: NumKey, title: string, defaultSort?: boolean) {
  return {
    title,
    dataIndex: key,
    width: 84,
    align: 'center' as const,
    className: 'col-stack',
    render: cell(key),
    sorter: (a: Row, b: Row) => a[key] - b[key],
    sortDirections: ['descend', 'ascend'] as ('descend' | 'ascend')[],
    ...(defaultSort ? { defaultSortOrder: 'descend' as const } : {}),
  };
}

function PrintAppendix({ data }: { data: Data }) {
  const rows = [...data.departments].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  const sum = (key: NumKey) => rows.reduce((total, row) => total + row[key], 0);
  const at = vn(data.generatedAt);
  return (
    <PrintDocument
      kind="PHỤ LỤC"
      title={`Tình hình thực hiện trách nhiệm của người đứng đầu các phòng, đơn vị năm ${data.year}`}
      subtitle={`(Số liệu trích xuất từ hệ thống lúc ${at.format('HH')} giờ ${at.format('mm')} ngày ${at.format('DD/MM/YYYY')})`}
      orientation="landscape"
    >
      <table>
        <thead>
          <tr>
            <th rowSpan={2} className="w-stt">
              STT
            </th>
            <th rowSpan={2} className="w-name">
              Phòng, đơn vị
            </th>
            <th rowSpan={2} className="w-person">
              Người đứng đầu
            </th>
            <th rowSpan={2}>Số chỉ tiêu</th>
            <th colSpan={3}>Duyệt báo cáo số liệu</th>
            <th colSpan={2}>Đề xuất chỉ tiêu</th>
            <th colSpan={3}>Giao việc</th>
            <th rowSpan={2}>Thiếu báo cáo kỳ</th>
            <th rowSpan={2}>Giải trình quá hạn</th>
          </tr>
          <tr>
            <th>Đang chờ</th>
            <th>Chờ lâu nhất (ngày)</th>
            <th>Tự thông qua</th>
            <th>Bị từ chối</th>
            <th>Tự thông qua</th>
            <th>Chưa giao người</th>
            <th>Chuyển, trả việc</th>
            <th>Báo lên lãnh đạo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td className="c">{index + 1}</td>
              <td>{row.name}</td>
              <td>{row.managers.map(person => person.fullName).join(', ') || '—'}</td>
              {(['targets', 'pendingReports', 'oldestPendingDays', 'autoApprovedReports', 'rejectedProposals', 'autoApprovedProposals', 'unassigned', 'bounces', 'escalations', 'missingReports', 'overdueExplanations'] as NumKey[]).map(key => (
                <td key={key} className="c">
                  {row[key]}
                </td>
              ))}
            </tr>
          ))}
          <tr className="total">
            <td className="c" colSpan={3}>
              Tổng cộng
            </td>
            <td className="c">{sum('targets')}</td>
            <td className="c">{sum('pendingReports')}</td>
            <td className="c">{Math.max(0, ...rows.map(row => row.oldestPendingDays))}</td>
            <td className="c">{sum('autoApprovedReports')}</td>
            <td className="c">{sum('rejectedProposals')}</td>
            <td className="c">{sum('autoApprovedProposals')}</td>
            <td className="c">{sum('unassigned')}</td>
            <td className="c">{sum('bounces')}</td>
            <td className="c">{sum('escalations')}</td>
            <td className="c">{sum('missingReports')}</td>
            <td className="c">{sum('overdueExplanations')}</td>
          </tr>
        </tbody>
      </table>
    </PrintDocument>
  );
}

function Content({ data }: { data: Data }) {
  const user = useMe();
  const sum = (key: NumKey) => data.departments.reduce((total, row) => total + row[key], 0);

  const columns: TableColumnsType<Row> = [
    {
      title: 'Phòng, đơn vị',
      key: 'name',
      width: 250,
      sorter: (a, b) => a.name.localeCompare(b.name, 'vi'),
      render: (_, row) => (
        <div className="cell-title">
          <Link to={`/admin/targets?departmentId=${row.id}&year=${data.year}`}>
            <DeptTag name={row.name} color={row.color} />
          </Link>
          {row.managers.length ? (
            row.managers.map(person => (
              <span key={person.id}>
                {person.fullName} · {login(person)}
              </span>
            ))
          ) : (
            <span className="tone-warn">Chưa có trưởng phòng</span>
          )}
        </div>
      ),
    },
    { title: 'Chỉ tiêu', dataIndex: 'targets', width: 76, align: 'center', className: 'col-stack', render: value => <span className="num">{num(value)}</span>, sorter: (a, b) => a.targets - b.targets, sortDirections: ['descend', 'ascend'] },
    { title: 'Duyệt báo cáo', align: 'center', children: [numCol('pendingReports', 'Đang chờ'), numCol('oldestPendingDays', 'Lâu nhất (ngày)'), numCol('autoApprovedReports', 'Tự thông qua', true)] },
    { title: 'Đề xuất chỉ tiêu', align: 'center', children: [numCol('rejectedProposals', 'Bị từ chối'), numCol('autoApprovedProposals', 'Tự thông qua')] },
    { title: 'Giao việc', align: 'center', children: [numCol('unassigned', 'Chưa giao'), numCol('bounces', 'Chuyển, trả'), numCol('escalations', 'Báo lãnh đạo')] },
    numCol('missingReports', 'Thiếu báo cáo'),
    numCol('overdueExplanations', 'Giải trình quá hạn'),
  ];

  return (
    <Flex vertical gap={16}>
      <Card className="card-flush">
        <div className="metric-grid metric-grid-5">
          <Metric label="Báo cáo tự thông qua" value={num(data.autoApprovedReportsTotal)} tone={data.autoApprovedReportsTotal ? 'bad' : undefined} />
          <Metric label="Đề xuất tự thông qua" value={num(data.autoApprovedProposalsTotal)} tone={data.autoApprovedProposalsTotal ? 'warn' : undefined} />
          <Metric label="Báo cáo đang chờ duyệt" value={num(sum('pendingReports'))} tone={sum('pendingReports') ? 'warn' : undefined} />
          <Metric label="Chuyển, trả việc" value={num(sum('bounces'))} tone={sum('bounces') ? 'warn' : undefined} />
          <Metric label="Giải trình quá hạn" value={num(sum('overdueExplanations'))} tone={sum('overdueExplanations') ? 'bad' : undefined} />
        </div>
      </Card>

      <Card className="card-flush">
        <Table
          rowKey="id"
          bordered
          size="middle"
          columns={columns}
          dataSource={data.departments}
          pagination={false}
          scroll={{ x: 1180 }}
          expandable={{
            expandedRowRender: row => (
              <Descriptions
                size="small"
                column={{ xs: 1, md: 2, xl: 4 }}
                items={[
                  { label: 'Giải trình đang mở', children: num(row.openExplanations) },
                  { label: 'Chưa có văn bản chỉ đạo', children: num(row.withoutDirective) },
                  { label: 'Chưa đánh giá', children: num(row.withoutEvaluation) },
                  { label: 'Đề xuất bị từ chối', children: num(row.rejectedProposals) },
                  ...(row.rejectionReasons.length
                    ? [
                        {
                          label: 'Lý do từ chối',
                          span: { xs: 1, md: 2, xl: 4 },
                          children: (
                            <ul className="plain-list">
                              {row.rejectionReasons.map((item, index) => (
                                <li key={index}>
                                  {item.candidateId ? <Link to={`/admin/proposals?id=${item.candidateId}`}>{item.reason || '—'}</Link> : item.reason || '—'}{' '}
                                  <span className="muted">
                                    ({item.actorName}, {dateTime(item.at)})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            ),
          }}
          summary={() => (
            <Table.Summary>
              <Table.Summary.Row className="summary-row">
                <Table.Summary.Cell index={0} />
                <Table.Summary.Cell index={1}>
                  <b>Tổng cộng</b>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="center">
                  <b className="num">{num(sum('targets'))}</b>
                </Table.Summary.Cell>
                {(['pendingReports', 'oldestPendingDays', 'autoApprovedReports', 'rejectedProposals', 'autoApprovedProposals', 'unassigned', 'bounces', 'escalations', 'missingReports', 'overdueExplanations'] as NumKey[]).map((key, index) => (
                  <Table.Summary.Cell key={key} index={index + 3} align="center">
                    <b className="num">{num(key === 'oldestPendingDays' ? Math.max(0, ...data.departments.map(row => row.oldestPendingDays)) : sum(key))}</b>
                  </Table.Summary.Cell>
                ))}
              </Table.Summary.Row>
            </Table.Summary>
          )}
        />
      </Card>

      {isGlobal(user) && data.leaders.length > 0 && (
        <Card title="Lãnh đạo UBND" size="small">
          <Flex vertical gap={8}>
            {data.leaders.map(person => (
              <Flex key={person.id} justify="space-between" gap={12} wrap>
                <span>
                  <b>{person.fullName}</b> <span className="muted">· {person.position || 'Lãnh đạo UBND'}</span>
                </span>
                {login(person)}
              </Flex>
            ))}
          </Flex>
        </Card>
      )}
      <PrintAppendix data={data} />
    </Flex>
  );
}

export default function Accountability() {
  const [year, setYear] = useState(currentYear());
  const query = useApi<Data>(`/ioc/accountability?year=${year}`, { keepPrevious: true });
  const meta = useMemo(() => query.data && <span>Số liệu lúc {dateTime(query.data.generatedAt)}</span>, [query.data]);
  return (
    <Page
      title="Trách nhiệm người đứng đầu"
      meta={meta}
      extra={
        <>
          <YearSelect value={year} onChange={setYear} />
          <Tooltip title="Tải lại">
            <Button icon={<ReloadOutlined spin={query.isFetching} />} onClick={() => void query.refetch()} aria-label="Tải lại" />
          </Tooltip>
          <Button icon={<PrinterOutlined />} disabled={!query.data} onClick={() => window.print()}>
            In phụ lục
          </Button>
        </>
      }
      wide
    >
      <Query query={query} skeleton={<PageSkeleton />}>
        {data => <Content data={data} />}
      </Query>
    </Page>
  );
}
