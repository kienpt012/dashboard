import { BellOutlined, CopyOutlined, DownOutlined, FileSearchOutlined, ReloadOutlined, SendOutlined, SolutionOutlined, SwapOutlined, UndoOutlined, UserAddOutlined } from '@ant-design/icons';
import { Alert, App, Badge, Button, Card, Col, Dropdown, Flex, Progress, Result, Row, Space, Tabs, Tag, Tooltip, Typography, type MenuProps } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMe } from '@/app/session';
import { Page } from '@/components/Page';
import { LoadError, PageSkeleton } from '@/components/States';
import { DeptTag, KindTag, StatusTag, STATUS } from '@/components/Tags';
import { useApi } from '@/hooks/useApi';
import { ApiError, http } from '@/lib/api';
import { date, dateTime, num, until } from '@/lib/format';
import { frequencyLabel, periodLabel } from '@/lib/periods';
import type { TargetStatusKey } from '@/types/domain';
import { DossierContext, useDossier, useDossierRun, type DossierData } from './context';
import { DirectivesTab } from './Directives';
import { EvaluationModal, EvaluationsTab } from './Evaluations';
import { ExecutionTab, ReportModal, valueText } from './Execution';
import { BasisCard, ExplanationRequestModal, ExplanationsCard, PeopleModal, ResponsibilityCard, SourceCard, TimelineTab, type PeopleAction } from './Side';
import './dossier.css';

const ISSUING: Record<string, string> = { CENTRAL: 'Trung ương giao', PROVINCE: 'Tỉnh/Thành phố giao', LOCAL: 'Địa phương tự đặt' };
const TABS = ['thuc-hien', 'chi-dao', 'danh-gia', 'lich-su'] as const;
type TabKey = (typeof TABS)[number];

function Figures() {
  const { d } = useDossier();
  const stat = d.kind === 'STAT';
  const reported = Boolean(d.lastReportedAt);
  const manual = d.valueSource === 'MANUAL';
  const color = STATUS[d.status as TargetStatusKey]?.hex;
  return (
    <Card className="figures">
      <div className="figure-row">
        <div className="figure">
          <span className="figure-label">Chỉ tiêu giao</span>
          <span className="figure-value">{stat ? 'Theo dõi số liệu' : d.targetText || valueText(d.targetValue, d.unit)}</span>
          <span className="figure-foot">{stat ? 'Chỉ tiêu thống kê' : d.direction === 'LOWER_IS_BETTER' ? 'Càng thấp càng tốt' : 'Càng cao càng tốt'}</span>
        </div>
        <div className="figure">
          <span className="figure-label">Thực hiện</span>
          <span className="figure-value">{reported ? valueText(d.currentValue, d.unit) : <span className="muted">Chưa có số liệu</span>}</span>
          <span className="figure-foot">{reported ? `${manual ? 'Cập nhật' : 'Tự tính'} ${dateTime(!manual && d.computedAt ? d.computedAt : d.lastReportedAt)}` : manual ? 'Chưa có báo cáo được duyệt' : 'Chưa tính được'}</span>
        </div>
        {!stat && (
          <div className="figure">
            <span className="figure-label">Tiến độ</span>
            <span className="figure-value">{reported ? `${num(d.progress)}%` : '—'}</span>
            <Progress percent={Math.max(0, Math.min(100, d.progress))} showInfo={false} size="small" strokeColor={color} />
          </div>
        )}
        {d.kind === 'SCORE' && (
          <div className="figure">
            <span className="figure-label">Điểm</span>
            <span className="figure-value">
              {reported ? num(d.currentValue) : '—'}
              <small> / {num(d.maxScore ?? d.targetValue)}</small>
            </span>
            <span className="figure-foot">{d.framework?.maxScore ? `Bộ chỉ tiêu tối đa ${num(d.framework.maxScore)} điểm` : 'điểm'}</span>
          </div>
        )}
        <div className="figure">
          <span className="figure-label">Hạn hoàn thành</span>
          <span className="figure-value">{date(d.dueDate)}</span>
          <span className="figure-foot">{d.status === 'COMPLETED' ? 'Đã hoàn thành' : until(d.dueDate)}</span>
        </div>
        <div className="figure">
          <span className="figure-label">Kỳ báo cáo</span>
          <span className="figure-value">{frequencyLabel[d.frequency]}</span>
          <span className="figure-foot">{manual ? `Kỳ hiện tại: ${periodLabel(d.currentPeriodKey)}` : 'Hệ thống tự cập nhật'}</span>
        </div>
      </div>
    </Card>
  );
}

