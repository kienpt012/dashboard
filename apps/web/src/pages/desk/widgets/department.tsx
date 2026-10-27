import { CheckCircleOutlined, ClockCircleOutlined, FieldTimeOutlined, FileDoneOutlined, MessageOutlined, NotificationOutlined, QuestionCircleOutlined, RobotOutlined, SendOutlined, TeamOutlined } from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMe } from '@/app/session';
import { Chart, type ChartOption } from '@/components/Chart';
import { DistBar } from '@/components/Data';
import { STATUS, STATUS_ORDER } from '@/components/Tags';
import { ALERT_KINDS, alertLink, alertWhen, DETAIL_KINDS } from '@/lib/alerts';
import { dateTime, fromNow, num, pct, until, vn } from '@/lib/format';
import { APPROVERS, can, initials, roleLabel, SUPERVISORS } from '@/lib/roles';
import type { AlertItem, TargetStatusKey } from '@/types/domain';
import { FEEDBACK_STATUS } from '../../feedback/labels';
import type { Deadline, DeadlineKind, DepartmentSnapshot } from '../types';
import { useSettings, useWidget } from './context';
import { filterAlerts, groupDeadlines } from './logic';
import { DepartmentGate, MoreLink, Note, Row, scopeQuery } from './parts';

// Widget số liệu phòng (nhóm "Dữ liệu phòng"): cùng một gói số liệu, mỗi widget một góc nhìn. Số liệu khớp Trung tâm
// điều hành của cùng phòng; bấm vào số hoặc dòng mở đúng danh mục đã lọc.

/* ───────────── Tình trạng chỉ tiêu ───────────── */

