import { ReloadOutlined } from '@ant-design/icons';
import { Badge, Button, Card, Grid, Result, Space, Table, Tabs, Tag, Tooltip } from 'antd';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMe } from '@/app/session';
import { ProgressCell, TitleCell } from '@/components/Data';
import { Page } from '@/components/Page';
import { PageSkeleton, Query } from '@/components/States';
import { DeptTag, ReviewTag, StatusTag } from '@/components/Tags';
import { useApi } from '@/hooks/useApi';
import { date, dateTime, fromNow, msUntil, num, until } from '@/lib/format';
import { periodLabel } from '@/lib/periods';
import { byDate, byNumber, byRank, byText, NUMBER_FIRST, TARGET_STATUS_RANK } from '@/lib/sort';
import { APPROVERS, can, FRAMEWORK_EDITORS, isGlobal, SUPERVISORS } from '@/lib/roles';
import type { MyWork as MyWorkData, TargetBrief } from '@/types/domain';
import { PendingReviews, type PendingUpdate } from '../approvals/PendingReviews';

type Submission = {
  id: string;
  value: number;
  valueText?: string | null;
  periodKey?: string | null;
  reviewStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNote?: string | null;
  reviewedAt?: string | null;
  autoApproved?: boolean;
  createdAt: string;
  target: { id: string; code: string; title: string; unit: string };
  reviewer?: { fullName: string } | null;
};

const DAY = 86_400_000;
const PROPOSAL_RANK = ['SUBMITTED', 'PROPOSED', 'REJECTED', 'APPROVED'];
const REVIEW_RANK = ['REJECTED', 'PENDING', 'APPROVED'];

const PROPOSAL_STATUS: Record<string, { label: string; color: string }> = {
  PROPOSED: { label: 'Chưa trình', color: 'default' },
  SUBMITTED: { label: 'Chờ duyệt', color: 'gold' },
  APPROVED: { label: 'Đã duyệt', color: 'green' },
  REJECTED: { label: 'Bị từ chối', color: 'red' },
};

function plan(target: TargetBrief) {
  if (target.kind === 'STAT') return `${num(target.currentValue)} ${target.unit}`;
  return `${num(target.currentValue)} / ${target.targetText || `${num(target.targetValue)} ${target.unit}`}`;
}

function targetTitle(target: { id: string; code: string; title: string }, extra?: string) {
  return <TitleCell title={target.title} sub={extra ? `${target.code} · ${extra}` : target.code} to={`/admin/targets/${target.id}`} />;
}

function Countdown({ at, soon = 2 * DAY }: { at?: string | null; soon?: number }) {
  if (!at) return <span className="muted">—</span>;
  const left = msUntil(at);
  return (
    <Tooltip title={dateTime(at)}>
      <Tag color={left <= DAY ? 'red' : left <= soon ? 'orange' : 'default'}>{until(at)}</Tag>
    </Tooltip>
  );
}

