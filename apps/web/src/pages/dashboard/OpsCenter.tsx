import { FundProjectionScreenOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Descriptions, Flex, Row, Segmented, Table, Tabs, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLocality } from '@/app/locality';
import { useMe } from '@/app/session';
import { Chart, type ChartOption } from '@/components/Chart';
import { DistBar, Metric, ProgressCell, TitleCell, YearSelect } from '@/components/Data';
import { Page } from '@/components/Page';
import { NoData, PageSkeleton, Query } from '@/components/States';
import { KindTag, STATUS, STATUS_ORDER } from '@/components/Tags';
import { useApi } from '@/hooks/useApi';
import { currentYear, date, dateTime, fromNow, num, pct } from '@/lib/format';
import { APPROVERS, can, FRAMEWORK_EDITORS, SUPERVISORS } from '@/lib/roles';
import type { AlertItem, Overview, OverviewDepartment, TargetStatusKey } from '@/types/domain';

const ALERT_KINDS: Record<string, string> = {
  STALLED: 'Bị treo',
  MISSING_REPORT: 'Thiếu báo cáo',
  AT_RISK: 'Nguy cơ không đạt',
  OVERDUE: 'Quá hạn',
  UNASSIGNED: 'Chưa giao',
  PROPOSAL_PENDING: 'Đề xuất chờ duyệt',
  REPORT_PENDING: 'Báo cáo chờ duyệt',
  EXPLANATION_OVERDUE: 'Giải trình quá hạn',
};

function alertLink(alert: AlertItem, departments: OverviewDepartment[]) {
  if (alert.targetId) return `/admin/targets/${alert.targetId}`;
  if (alert.candidateId) return `/admin/proposals?id=${encodeURIComponent(alert.candidateId)}`;
  if (alert.kind === 'UNASSIGNED') {
    const id = departments.find(item => item.name === alert.departmentName)?.id;
    return `/admin/targets?assignee=none${id ? `&departmentId=${id}` : ''}`;
  }
  return undefined;
}

function alertWhen(alert: AlertItem) {
  if (!alert.at) return '';
  return alert.kind === 'OVERDUE' || alert.kind === 'EXPLANATION_OVERDUE' ? `Hạn ${date(alert.at)}` : fromNow(alert.at);
}