function StatusBody({ data }: { data: DepartmentSnapshot }) {
  const navigate = useNavigate();
  const t = data.totals;
  const counts: Record<TargetStatusKey, number> = { COMPLETED: t.completed, ON_TRACK: t.onTrack, AT_RISK: t.atRisk, OVERDUE: t.overdue, NOT_STARTED: t.notStarted };
  const scope = scopeQuery(data);
  const option = useMemo<ChartOption>(
    () => ({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [
        {
          type: 'pie',
          radius: ['66%', '92%'],
          avoidLabelOverlap: false,
          padAngle: 1.2,
          itemStyle: { borderRadius: 3 },
          label: { show: false },
          emphasis: { scale: true, scaleSize: 3 },
          data: STATUS_ORDER.map(key => ({ name: STATUS[key].label, value: counts[key], itemStyle: { color: STATUS[key].hex } })),
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t.completed, t.onTrack, t.atRisk, t.overdue, t.notStarted],
  );
  if (!t.targets) return <Note icon={<QuestionCircleOutlined />}>Phòng chưa có chỉ tiêu năm {data.year}</Note>;
  return (
    <div className="dws-status">
      <div className="dws-donut">
        <Chart
          option={option}
          style={{ height: '100%' }}
          onClick={params => {
            const key = STATUS_ORDER.find(item => STATUS[item].label === params.name);
            if (key) navigate(`/admin/targets?status=${key}&${scope}`);
          }}
        />
        <div className="dws-donut-center">
          <strong>{pct(t.progress)}</strong>
          <span>tiến độ chung</span>
        </div>
      </div>
      <div className="dws-legend">
        {STATUS_ORDER.map(key => (
          <Link key={key} to={`/admin/targets?status=${key}&${scope}`} className={`dws-legend-row${counts[key] ? '' : ' zero'}`}>
            <span>
              <i style={{ background: STATUS[key].hex }} />
              {STATUS[key].label}
            </span>
            <b>{num(counts[key])}</b>
          </Link>
        ))}
        <Link to={`/admin/targets?${scope}`} className="dws-legend-row total">
          <span>Tổng số chỉ tiêu</span>
          <b>{num(t.targets)}</b>
        </Link>
      </div>
    </div>
  );
}

export function DeptStatus() {
  return <DepartmentGate>{data => <StatusBody data={data} />}</DepartmentGate>;
}

/* ───────────── Việc cần xử lý ───────────── */

function Tile({ label, value, foot, to, tone }: { label: string; value: React.ReactNode; foot?: React.ReactNode; to?: string; tone?: 'warn' | 'bad' }) {
  const body = (
    <>
      <span className="dws-tile-label" title={label}>
        {label}
      </span>
      <span className="dws-tile-line">
        <span className={`dws-tile-value${tone ? ` tone-${tone}` : ''}`}>{value}</span>
        {foot && <span className="dws-tile-foot">{foot}</span>}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="dws-tile">
      {body}
    </Link>
  ) : (
    <div className="dws-tile">{body}</div>
  );
}

function WorkloadBody({ data }: { data: DepartmentSnapshot }) {
  const user = useMe();
  const t = data.totals;
  const scope = scopeQuery(data);
  return (
    <div className="dws-tiles">
      <Tile label="Thiếu báo cáo kỳ" value={num(t.missingReports)} tone={t.missingReports ? 'warn' : undefined} to="/admin/viec-cua-toi?tab=bao-cao" />
      <Tile label="Chưa giao người" value={num(t.unassigned)} tone={t.unassigned ? 'warn' : undefined} to={`/admin/targets?assignee=none&${scope}`} />
      <Tile
        label="Báo cáo chờ duyệt"
        value={num(t.pendingReports)}
        foot={t.pendingReports ? `lâu nhất ${num(t.oldestPendingDays)} ngày` : undefined}
        tone={t.oldestPendingDays >= 3 ? 'bad' : t.pendingReports ? 'warn' : undefined}
        to={can(user, APPROVERS) ? '/admin/approvals' : undefined}
      />
      <Tile label="Đề xuất chờ duyệt" value={num(t.pendingProposals)} tone={t.pendingProposals ? 'warn' : undefined} to="/admin/proposals?status=SUBMITTED" />
      <Tile label="Giải trình đang mở" value={num(t.openExplanations)} tone={t.openExplanations ? 'warn' : undefined} to={can(user, SUPERVISORS) ? '/admin/trach-nhiem' : undefined} />
      <Tile label="Việc bị treo" value={num(t.stalled)} tone={t.stalled ? 'bad' : undefined} />
      <Tile label="Phản ánh quá hạn" value={num(t.feedbackOverdue)} foot={`${num(t.feedbackOpen)} đang xử lý`} tone={t.feedbackOverdue ? 'bad' : undefined} to="/admin/feedback" />
      <Tile
        label="Thống kê có số liệu"
        value={
          <>
            {num(t.statReported)}
            <small> / {num(t.statTotal)}</small>
          </>
        }
        to={`/admin/targets?kind=STAT&${scope}`}
      />
    </div>
  );
}

export function DeptWorkload() {
  return <DepartmentGate>{data => <WorkloadBody data={data} />}</DepartmentGate>;
}

/* ───────────── Cảnh báo ───────────── */

type AlertSettings = { kinds: string[]; minSeverity: AlertItem['severity']; maxItems: number; compact: boolean };

function AlertsBody({ data }: { data: DepartmentSnapshot }) {
  const settings = useSettings<AlertSettings>();
  const { maximized } = useWidget();
  const [showAll, setShowAll] = useState(false);
  const list = filterAlerts(data.alerts, { kinds: settings.kinds ?? [], minSeverity: settings.minSeverity ?? 'info' });
  if (!list.length) return <Note icon={<CheckCircleOutlined />} tone="ok">Không có cảnh báo{settings.kinds?.length || settings.minSeverity !== 'info' ? ' theo bộ lọc' : ''}</Note>;
  const limit = maximized || showAll ? list.length : settings.maxItems ?? 12;
  return (
    <div className="wl">
      {list.slice(0, limit).map((alert, index) => (
        <Row
          key={`${alert.kind}-${alert.targetId ?? alert.candidateId ?? index}`}
          tone={alert.severity}
          compact={settings.compact && !maximized}
          title={alert.title}
          titleHint={alert.title}
          to={alertLink(alert, data.department.id)}
          meta={[ALERT_KINDS[alert.kind] ?? alert.kind, DETAIL_KINDS.has(alert.kind) ? alert.detail : null, alertWhen(alert)].filter(Boolean).join(' · ')}
          trail={settings.compact && !maximized ? <span className="wr-kind">{ALERT_KINDS[alert.kind] ?? alert.kind}</span> : undefined}
        />
      ))}
      {list.length > limit && <MoreLink onClick={() => setShowAll(true)}>Xem thêm {num(list.length - limit)} cảnh báo</MoreLink>}
    </div>
  );
}

export function DeptAlerts() {
  return <DepartmentGate>{data => <AlertsBody data={data} />}</DepartmentGate>;
}

/* ───────────── Dải cảnh báo chạy chữ ───────────── */

const TICKER_SPEED = { slow: 45, normal: 75, fast: 120 } as const;

function TickerBody({ data }: { data: DepartmentSnapshot }) {
  const settings = useSettings<{ minSeverity: AlertItem['severity']; speed: keyof typeof TICKER_SPEED }>();
  const list = filterAlerts(data.alerts, { kinds: [], minSeverity: settings.minSeverity ?? 'critical' });
  const track = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(30);
  const signature = list.map(alert => alert.title).join('|');

  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    // Nửa dải (một lượt nội dung) chạy hết trong thời gian tỉ lệ với độ dài, để tốc độ đọc không đổi theo số cảnh báo.
    setDuration(Math.max(12, element.scrollWidth / 2 / TICKER_SPEED[settings.speed ?? 'normal']));
  }, [signature, settings.speed]);

  if (!list.length) {
    return (
      <div className="dws-ticker calm">
        <CheckCircleOutlined /> Không có cảnh báo {settings.minSeverity === 'critical' ? 'nghiêm trọng' : 'mới'}
      </div>
    );
  }
  const items = list.map((alert, index) => {
    const to = alertLink(alert, data.department.id);
    const text = (
      <>
        <b>{ALERT_KINDS[alert.kind] ?? alert.kind}</b> {alert.title}
      </>
    );
    return (
      <span key={index} className={`dws-ticker-item ${alert.severity}`}>
        <i />
        {to ? <Link to={to}>{text}</Link> : text}
      </span>
    );
  });
  return (
    <div className="dws-ticker" aria-label={`${list.length} cảnh báo`}>
      <span className="dws-ticker-badge">
        <NotificationOutlined /> {num(list.length)}
      </span>
      <div className="dws-ticker-window">
        <div className="dws-ticker-track" ref={track} style={{ '--ticker-duration': `${duration}s` } as CSSProperties}>
          <span className="dws-ticker-run">{items}</span>
          <span className="dws-ticker-run" aria-hidden>
            {items}
          </span>
        </div>
      </div>
    </div>
  );
}

export function DeptTicker() {
  return <DepartmentGate>{data => <TickerBody data={data} />}</DepartmentGate>;
}

/* ───────────── Việc bị treo ───────────── */

export function DeptStalled() {
  return (
    <DepartmentGate>
      {data =>
        data.stalled.length ? (
          <div className="wl">
            {data.stalled.map(item => (
              <Row
                key={item.id}
                tone="critical"
                title={item.title}
                titleHint={`${item.code} · ${item.title}`}
                to={`/admin/targets/${item.id}`}
                meta={`${item.code} · ${item.reason}`}
                trail={item.bounceCount > 1 ? <Tooltip title="Số lần chuyển qua lại">{`${item.bounceCount} lần`}</Tooltip> : undefined}
              />
            ))}
          </div>
        ) : (
          <Note icon={<CheckCircleOutlined />} tone="ok">
            Không có việc bị treo
          </Note>
        )
      }
    </DepartmentGate>
  );
}

/* ───────────── Hoạt động gần đây ───────────── */

/** Việc do hệ thống tự làm (nhắc hạn, tự thông qua) hiện biểu tượng máy thay chữ viết tắt tên. */
const SYSTEM_ACTOR = /^hệ thống/i;

function RecentBody({ data }: { data: DepartmentSnapshot }) {
  const { maxItems = 10 } = useSettings<{ maxItems: number }>();
  const { maximized } = useWidget();
  if (!data.recent.length) return <Note icon={<ClockCircleOutlined />}>Chưa có hoạt động</Note>;
  const list = maximized ? data.recent : data.recent.slice(0, maxItems);
  return (
    <div className="wl dws-feed">
      {list.map(event => {
        const to = event.target ? `/admin/targets/${event.target.id}` : event.candidate ? `/admin/proposals?id=${event.candidate.id}` : undefined;
        const subject = event.target ? `${event.target.code} · ${event.target.title}` : event.candidate?.name;
        return (
          <div className="dws-event" key={event.id}>
            <span className={`dws-avatar${SYSTEM_ACTOR.test(event.actorName) ? ' system' : ''}`} aria-hidden>
              {SYSTEM_ACTOR.test(event.actorName) ? <RobotOutlined /> : initials(event.actorName)}
            </span>
            <div className="dws-event-body">
              <span>
                <b>{event.actorName}</b> {event.label.toLocaleLowerCase('vi')}
              </span>
              {subject &&
                (to ? (
                  <Link to={to} className="clamp-2" title={subject}>
                    {subject}
                  </Link>
                ) : (
                  <span className="clamp-2">{subject}</span>
                ))}
              <Tooltip title={dateTime(event.createdAt)}>
                <span className="wr-meta">
                  {fromNow(event.createdAt)}
                  {event.note ? ` · ${event.note}` : ''}
                </span>
              </Tooltip>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DeptRecent() {
  return <DepartmentGate>{data => <RecentBody data={data} />}</DepartmentGate>;
}

/* ───────────── Hạn sắp tới ───────────── */

const DEADLINE_ICON: Record<DeadlineKind, React.ReactNode> = {
  TARGET_DUE: <FieldTimeOutlined />,
  PERIOD_REPORT: <FileDoneOutlined />,
  EXPLANATION_DUE: <QuestionCircleOutlined />,
  PROPOSAL_AUTO_APPROVE: <SendOutlined />,
};

function DeadlinesBody({ data }: { data: DepartmentSnapshot }) {
  const { days = 30 } = useSettings<{ days: number }>();
  const groups = groupDeadlines(data.deadlines, days);
  if (!groups.length) return <Note icon={<CheckCircleOutlined />} tone="ok">Không có hạn nào trong {num(days)} ngày tới</Note>;
  return (
    <div className="dws-deadlines">
      {groups.map(group => (
        <section key={group.key} className={`dws-dgroup ${group.key}`}>
          <h4>
            {group.label} <span>{num(group.items.length)}</span>
          </h4>
          {group.items.map((item, index) => {
            const lines = deadlineLines(item);
            return (
              <Link key={`${item.kind}-${item.link}-${index}`} to={item.link} className="dws-deadline">
                <span className="dws-deadline-icon">{DEADLINE_ICON[item.kind]}</span>
                <span className="dws-deadline-main">
                  <span className="wr-title" title={item.title}>
                    {lines.title}
                  </span>
                  <span className="wr-meta" title={item.detail}>
                    {lines.meta}
                  </span>
                </span>
                <Tooltip title={dateTime(item.at)}>
                  <span className="dws-deadline-when">{group.key === 'today' || group.key === 'tomorrow' ? vn(item.at).format('HH:mm') : vn(item.at).format('DD/MM')}</span>
                </Tooltip>
              </Link>
            );
          })}
        </section>
      ))}
    </div>
  );
}

/** Dòng chính là việc phải làm ("Báo cáo Tháng 10/2026", tên chỉ tiêu…), mã chỉ tiêu xuống dòng phụ. */
function deadlineLines(item: Deadline): { title: string; meta: string } {
  const match = /^(\S+) · (.+)$/.exec(item.title);
  if (!match || item.kind === 'PROPOSAL_AUTO_APPROVE') return { title: item.title, meta: item.detail };
  const [, code, rest] = match;
  if (item.kind === 'TARGET_DUE') return { title: rest, meta: `${code} · hạn hoàn thành chỉ tiêu` };
  if (item.kind === 'EXPLANATION_DUE') return { title: 'Trả lời yêu cầu giải trình', meta: `${code} · ${item.detail}` };
  return { title: rest, meta: `${code} · ${item.detail}` };
}

export function DeptDeadlines() {
  return <DepartmentGate>{data => <DeadlinesBody data={data} />}</DepartmentGate>;
}

/* ───────────── Bộ chỉ tiêu ───────────── */

export function DeptFrameworks() {
  return (
    <DepartmentGate>
      {data =>
        data.frameworks.length ? (
          <div className="wl">
            {data.frameworks.map(framework => {
              const s = framework.summary;
              const score = framework.kind === 'SCORE' && s.score !== null;
              const value = framework.kind === 'STAT' ? (s.reported / Math.max(1, s.total)) * 100 : (s.progress ?? 0);
              return (
                <Link key={framework.id} to={`/admin/targets?frameworkId=${framework.id}&${scopeQuery(data)}`} className="dws-framework">
                  <span className="dws-framework-head">
                    <span className="wr-title" title={framework.name}>
                      {framework.name}
                    </span>
                    <b>{score ? `${num(s.score)} / ${num(s.maxScore ?? 100)} điểm` : pct(value)}</b>
                  </span>
                  <DistBar counts={s.counts} total={s.total} />
                  <span className="wr-meta">
                    {num(s.total)} chỉ tiêu
                    {framework.kind === 'STAT' ? ` · ${num(s.reported)} có số liệu` : ''}
                    {framework.missingReports ? <span className="tone-warn"> · {num(framework.missingReports)} thiếu báo cáo</span> : null}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <Note icon={<QuestionCircleOutlined />}>Phòng chưa có bộ chỉ tiêu năm {data.year}</Note>
        )
      }
    </DepartmentGate>
  );
}

/* ───────────── Nhân sự trong phòng ───────────── */

function TeamBody({ data }: { data: DepartmentSnapshot }) {
  if (!data.team.length) return <Note icon={<TeamOutlined />}>Phòng chưa có cán bộ</Note>;
  return (
    <div className="dws-team" role="table" aria-label="Nhân sự trong phòng">
      <div className="dws-team-row head" role="row">
        <span role="columnheader">Cán bộ</span>
        <span role="columnheader">Chỉ tiêu</span>
        <span role="columnheader">Thiếu BC</span>
        <span role="columnheader">Quá hạn</span>
      </div>
      {data.team.map(member => (
        <div key={member.userId} className="dws-team-row" role="row">
          <span className="dws-team-person" role="cell">
            <span className="dws-avatar" aria-hidden>
              {initials(member.fullName)}
            </span>
            <span className="dws-team-name">
              <b>{member.fullName}</b>
              <Tooltip title={member.lastLoginAt ? `Đăng nhập lúc ${dateTime(member.lastLoginAt)}` : undefined}>
                <span className="wr-meta">
                  {member.position || roleLabel[member.role as keyof typeof roleLabel] || member.role} · {member.lastLoginAt ? fromNow(member.lastLoginAt) : 'chưa đăng nhập'}
                </span>
              </Tooltip>
            </span>
          </span>
          <span role="cell" className="num">
            {num(member.targets)}
          </span>
          <span role="cell" className={`num${member.missingReports ? ' tone-warn' : ' muted'}`}>
            {num(member.missingReports)}
          </span>
          <span role="cell" className={`num${member.overdue ? ' tone-bad' : ' muted'}`}>
            {num(member.overdue)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DeptTeam() {
  return <DepartmentGate>{data => <TeamBody data={data} />}</DepartmentGate>;
}

/* ───────────── Phản ánh ───────────── */

function FeedbackBody({ data }: { data: DepartmentSnapshot }) {
  const counts = Object.entries(data.feedback.counts).filter(([, value]) => (value ?? 0) > 0) as [keyof typeof FEEDBACK_STATUS, number][];
  if (!counts.length && !data.feedback.latest.length) return <Note icon={<MessageOutlined />}>Phòng chưa có phản ánh</Note>;
  return (
    <div className="dws-feedback">
      <div className="dws-chips">
        {counts.map(([status, value]) => (
          <Tag key={status} color={FEEDBACK_STATUS[status]?.color} variant="filled">
            {FEEDBACK_STATUS[status]?.label ?? status} <b>{num(value)}</b>
          </Tag>
        ))}
      </div>
      <div className="wl">
        {data.feedback.latest.map(item => {
          const late = item.dueAt && new Date(item.dueAt).getTime() < Date.now();
          return (
            <Row
              key={item.id}
              tone={late ? 'critical' : undefined}
              title={item.title}
              titleHint={item.title}
              to={`/admin/feedback?id=${encodeURIComponent(item.id)}`}
              meta={`${item.code} · ${FEEDBACK_STATUS[item.status as keyof typeof FEEDBACK_STATUS]?.label ?? item.status} · ${fromNow(item.createdAt)}`}
              trail={item.dueAt ? <span className={late ? 'tone-bad' : undefined}>{late ? 'Quá hạn' : until(item.dueAt)}</span> : undefined}
            />
          );
        })}
      </div>
      <MoreLink to="/admin/feedback">Mở Phản ánh của phòng</MoreLink>
    </div>
  );
}

export function DeptFeedback() {
  return <DepartmentGate>{data => <FeedbackBody data={data} />}</DepartmentGate>;
}