function Content({ data }: { data: MyWorkData }) {
  const user = useMe();
  const screens = Grid.useBreakpoint();
  const [params, setParams] = useSearchParams();
  const role = user.role;
  const reporter = role === 'STAFF' || role === 'MANAGER';
  const reviewer = can(user, APPROVERS);
  const pending = useApi<PendingUpdate[]>(reviewer ? '/targets/pending-updates' : null);
  const submissions = useApi<Submission[]>(reporter ? `/targets/my-submissions?year=${data.year}` : null);

  const known = useMemo(() => new Map([...data.myTargets, ...data.needReport].map(target => [target.id, target as TargetBrief & { pendingReport?: boolean }])), [data]);
  const openRejected = data.rejectedReports.filter(report => {
    const target = known.get(report.target.id);
    if (!target) return true;
    if (target.pendingReport) return false;
    return !(target.lastReportedAt && report.reviewedAt && new Date(target.lastReportedAt) > new Date(report.reviewedAt));
  });

  const tabs = [
    {
      key: 'bao-cao',
      label: 'Cần báo cáo',
      count: data.needReport.length,
      hot: data.needReport.some(target => target.missingPeriods.length > 0 && !target.pendingReport),
      show: reporter || data.needReport.length > 0,
      work: true,
      children: (
        <Table
          rowKey="id"
          dataSource={data.needReport}
          pagination={data.needReport.length > 20 ? { pageSize: 20 } : false}
          scroll={{ x: 900 }}
          locale={{ emptyText: 'Không có chỉ tiêu cần báo cáo' }}
          columns={[
            { title: 'Chỉ tiêu', key: 'title', sorter: byText(target => target.code), render: (_, target) => targetTitle(target) },
            {
              title: 'Kỳ cần báo cáo',
              key: 'periods',
              width: 280,
              sorter: byNumber(target => target.missingPeriods.length),
              sortDirections: NUMBER_FIRST,
              defaultSortOrder: 'descend',
              render: (_, target) => (
                <Space size={4} wrap>
                  {target.pendingReport && <Tag color="gold">Có báo cáo chờ duyệt</Tag>}
                  {target.missingPeriods.map(label => (
                    <Tag key={label} color="red">
                      {label}
                    </Tag>
                  ))}
                  {!target.missingPeriods.length && !target.pendingReport && <Tag>{target.currentPeriod}</Tag>}
                </Space>
              ),
            },
            { title: 'Hiện tại', key: 'value', width: 170, align: 'right', sorter: byNumber(target => target.currentValue), sortDirections: NUMBER_FIRST, render: (_, target) => <span className="num">{plan(target)}</span> },
            { title: 'Tình trạng', key: 'status', width: 130, sorter: byRank(TARGET_STATUS_RANK, target => target.status), render: (_, target) => <StatusTag status={target.status} /> },
            {
              key: 'action',
              width: 110,
              fixed: 'right',
              render: (_, target) =>
                target.pendingReport ? (
                  <Link to={`/admin/targets/${target.id}`}>
                    <Button size="small">Xem hồ sơ</Button>
                  </Link>
                ) : (
                  <Link to={`/admin/targets/${target.id}?bao-cao=${target.missingPeriodKeys?.[0] ?? target.currentPeriodKey ?? 1}`}>
                    <Button size="small" type="primary">
                      Báo cáo
                    </Button>
                  </Link>
                ),
            },
          ]}
        />
      ),
    },
    {
      key: 'tra-lai',
      label: 'Bị trả lại',
      count: openRejected.length,
      hot: openRejected.length > 0,
      show: reporter || data.rejectedReports.length > 0,
      work: true,
      children: (
        <Table
          rowKey="id"
          dataSource={openRejected}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{ emptyText: 'Không có báo cáo bị trả lại' }}
          columns={[
            { title: 'Chỉ tiêu', key: 'title', sorter: byText(report => report.target.code), render: (_, report) => targetTitle(report.target) },
            { title: 'Giá trị đã gửi', dataIndex: 'value', width: 130, align: 'right', sorter: byNumber(report => report.value), sortDirections: NUMBER_FIRST, render: value => <span className="num">{num(value)}</span> },
            { title: 'Lý do trả lại', dataIndex: 'reviewNote', render: value => <span className="tone-bad">{value || '—'}</span> },
            { title: 'Lúc', dataIndex: 'reviewedAt', width: 130, sorter: byDate(report => report.reviewedAt), defaultSortOrder: 'descend', render: value => <Tooltip title={dateTime(value)}>{fromNow(value)}</Tooltip> },
            {
              key: 'action',
              width: 120,
              fixed: 'right',
              render: (_, report) => (
                <Link to={`/admin/targets/${report.target.id}?bao-cao=1`}>
                  <Button size="small" type="primary">
                    Báo cáo lại
                  </Button>
                </Link>
              ),
            },
          ]}
        />
      ),
    },
    {
      key: 'cho-duyet',
      label: 'Chờ tôi duyệt',
      count: pending.data ? pending.data.filter(row => row.canReview).length : data.toReview.length,
      hot: (pending.data ?? []).some(row => row.canReview && row.autoApproveAt && msUntil(row.autoApproveAt) <= 2 * DAY),
      show: reviewer,
      work: true,
      children: <PendingReviews rows={(pending.data ?? []).filter(row => row.canReview)} loading={pending.isLoading} />,
    },
    {
      key: 'de-xuat',
      label: 'Đề xuất chờ xử lý',
      count: data.proposals.length,
      hot: data.proposals.some(item => item.autoApproveAt && msUntil(item.autoApproveAt) <= 2 * DAY),
      show: can(user, FRAMEWORK_EDITORS) || role === 'MANAGER',
      work: true,
      children: (
        <Table
          rowKey="id"
          dataSource={data.proposals}
          pagination={false}
          scroll={{ x: 820 }}
          locale={{ emptyText: 'Không có đề xuất chờ xử lý' }}
          columns={[
            {
              title: 'Đề xuất',
              key: 'name',
              sorter: byText(item => item.name),
              render: (_, item) => (
                <TitleCell
                  title={item.name}
                  sub={[item.origin === 'AI' ? 'AI trích xuất' : 'Cán bộ đề xuất', item.document?.code, item.responsibleDepartment?.name].filter(Boolean).join(' · ')}
                  to={`/admin/proposals?id=${item.id}`}
                />
              ),
            },
            { title: 'Trạng thái', dataIndex: 'status', width: 130, sorter: byRank(PROPOSAL_RANK, item => item.status), render: value => <Tag color={PROPOSAL_STATUS[value]?.color}>{PROPOSAL_STATUS[value]?.label ?? value}</Tag> },
            { title: 'Tự thông qua', key: 'auto', width: 140, sorter: byDate(item => item.autoApproveAt), defaultSortOrder: 'ascend', render: (_, item) => <Countdown at={item.autoApproveAt} /> },
            { title: 'Tạo lúc', dataIndex: 'createdAt', width: 140, sorter: byDate(item => item.createdAt), render: value => <Tooltip title={dateTime(value)}>{fromNow(value)}</Tooltip> },
          ]}
        />
      ),
    },
    {
      key: 'giai-trinh',
      label: 'Giải trình',
      count: data.explanations.length,
      hot: data.explanations.length > 0,
      show: reporter || data.explanations.length > 0,
      work: true,
      children: (
        <Table
          rowKey={target => target.request.id}
          dataSource={data.explanations}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{ emptyText: 'Không có yêu cầu giải trình' }}
          columns={[
            { title: 'Chỉ tiêu', key: 'title', width: 320, sorter: byText(target => target.code), render: (_, target) => targetTitle(target) },
            { title: 'Nội dung yêu cầu', key: 'message', render: (_, target) => target.request.message },
            { title: 'Hạn trả lời', key: 'due', width: 140, sorter: byDate(target => target.request.dueAt), defaultSortOrder: 'ascend', render: (_, target) => <Countdown at={target.request.dueAt} soon={DAY} /> },
            {
              key: 'action',
              width: 110,
              fixed: 'right',
              render: (_, target) => (
                <Link to={`/admin/targets/${target.id}`}>
                  <Button size="small" type="primary">
                    Trả lời
                  </Button>
                </Link>
              ),
            },
          ]}
        />
      ),
    },
    {
      key: 'chua-giao',
      label: 'Chưa giao người',
      count: data.unassigned.length,
      hot: false,
      show: can(user, SUPERVISORS),
      work: true,
      children: (
        <Table
          rowKey="id"
          dataSource={data.unassigned}
          pagination={data.unassigned.length > 20 ? { pageSize: 20 } : false}
          scroll={{ x: 760 }}
          locale={{ emptyText: 'Mọi chỉ tiêu đã có người phụ trách' }}
          columns={[
            { title: 'Chỉ tiêu', key: 'title', sorter: byText(target => target.code), render: (_, target) => targetTitle(target) },
            ...(isGlobal(user) ? [{ title: 'Phòng', key: 'dept', width: 220, sorter: byText<TargetBrief>(target => target.departmentName), render: (_: unknown, target: TargetBrief) => <DeptTag name={target.departmentName} color={target.departmentColor} /> }] : []),
            { title: 'Hạn', dataIndex: 'dueDate', width: 120, sorter: byDate(target => target.dueDate), defaultSortOrder: 'ascend', render: value => date(value) },
            {
              key: 'action',
              width: 100,
              fixed: 'right',
              render: (_, target) => (
                <Link to={`/admin/targets/${target.id}`}>
                  <Button size="small">Giao việc</Button>
                </Link>
              ),
            },
          ]}
        />
      ),
    },
    {
      key: 'chi-tieu',
      label: 'Chỉ tiêu của tôi',
      count: data.myTargets.length,
      hot: false,
      show: reporter,
      work: false,
      children: (
        <Table
          rowKey="id"
          dataSource={data.myTargets}
          pagination={data.myTargets.length > 20 ? { pageSize: 20 } : false}
          scroll={{ x: 860 }}
          locale={{ emptyText: 'Chưa được giao chỉ tiêu nào' }}
          columns={[
            { title: 'Chỉ tiêu', key: 'title', sorter: byText(target => target.code), render: (_, target) => targetTitle(target) },
            { title: 'Hiện tại', key: 'value', width: 170, align: 'right', sorter: byNumber(target => target.currentValue), sortDirections: NUMBER_FIRST, render: (_, target) => <span className="num">{plan(target)}</span> },
            { title: 'Tiến độ', key: 'progress', width: 150, sorter: byNumber(target => (target.kind === 'STAT' ? null : target.progress)), sortDirections: NUMBER_FIRST, render: (_, target) => (target.kind === 'STAT' ? <span className="muted">—</span> : <ProgressCell value={target.progress} status={target.status} />) },
            { title: 'Tình trạng', key: 'status', width: 130, sorter: byRank(TARGET_STATUS_RANK, target => target.status), defaultSortOrder: 'ascend', render: (_, target) => <StatusTag status={target.status} /> },
            { title: 'Báo cáo gần nhất', dataIndex: 'lastReportedAt', width: 150, sorter: byDate(target => target.lastReportedAt), render: value => (value ? <Tooltip title={dateTime(value)}>{fromNow(value)}</Tooltip> : <span className="muted">Chưa có</span>) },
          ]}
        />
      ),
    },
    {
      key: 'da-gui',
      label: 'Báo cáo đã gửi',
      count: submissions.data?.length ?? 0,
      hot: false,
      show: reporter,
      work: false,
      children: (
        <Table
          rowKey="id"
          loading={submissions.isLoading}
          dataSource={submissions.data ?? []}
          pagination={(submissions.data?.length ?? 0) > 20 ? { pageSize: 20 } : false}
          scroll={{ x: 860 }}
          locale={{ emptyText: 'Chưa gửi báo cáo nào' }}
          columns={[
            { title: 'Chỉ tiêu', key: 'title', sorter: byText(row => row.target.code), render: (_, row) => targetTitle(row.target, row.periodKey ? periodLabel(row.periodKey) : undefined) },
            { title: 'Giá trị', key: 'value', width: 140, align: 'right', sorter: byNumber(row => row.value), sortDirections: NUMBER_FIRST, render: (_, row) => <span className="num">{row.valueText || `${num(row.value)} ${row.target.unit}`}</span> },
            { title: 'Kết quả', key: 'status', width: 130, sorter: byRank(REVIEW_RANK, row => row.reviewStatus), render: (_, row) => <ReviewTag status={row.reviewStatus} auto={row.autoApproved} /> },
            { title: 'Ghi chú duyệt', dataIndex: 'reviewNote', render: (value, row) => value || (row.reviewer ? row.reviewer.fullName : <span className="muted">—</span>) },
            { title: 'Gửi lúc', dataIndex: 'createdAt', width: 150, sorter: byDate(row => row.createdAt), defaultSortOrder: 'descend', render: value => dateTime(value) },
          ]}
        />
      ),
    },
    {
      key: 'de-xuat-cua-toi',
      label: 'Đề xuất của tôi',
      count: data.myProposals.length,
      hot: false,
      show: reporter || role === 'CLERK' || data.myProposals.length > 0,
      work: false,
      children: (
        <Table
          rowKey="id"
          dataSource={data.myProposals}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{ emptyText: 'Chưa có đề xuất' }}
          columns={[
            { title: 'Đề xuất', key: 'name', sorter: byText(item => item.name), render: (_, item) => <TitleCell title={item.name} sub={fromNow(item.createdAt)} to={`/admin/proposals?id=${item.id}`} /> },
            { title: 'Trạng thái', dataIndex: 'status', width: 130, sorter: byRank(PROPOSAL_RANK, item => item.status), defaultSortOrder: 'ascend', render: value => <Tag color={PROPOSAL_STATUS[value]?.color}>{PROPOSAL_STATUS[value]?.label ?? value}</Tag> },
            {
              title: 'Kết quả',
              key: 'result',
              render: (_, item) =>
                item.createdTarget ? (
                  <Link to={`/admin/targets/${item.createdTarget.id}`}>Đã tạo {item.createdTarget.code}</Link>
                ) : item.reviewNote ? (
                  <span className="tone-bad">{item.reviewNote}</span>
                ) : item.autoApproveAt ? (
                  <Countdown at={item.autoApproveAt} />
                ) : (
                  <span className="muted">—</span>
                ),
            },
          ]}
        />
      ),
    },
  ].filter(tab => tab.show);

  const workTotal = tabs.filter(tab => tab.work).reduce((sum, tab) => sum + tab.count, 0);
  const requested = params.get('tab');
  const active = tabs.find(tab => tab.key === requested) ?? tabs.find(tab => tab.work && tab.count > 0) ?? tabs.find(tab => tab.count > 0) ?? tabs[0];

  if (!tabs.length) return <Result status="success" title="Không có việc cần xử lý" />;

  return (
    <>
      {workTotal === 0 && <Result status="success" title="Đã xử lý hết việc" style={{ padding: '24px 0 8px' }} />}
      <Card className={`card-flush ${screens.lg ? 'work-tabs' : 'card-tabs'}`}>
        <Tabs
          activeKey={active.key}
          tabPlacement={screens.lg ? 'start' : 'top'}
          onChange={key => setParams({ tab: key }, { replace: true })}
          items={tabs.map(tab => ({
            key: tab.key,
            label: (
              <span className="work-tab">
                <span>{tab.label}</span>
                <Badge count={tab.count} showZero color={tab.hot ? undefined : tab.count ? '#8a93a2' : '#c5cad3'} size="small" overflowCount={999} />
              </span>
            ),
            children: tab.children,
          }))}
        />
      </Card>
    </>
  );
}

export default function MyWork() {
  const work = useApi<MyWorkData>('/my-work', { refetchInterval: 120_000 });
  return (
    <Page
      title="Việc của tôi"
      meta={work.data && <span>Cập nhật {dateTime(work.data.generatedAt)}</span>}
      extra={
        <Tooltip title="Tải lại">
          <Button icon={<ReloadOutlined spin={work.isFetching} />} onClick={() => void work.refetch()} aria-label="Tải lại" />
        </Tooltip>
      }
    >
      <Query query={work} skeleton={<PageSkeleton />}>
        {data => <Content data={data} />}
      </Query>
    </Page>
  );
}