function StatusDonut({ data }: { data: Overview }) {
  const navigate = useNavigate();
  const t = data.totals;
  const counts: Record<TargetStatusKey, number> = { COMPLETED: t.completed, ON_TRACK: t.onTrack, AT_RISK: t.atRisk, OVERDUE: t.overdue, NOT_STARTED: t.notStarted };
  const option = useMemo<ChartOption>(
    () => ({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [
        {
          type: 'pie',
          radius: ['62%', '86%'],
          center: ['50%', '50%'],
          avoidLabelOverlap: false,
          padAngle: 1,
          itemStyle: { borderRadius: 3 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          data: STATUS_ORDER.map(key => ({ name: STATUS[key].label, value: counts[key], itemStyle: { color: STATUS[key].hex }, key })),
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t.completed, t.onTrack, t.atRisk, t.overdue, t.notStarted],
  );
  return (
    <Flex gap={20} align="center" wrap className="donut-wrap">
      <div className="donut">
        <Chart
          option={option}
          height={188}
          onClick={params => {
            const key = STATUS_ORDER.find(item => STATUS[item].label === params.name);
            if (key) navigate(`/admin/targets?status=${key}&year=${data.year}`);
          }}
        />
        <div className="donut-center">
          <strong>{pct(t.progress)}</strong>
          <span>tiến độ chung</span>
        </div>
      </div>
      <div className="donut-legend">
        {STATUS_ORDER.map(key => (
          <Link key={key} to={`/admin/targets?status=${key}&year=${data.year}`} className="donut-row">
            <span>
              <i style={{ background: STATUS[key].hex }} />
              {STATUS[key].label}
            </span>
            <b>{num(counts[key])}</b>
          </Link>
        ))}
        <div className="donut-row total">
          <span>Tổng số chỉ tiêu</span>
          <b>{num(t.targets)}</b>
        </div>
      </div>
    </Flex>
  );
}

function Frameworks({ data }: { data: Overview }) {
  const user = useMe();
  if (!data.frameworks.length) {
    return (
      <NoData text={`Chưa có bộ chỉ tiêu năm ${data.year}`}>
        {can(user, FRAMEWORK_EDITORS) && (
          <Link to="/admin/bo-chi-tieu">
            <Button>Mở Bộ chỉ tiêu</Button>
          </Link>
        )}
      </NoData>
    );
  }
  return (
    <Table
      rowKey="id"
      size="middle"
      pagination={false}
      dataSource={data.frameworks}
      scroll={{ x: 820 }}
      expandable={{
        expandedRowRender: framework => (
          <Descriptions
            size="small"
            column={{ xs: 1, md: 2, xl: 3 }}
            items={[
              { label: 'Căn cứ', children: framework.legalBasis || '—', span: { xs: 1, md: 2, xl: 3 } },
              { label: 'Cấp giao', children: framework.issuingLevelLabel },
              { label: 'Đã có số liệu', children: `${num(framework.summary.reported)}/${num(framework.summary.total)}` },
              { label: 'Có văn bản chỉ đạo', children: `${num(framework.summary.withDirective)}/${num(framework.summary.total)}` },
              { label: 'Đã đánh giá', children: `${num(framework.summary.withEvaluation)}/${num(framework.summary.total)}` },
              ...STATUS_ORDER.map(key => ({ label: STATUS[key].label, children: num(framework.summary.counts[key] ?? 0) })),
            ]}
          />
        ),
      }}
      columns={[
        {
          title: 'Bộ chỉ tiêu',
          key: 'name',
          render: (_, framework) => <TitleCell title={framework.name} sub={framework.issuingLevelLabel} to={`/admin/targets?frameworkId=${framework.id}&year=${data.year}`} />,
        },
        { title: 'Loại', key: 'kind', width: 110, render: (_, framework) => <KindTag kind={framework.kind} /> },
        { title: 'Chỉ tiêu', key: 'total', width: 90, align: 'right', render: (_, framework) => <span className="num">{num(framework.summary.total)}</span> },
        {
          title: 'Kết quả',
          key: 'result',
          width: 200,
          render: (_, framework) => {
            const s = framework.summary;
            if (framework.kind === 'SCORE' && s.score !== null) {
              return (
                <Tooltip title={`${num(s.score)} / ${num(s.maxScore ?? 100)} điểm`}>
                  <span className="num">
                    <b>{num(s.score)}</b> <span className="muted">/ {num(s.maxScore ?? 100)} điểm</span>
                  </span>
                </Tooltip>
              );
            }
            if (framework.kind === 'STAT') return <ProgressCell value={(s.reported / Math.max(1, s.total)) * 100} />;
            return <ProgressCell value={s.progress ?? 0} />;
          },
        },
        { title: 'Tình trạng', key: 'dist', width: 180, render: (_, framework) => <DistBar counts={framework.summary.counts} total={framework.summary.total} /> },
        {
          title: 'Thiếu báo cáo',
          key: 'missing',
          width: 120,
          align: 'right',
          render: (_, framework) => <span className={`num${framework.missingReports ? ' tone-warn' : ' muted'}`}>{num(framework.missingReports)}</span>,
        },
      ]}
    />
  );
}

function Departments({ data }: { data: Overview }) {
  const user = useMe();
  const supervise = can(user, SUPERVISORS);
  return (
    <Table
      rowKey="id"
      size="middle"
      pagination={false}
      dataSource={data.departments}
      scroll={{ x: 980 }}
      expandable={{
        expandedRowRender: department => (
          <Descriptions
            size="small"
            column={{ xs: 1, md: 2, xl: 4 }}
            items={[
              {
                label: 'Trưởng phòng',
                children: department.managers.length
                  ? department.managers.map(manager => `${manager.fullName} (${manager.lastLoginAt ? `đăng nhập ${fromNow(manager.lastLoginAt)}` : 'chưa đăng nhập'})`).join('; ')
                  : 'Chưa có',
                span: { xs: 1, md: 2, xl: 2 },
              },
              { label: 'Chờ duyệt lâu nhất', children: department.pendingReports ? `${num(department.oldestPendingDays)} ngày` : '—' },
              { label: 'Giải trình đang mở', children: num(department.openExplanations) },
              { label: 'Thống kê có số liệu', children: department.statTotal ? `${num(department.statReported)}/${num(department.statTotal)}` : '—' },
              { label: 'Có văn bản chỉ đạo', children: num(department.withDirective) },
              { label: 'Đã đánh giá', children: num(department.withEvaluation) },
              { label: 'Chưa bắt đầu', children: num(department.notStarted) },
            ]}
          />
        ),
      }}
      columns={[
        {
          title: 'Phòng ban',
          key: 'name',
          render: (_, department) => {
            const manager = department.managers[0];
            return (
              <TitleCell
                title={
                  <span className="dept-tag">
                    <i style={{ background: department.color }} />
                    {department.name}
                  </span>
                }
                sub={manager ? manager.fullName : 'Chưa có trưởng phòng'}
                to={`/admin/targets?departmentId=${department.id}&year=${data.year}`}
              />
            );
          },
        },
        { title: 'Chỉ tiêu', dataIndex: 'total', width: 84, align: 'right', render: value => <span className="num">{num(value)}</span> },
        {
          title: 'Tình trạng',
          key: 'dist',
          width: 160,
          render: (_, department) => (
            <DistBar
              counts={{ COMPLETED: department.completed, ON_TRACK: department.onTrack, AT_RISK: department.atRisk, OVERDUE: department.overdue, NOT_STARTED: department.notStarted }}
              total={department.total}
            />
          ),
        },
        { title: 'Tiến độ', dataIndex: 'progress', width: 170, render: value => <ProgressCell value={value} />, sorter: (a, b) => a.progress - b.progress },
        {
          title: 'Thiếu báo cáo',
          dataIndex: 'missingReports',
          width: 136,
          align: 'right',
          sorter: (a, b) => a.missingReports - b.missingReports,
          render: value => <span className={`num${value ? ' tone-warn' : ' muted'}`}>{num(value)}</span>,
        },
        {
          title: 'Chưa giao',
          dataIndex: 'unassigned',
          width: 112,
          align: 'right',
          sorter: (a, b) => a.unassigned - b.unassigned,
          render: (value, department) =>
            value ? (
              <Link to={`/admin/targets?assignee=none&departmentId=${department.id}&year=${data.year}`} className="num tone-warn">
                {num(value)}
              </Link>
            ) : (
              <span className="num muted">0</span>
            ),
        },
        {
          title: 'Chờ duyệt',
          dataIndex: 'pendingReports',
          width: 100,
          align: 'right',
          render: (value, department) => (
            <Tooltip title={value ? `Lâu nhất ${department.oldestPendingDays} ngày` : undefined}>
              <span className={`num${department.oldestPendingDays >= 3 ? ' tone-bad' : value ? ' tone-warn' : ' muted'}`}>{num(value)}</span>
            </Tooltip>
          ),
        },
        ...(supervise
          ? [
              {
                title: 'Giải trình',
                dataIndex: 'openExplanations',
                width: 96,
                align: 'right' as const,
                render: (value: number) => <span className={`num${value ? ' tone-warn' : ' muted'}`}>{num(value)}</span>,
              },
            ]
          : []),
      ]}
    />
  );
}

function Alerts({ data }: { data: Overview }) {
  const [kind, setKind] = useState('ALL');
  const kinds = [...new Set(data.alerts.map(alert => alert.kind))];
  const list = kind === 'ALL' ? data.alerts : data.alerts.filter(alert => alert.kind === kind);
  return (
    <>
      {kinds.length > 1 && (
        <div className="card-filter">
          <Segmented
            size="small"
            value={kind}
            onChange={value => setKind(String(value))}
            options={[
              { value: 'ALL', label: `Tất cả ${data.alerts.length}` },
              ...kinds.map(item => ({ value: item, label: `${ALERT_KINDS[item] ?? item} ${data.alerts.filter(alert => alert.kind === item).length}` })),
            ]}
          />
        </div>
      )}
      {list.length ? (
        <div className="feed">
          {list.map((alert, index) => {
            const to = alertLink(alert, data.departments);
            return (
              <div className="feed-item" key={`${alert.kind}-${alert.targetId ?? alert.candidateId ?? index}`}>
                <i className={`sev ${alert.severity}`} />
                <div className="feed-body">
                  {to ? <Link to={to}>{alert.title}</Link> : <span>{alert.title}</span>}
                  <span className="feed-meta">{[alert.detail, alert.departmentName, alertWhen(alert)].filter(Boolean).join(' · ')}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <NoData text="Không có cảnh báo" />
      )}
    </>
  );
}

function Stalled({ data }: { data: Overview }) {
  if (!data.stalled.length) return <NoData text="Không có việc bị treo" />;
  return (
    <div className="feed">
      {data.stalled.map(item => (
        <div className="feed-item" key={item.id}>
          <i className="sev critical" />
          <div className="feed-body">
            <Link to={`/admin/targets/${item.id}`}>{item.title}</Link>
            <span className="feed-meta">
              {item.code} · {item.departmentName} · {item.reason}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function Recent({ data }: { data: Overview }) {
  const [all, setAll] = useState(false);
  if (!data.recent.length) return <NoData text="Chưa có hoạt động" />;
  const list = all ? data.recent : data.recent.slice(0, 8);
  return (
    <>
      <div className="feed">
        {list.map(event => {
          const to = event.target ? `/admin/targets/${event.target.id}` : event.candidate ? `/admin/proposals?id=${event.candidate.id}` : undefined;
          const subject = event.target ? `${event.target.code} · ${event.target.title}` : event.candidate?.name;
          return (
            <div className="feed-item" key={event.id}>
              <div className="feed-body">
                <span>
                  <b>{event.actorName}</b> <span className="secondary">{event.label.toLocaleLowerCase('vi')}</span>
                </span>
                {subject && (to ? <Link to={to} className="ellipsis">{subject}</Link> : <span className="ellipsis">{subject}</span>)}
                <Tooltip title={dateTime(event.createdAt)}>
                  <span className="feed-meta">
                    {fromNow(event.createdAt)}
                    {event.note ? ` · ${event.note}` : ''}
                  </span>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>
      {data.recent.length > 8 && (
        <div className="card-more">
          <Button type="link" size="small" onClick={() => setAll(value => !value)}>
            {all ? 'Thu gọn' : `Xem thêm ${data.recent.length - 8}`}
          </Button>
        </div>
      )}
    </>
  );
}

function Workload({ data }: { data: Overview }) {
  const user = useMe();
  const t = data.totals;
  return (
    <div className="metric-grid">
      <Metric label="Thiếu báo cáo kỳ" value={num(t.missingReports)} tone={t.missingReports ? 'warn' : undefined} to="/admin/viec-cua-toi" />
      <Metric label="Chưa giao người" value={num(t.unassigned)} tone={t.unassigned ? 'warn' : undefined} to={`/admin/targets?assignee=none&year=${data.year}`} />
      <Metric label="Báo cáo chờ duyệt" value={num(t.pendingReports)} tone={t.pendingReports ? 'warn' : undefined} to={can(user, APPROVERS) ? '/admin/approvals' : undefined} />
      <Metric label="Đề xuất chờ duyệt" value={num(t.pendingProposals)} tone={t.pendingProposals ? 'warn' : undefined} to="/admin/proposals?status=SUBMITTED" />
      <Metric label="Giải trình đang mở" value={num(t.openExplanations)} tone={t.openExplanations ? 'warn' : undefined} to={can(user, SUPERVISORS) ? '/admin/trach-nhiem' : undefined} />
      <Metric label="Việc bị treo" value={num(t.stalled)} tone={t.stalled ? 'bad' : undefined} />
      <Metric label="Phản ánh quá hạn" value={num(t.feedbackOverdue)} foot={`${num(t.feedbackOpen)} đang xử lý`} tone={t.feedbackOverdue ? 'bad' : undefined} to="/admin/feedback" />
      <Metric
        label="Thống kê có số liệu"
        value={
          <>
            {num(t.statReported)}
            <small> / {num(t.statTotal)}</small>
          </>
        }
        to={`/admin/targets?kind=STAT&year=${data.year}`}
      />
    </div>
  );
}

export default function OpsCenter() {
  const user = useMe();
  const locality = useLocality();
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get('year'));
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : currentYear();
  const overview = useApi<Overview>(`/ioc/overview?year=${year}`, { refetchInterval: 120_000, keepPrevious: true });
  const data = overview.data;
  const departmentScope = data?.scope === 'department';
  const title = departmentScope && data?.departments[0] ? data.departments[0].name : 'Trung tâm điều hành';

  return (
    <Page
      title={title}
      meta={data && <span>Số liệu lúc {dateTime(data.dataAsOf ?? data.generatedAt)}</span>}
      extra={
        <>
          <YearSelect value={year} onChange={value => setParams({ year: String(value) }, { replace: true })} />
          <Button icon={<FundProjectionScreenOutlined />} href="/trinh-chieu" target="_blank">
            Trình chiếu
          </Button>
          <Tooltip title="Tải lại">
            <Button icon={<ReloadOutlined spin={overview.isFetching} />} onClick={() => void overview.refetch()} aria-label="Tải lại" />
          </Tooltip>
        </>
      }
    >
      {!locality.configured && user.role === 'ADMIN' && (
        <Alert type="warning" showIcon style={{ marginBottom: 16 }} title="Chưa thiết lập thông tin địa phương" action={<Link to="/admin/thiet-lap">Thiết lập</Link>} />
      )}
      <Query query={overview} skeleton={<PageSkeleton />}>
        {data => (
          <Flex vertical gap={16}>
            <Row gutter={[16, 16]}>
              <Col xs={24} xl={10}>
                <Card title="Tình trạng chỉ tiêu" className="card-fill" style={{ height: '100%' }}>
                  <StatusDonut data={data} />
                </Card>
              </Col>
              <Col xs={24} xl={14}>
                <Card title="Việc cần xử lý" className="card-flush card-fill" style={{ height: '100%' }}>
                  <Workload data={data} />
                </Card>
              </Col>
            </Row>

            <Card title="Bộ chỉ tiêu" className="card-flush">
              <Frameworks data={data} />
            </Card>

            {!departmentScope && (
              <Card title="Theo phòng ban" className="card-flush">
                <Departments data={data} />
              </Card>
            )}

            <Row gutter={[16, 16]}>
              <Col xs={24} xl={14}>
                <Card className="card-flush card-tabs" style={{ height: '100%' }}>
                  <Tabs
                    items={[
                      { key: 'alerts', label: `Cảnh báo (${data.alerts.length})`, children: <Alerts data={data} /> },
                      { key: 'stalled', label: `Việc bị treo (${data.stalled.length})`, children: <Stalled data={data} /> },
                    ]}
                  />
                </Card>
              </Col>
              <Col xs={24} xl={10}>
                <Card title="Hoạt động gần đây" className="card-flush" style={{ height: '100%' }}>
                  <Recent data={data} />
                </Card>
              </Col>
            </Row>
          </Flex>
        )}
      </Query>
    </Page>
  );
}