function DossierView({ d }: { d: DossierData }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const run = useDossierRun();
  const hash = location.hash.replace('#', '') as TabKey;
  const tab: TabKey = TABS.includes(hash) ? hash : 'thuc-hien';
  const [reporting, setReporting] = useState<{ period?: string } | null>(null);
  const [evaluating, setEvaluating] = useState<{ period?: string } | null>(null);
  const [people, setPeople] = useState<PeopleAction | null>(null);
  const [explaining, setExplaining] = useState(false);
  const p = d.permissions;
  const canReport = d.valueSource === 'MANUAL' && p.canReport && !d.isArchived;
  const [params, setParams] = useSearchParams();

  // Mở sẵn biểu mẫu báo cáo khi đi từ "Việc của tôi" (?bao-cao=kỳ).
  useEffect(() => {
    const preset = params.get('bao-cao');
    if (!preset) return;
    if (canReport) setReporting({ period: preset === '1' ? undefined : preset });
    const next = new URLSearchParams(params);
    next.delete('bao-cao');
    setParams(next, { replace: true });
  }, [params, setParams, canReport]);

  async function remind() {
    const result = await run(() => http.post<{ sent: number; message: string }>(`/targets/${d.id}/remind`));
    if (result) {
      if (result.sent) message.success(d.assignee ? `Đã nhắc ${d.assignee.fullName}` : 'Đã nhắc trưởng phòng chủ trì');
      else message.info(result.message);
    }
  }

  const more: MenuProps['items'] = [
    ...(p.canAssign ? [{ key: 'assign', icon: <UserAddOutlined />, label: d.assignee ? 'Giao lại' : 'Giao chuyên viên', onClick: () => setPeople('assign') }] : []),
    ...(p.canTransfer ? [{ key: 'transfer', icon: <SwapOutlined />, label: 'Chuyển đồng nghiệp', onClick: () => setPeople('transfer') }] : []),
    ...(p.canReturn ? [{ key: 'return', icon: <UndoOutlined />, label: 'Trả về trưởng phòng', onClick: () => setPeople('return') }] : []),
    ...(p.canAssign ? [{ key: 'remind', icon: <BellOutlined />, label: 'Nhắc việc', onClick: () => void remind() }] : []),
    ...(p.canRequestExplanation && !d.explanationRequests.some(item => item.status === 'OPEN') ? [{ key: 'explain', icon: <FileSearchOutlined />, label: 'Yêu cầu giải trình', onClick: () => setExplaining(true) }] : []),
  ];

  const crumbs = [
    { label: 'Danh mục chỉ tiêu', to: '/admin/targets' },
    ...(d.framework ? [{ label: d.framework.name, to: `/admin/targets?frameworkId=${d.framework.id}&year=${d.year}` }] : []),
    ...(d.parent ? [{ label: d.parent.code, to: `/admin/targets/${d.parent.id}` }] : []),
    { label: d.code },
  ];

  const done = (value: boolean) => <Badge status={value ? 'success' : 'default'} />;

  return (
    <Page
      breadcrumb={crumbs}
      title={d.title}
      meta={
        <>
          <Typography.Text copyable={{ text: d.code, icon: <CopyOutlined />, tooltips: ['Chép mã', 'Đã chép'] }} className="num">
            {d.code}
          </Typography.Text>
          {d.standardCode && <span>Mã {d.standardCode}</span>}
          {d.ordinal && <span>STT {d.ordinal}</span>}
          <DeptTag name={d.department.name} color={d.department.color} />
          <span>{ISSUING[d.issuingLevel] ?? d.issuingLevel}</span>
          <Space size={6}>
            <KindTag kind={d.kind} />
            <StatusTag status={d.status} />
            {d.valueSource === 'COMPUTED' && <Tag color="cyan">Tự tính</Tag>}
            {d.valueSource === 'CHILDREN' && <Tag color="blue">Tổng hợp từ chỉ tiêu con</Tag>}
            {d.isArchived && <Tag color="orange">Đã lưu trữ</Tag>}
          </Space>
        </>
      }
      extra={
        <>
          {more.length > 0 && !d.isArchived && (
            <Dropdown menu={{ items: more }} trigger={['click']} placement="bottomRight">
              <Button>
                Thao tác <DownOutlined />
              </Button>
            </Dropdown>
          )}
          {p.canEvaluate && !d.isArchived && (
            <Button icon={<SolutionOutlined />} onClick={() => setEvaluating({})}>
              Đánh giá
            </Button>
          )}
          {canReport && (
            <Button type="primary" icon={<SendOutlined />} onClick={() => setReporting({})}>
              Báo cáo số liệu
            </Button>
          )}
        </>
      }
    >
      {d.isArchived && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          title={`Đã lưu trữ${d.archivedAt ? ` ngày ${date(d.archivedAt)}` : ''}${d.archiveReason ? `: ${d.archiveReason}` : ''}`}
        />
      )}
      <Figures />
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={16}>
          <Card className="card-tabs dossier-tabs">
            <Tabs
              activeKey={tab}
              onChange={key => navigate({ hash: key }, { replace: true })}
              items={[
                {
                  key: 'thuc-hien',
                  label: (
                    <Space size={6}>
                      {done(d.completeness.execution)}Thực hiện
                    </Space>
                  ),
                  children: <ExecutionTab onReport={period => setReporting({ period })} />,
                },
                {
                  key: 'chi-dao',
                  label: (
                    <Space size={6}>
                      {done(d.completeness.directive)}Chỉ đạo điều hành
                    </Space>
                  ),
                  children: <DirectivesTab />,
                },
                {
                  key: 'danh-gia',
                  label: (
                    <Space size={6}>
                      {done(d.completeness.evaluation)}Đánh giá
                    </Space>
                  ),
                  children: <EvaluationsTab onEvaluate={period => setEvaluating({ period })} />,
                },
                { key: 'lich-su', label: `Dòng thời gian (${d.workEvents.length})`, children: <TimelineTab /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Flex vertical gap={16}>
            <ResponsibilityCard onAction={setPeople} />
            <ExplanationsCard onRequest={() => setExplaining(true)} />
            <SourceCard />
            <BasisCard />
          </Flex>
        </Col>
      </Row>

      <ReportModal open={Boolean(reporting)} presetPeriod={reporting?.period} onClose={() => setReporting(null)} />
      <EvaluationModal open={Boolean(evaluating)} presetPeriod={evaluating?.period} onClose={() => setEvaluating(null)} />
      <PeopleModal action={people} onClose={() => setPeople(null)} />
      <ExplanationRequestModal open={explaining} onClose={() => setExplaining(false)} />
    </Page>
  );
}

export default function Dossier() {
  const { id = '' } = useParams();
  const me = useMe();
  const query = useApi<DossierData>(`/targets/${id}/dossier`);

  if (query.data) {
    return (
      <DossierContext.Provider value={{ d: query.data, me, refresh: async () => void (await query.refetch()) }}>
        <DossierView d={query.data} />
        {query.isFetching && (
          <Tooltip title="Đang tải lại">
            <ReloadOutlined spin className="dossier-refreshing" />
          </Tooltip>
        )}
      </DossierContext.Provider>
    );
  }
  if (query.error) {
    const missing = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 403);
    return missing ? (
      <Result
        status="404"
        title="Không tìm thấy chỉ tiêu"
        subTitle="Chỉ tiêu không tồn tại hoặc thuộc phòng ngoài phạm vi của bạn."
        extra={
          <Link to="/admin/targets">
            <Button>Về danh mục chỉ tiêu</Button>
          </Link>
        }
      />
    ) : (
      <LoadError error={query.error} retry={() => void query.refetch()} />
    );
  }
  return <PageSkeleton />;
}
