import { CheckOutlined, CloseOutlined, DownloadOutlined, EditOutlined, PauseCircleOutlined, RedoOutlined, RobotOutlined, SendOutlined, WarningOutlined } from '@ant-design/icons';
import { Alert, App, Badge, Button, Card, Col, Descriptions, Empty, Flex, Pagination, Progress, Result, Row, Segmented, Space, Tag, Tooltip, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMe } from '@/app/session';
import { Page } from '@/components/Page';
import { ReasonModal } from '@/components/ReasonModal';
import { ScrollBox } from '@/components/Scroll';
import { LoadError, PageSkeleton } from '@/components/States';
import { invalidate, useAction, useApi } from '@/hooks/useApi';
import { ApiError, errorText, http, saveBlob } from '@/lib/api';
import { date, dateTime, fileSize, fromNow, msUntil, num, pct, until } from '@/lib/format';
import { frequencyLabel } from '@/lib/periods';
import { can, WORKING } from '@/lib/roles';
import { documentTypeLabels, type DocumentTextResponse, type IndicatorCandidate, type SourceDocumentDetail } from '@/types/core';
import { ApproveModal, ProposalForm, type Proposal } from '../proposals/Proposals';
import { DOC_STATUS } from './Documents';
import { LegalBasis } from '@/components/LegalBasis';
import { LazyPdfViewer } from '@/components/pdf/LazyPdfViewer';
import type { Box } from '@/components/pdf/PdfViewer';

type Location = { pageNumber: number; box: Box | null; matchBox: Box | null; quote: string; score: number };

const STATUS: Record<string, { label: string; color: string }> = {
  PROPOSED: { label: 'Chưa trình', color: 'default' },
  SUBMITTED: { label: 'Chờ duyệt', color: 'gold' },
  APPROVED: { label: 'Đã duyệt', color: 'green' },
  REJECTED: { label: 'Từ chối', color: 'red' },
};

const JOB_LABEL: Record<string, string> = { DOCUMENT_PARSE: 'Đọc văn bản', INDICATOR_EXTRACT: 'Trích xuất chỉ tiêu' };
const JOB_STATUS: Record<string, string> = { PENDING: 'đang chờ', PROCESSING: 'đang chạy', COMPLETED: 'hoàn tất', FAILED: 'lỗi', DEAD_LETTER: 'lỗi, đã dừng thử lại', CANCELLED: 'đã dừng' };

/** Tô sáng đoạn trích dẫn ngay trên văn bản gốc (khoảng trắng/xuống dòng khác nhau vẫn khớp), giữ nguyên cách xuống dòng. */
function Highlighted({ text, quote }: { text: string; quote?: string | null }) {
  const words = (quote ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.join(' ').length < 8) return <>{text}</>;
  const pattern = new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'iu');
  const match = pattern.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      {text.slice(0, match.index)}
      <mark className="quote-mark">{match[0]}</mark>
      {text.slice(match.index + match[0].length)}
    </>
  );
}

function confidenceColor(value: number) {
  return value >= 0.8 ? 'green' : value >= 0.6 ? 'gold' : 'red';
}

function CandidateCard({ item, active, screen, onSelect, onEdit, onApprove, onReject }: { item: IndicatorCandidate; active: boolean; screen: boolean; onSelect: () => void; onEdit: () => void; onApprove: () => void; onReject: () => void }) {
  const submit = useAction(() => http.post(`/candidates/${item.id}/submit`, { expectedVersion: item.version }), { success: 'Đã trình đề xuất', refresh: ['/candidates', '/my-work', '/documents'] });
  const target = item.targetValue !== null && item.targetValue !== undefined ? `${num(item.targetValue)}${item.unit ? ` ${item.unit}` : ''}` : item.unit || '—';
  return (
    <div className={`candidate${active ? ' active' : ''}`} onClick={onSelect} role="button" tabIndex={0} onKeyDown={event => event.key === 'Enter' && onSelect()}>
      <Flex justify="space-between" gap={8} align="flex-start">
        <Typography.Text strong>{item.name}</Typography.Text>
        <Space size={4}>
          <Tag color={STATUS[item.status]?.color}>{item.autoApproved ? 'Tự thông qua' : STATUS[item.status]?.label}</Tag>
        </Space>
      </Flex>
      <Space size={[4, 4]} wrap style={{ margin: '6px 0' }}>
        <Tooltip title={item.extractionMethod === 'LLM' ? `Mô hình ${item.model ?? ''}` : 'Theo quy tắc'}>
          <Tag icon={<RobotOutlined />} color={confidenceColor(item.confidence)}>
            Tin cậy {pct(item.confidence * 100)}
          </Tag>
        </Tooltip>
        <Tag color={item.kind === 'PROGRESS_UPDATE' ? 'cyan' : 'geekblue'}>{item.kind === 'PROGRESS_UPDATE' ? 'Cập nhật số liệu' : 'Chỉ tiêu mới'}</Tag>
        {item.pageNumber && <Tag>Trang {item.pageNumber}</Tag>}
        {item.humanEdited && <Tag color="blue">Đã hiệu chỉnh</Tag>}
        {item.isDuplicateSuspect && (
          <Tag color="orange" icon={<WarningOutlined />}>
            Có thể trùng
          </Tag>
        )}
      </Space>
      <Descriptions
        size="small"
        column={2}
        colon={false}
        className="candidate-fields"
        items={[
          { label: 'Mục tiêu', children: target },
          { label: 'Năm', children: item.targetYear ?? '—' },
          ...(item.actualValue !== null && item.actualValue !== undefined ? [{ label: 'Thực hiện', children: `${num(item.actualValue)}${item.unit ? ` ${item.unit}` : ''}`, span: 2 }] : []),
          { label: 'Kỳ báo cáo', children: item.frequency ? frequencyLabel[item.frequency] : '—' },
          { label: 'Hạn', children: item.deadline ? date(item.deadline) : '—' },
          { label: 'Phòng chủ trì', children: item.responsibleDepartment?.name ?? item.responsibleDepartmentName ?? '—', span: 2 },
          ...(item.legalBasis ? [{ label: 'Căn cứ', children: <LegalBasis text={item.legalBasis} />, span: 2 }] : []),
        ]}
      />
      {item.warnings?.length ? <Alert type="warning" showIcon title={item.warnings.join('; ')} style={{ marginTop: 6 }} /> : null}
      {item.matchedTarget && (
        <div className="entry-meta" style={{ marginTop: 6 }}>
          Gần giống <Link to={`/admin/targets/${item.matchedTarget.id}`}>{item.matchedTarget.code}</Link> — {item.matchedTarget.title}
        </div>
      )}
      {item.createdTarget && (
        <div className="entry-meta" style={{ marginTop: 6 }}>
          Đã tạo chỉ tiêu <Link to={`/admin/targets/${item.createdTarget.id}`}>{item.createdTarget.code}</Link>
        </div>
      )}
      {item.status === 'SUBMITTED' && item.autoApproveAt && (
        <div className={`entry-meta${msUntil(item.autoApproveAt) <= 86_400_000 ? ' tone-bad' : ''}`} style={{ marginTop: 6 }}>
          Đã trình · tự thông qua {until(item.autoApproveAt)}
        </div>
      )}
      {(item.status === 'APPROVED' || item.status === 'REJECTED') && (item.reviewedBy || item.autoApproved) && (
        <div className="entry-meta" style={{ marginTop: 6 }}>
          {item.autoApproved ? 'Hệ thống tự thông qua' : `${item.status === 'APPROVED' ? 'Duyệt' : 'Từ chối'} bởi ${item.reviewedBy?.fullName}`}
          {item.reviewedAt ? ` · ${fromNow(item.reviewedAt)}` : ''}
        </div>
      )}
      {item.reviewNote && item.status === 'REJECTED' && <div className="entry-meta tone-bad" style={{ marginTop: 6 }}>{item.reviewNote}</div>}
      {(item.canEdit || item.canDecide || screen) && (
        <Flex gap={6} wrap justify="flex-end" style={{ marginTop: 10 }} onClick={event => event.stopPropagation()}>
          {item.canEdit && (
            <Button size="small" icon={<EditOutlined />} onClick={onEdit}>
              Sửa
            </Button>
          )}
          {item.canEdit && item.status === 'PROPOSED' && (
            <Button size="small" icon={<SendOutlined />} loading={submit.isPending} onClick={() => submit.mutate()}>
              Trình
            </Button>
          )}
          {(item.canDecide || screen) && (
            <Button size="small" danger icon={<CloseOutlined />} onClick={onReject}>
              {item.canDecide ? 'Từ chối' : 'Loại'}
            </Button>
          )}
          {item.canDecide && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={onApprove}>
              Duyệt
            </Button>
          )}
        </Flex>
      )}
    </div>
  );
}

export default function DocumentReview() {
  const { id = '' } = useParams();
  const user = useMe();
  const { message, modal } = App.useApp();
  const client = useQueryClient();
  const [watching, setWatching] = useState(false);
  const doc = useApi<SourceDocumentDetail>(`/documents/${id}`, { refetchInterval: watching ? 4000 : false });
  const detail = doc.data;
  const processing = detail ? detail.status === 'PROCESSING' || detail.status === 'UPLOADED' || detail.jobs.some(job => job.status === 'PENDING' || job.status === 'PROCESSING') : false;
  useEffect(() => {
    // Đang xử lý thì theo dõi; vừa xử lý xong thì tải lại nội dung và đề xuất.
    if (processing) setWatching(true);
    else if (watching) {
      setWatching(false);
      void invalidate(client, [`/documents/${id}/text`, '/candidates', '/documents']);
    }
  }, [processing, watching, client, id]);
  const text = useApi<DocumentTextResponse>(detail && detail.status === 'PROCESSED' ? `/documents/${id}/text` : null);
  const candidates = useApi<IndicatorCandidate[]>(`/candidates?documentId=${id}`, { refetchInterval: processing ? 5000 : false });
  const [filter, setFilter] = useState('OPEN');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Proposal | null | undefined>(undefined);
  const [approving, setApproving] = useState<Proposal | null>(null);
  const [rejecting, setRejecting] = useState<IndicatorCandidate | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  // PDF: xem bản gốc (tô sáng đúng dòng của đề xuất) hoặc chữ hệ thống đã đọc.
  const isPdf = detail?.mimeType === 'application/pdf';
  const [view, setView] = useState<'pdf' | 'text'>('pdf');
  // Tệp PDF gắn với mã văn bản: chuyển sang văn bản khác thì tải lại, không giữ bản của văn bản trước.
  const [file, setFile] = useState<{ id: string; buffer: ArrayBuffer } | null>(null);
  const bytes = file?.id === id ? file.buffer : null;
  useEffect(() => {
    if (!isPdf || view !== 'pdf' || bytes) return;
    let active = true;
    http
      .blob(`/documents/${id}/download`)
      .then(blob => blob.arrayBuffer())
      .then(buffer => active && setFile({ id, buffer }))
      .catch(error => active && message.error(errorText(error, 'Không mở được tệp PDF')));
    return () => {
      active = false;
    };
  }, [isPdf, view, bytes, id, message]);

  const reextract = useAction(() => http.post(`/documents/${id}/extract`), { success: 'Đã yêu cầu trích xuất lại', refresh: [`/documents/${id}`, '/candidates'] });
  const cancel = useAction((jobId: string) => http.post(`/documents/${id}/extraction-jobs/${jobId}/cancel`), { success: 'Đã dừng trích xuất', refresh: [`/documents/${id}`, '/candidates'] });
  const reject = useAction(({ item, reason }: { item: IndicatorCandidate; reason: string }) => http.post(`/candidates/${item.id}/reject`, { expectedVersion: item.version, reason }), {
    success: 'Đã từ chối đề xuất',
    refresh: ['/candidates', '/my-work'],
    onDone: () => setRejecting(null),
  });

  const list = useMemo(
    () =>
      (candidates.data ?? []).filter(item =>
        filter === 'ALL' ? true : filter === 'OPEN' ? item.status === 'PROPOSED' || item.status === 'SUBMITTED' : item.status === filter,
      ),
    [candidates.data, filter],
  );
  const selected = (candidates.data ?? []).find(item => item.id === selectedId) ?? null;
  const quoteOf = (item: IndicatorCandidate) => (item.sourceQuote?.trim().length ?? 0) >= 6 ? item.sourceQuote!.trim().slice(0, 1000) : item.name;
  const located = useQuery({
    queryKey: [`/documents/${id}/locate`, selected?.id, selected?.sourceQuote, selected?.name],
    enabled: Boolean(isPdf && selected && detail?.status === 'PROCESSED'),
    staleTime: Infinity,
    queryFn: () => http.post<{ location: Location | null }>(`/documents/${id}/locate`, { text: quoteOf(selected!), pageNumber: selected!.pageNumber ?? undefined }),
  });
  const location = located.data?.location ?? null;
  const pdfFocus = location
    ? { pageNumber: location.pageNumber, box: location.box, matchBox: location.matchBox, label: 'Đề xuất lấy từ đây' }
    : selected?.pageNumber
      ? { pageNumber: selected.pageNumber }
      : null;
  const pages = text.data?.pages ?? [];
  const current = pages.find(item => item.pageNumber === page) ?? pages[0];

  useEffect(() => {
    if (selected?.pageNumber) setPage(selected.pageNumber);
  }, [selected?.id, selected?.pageNumber]);

  useEffect(() => {
    textRef.current?.querySelector('.quote-mark')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedId, page]);

  if (doc.error && !doc.data) {
    if (doc.error instanceof ApiError && doc.error.status === 404)
      return (
        <Result
          status="404"
          title="Không tìm thấy văn bản"
          extra={
            <Link to="/admin/documents">
              <Button>Về kho văn bản</Button>
            </Link>
          }
        />
      );
    return <LoadError error={doc.error} retry={() => void doc.refetch()} />;
  }
  if (!detail) return <PageSkeleton />;

  const activeJob = detail.jobs.find(job => job.status === 'PENDING' || job.status === 'PROCESSING');
  const extractJob = detail.jobs.find(job => job.kind === 'INDICATOR_EXTRACT' && (job.status === 'PENDING' || job.status === 'PROCESSING'));
  const counts = (candidates.data ?? []).reduce<Partial<Record<string, number>>>((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {});
  const clerk = user.role === 'CLERK';

  async function download() {
    try {
      saveBlob(await http.blob(`/documents/${id}/download`), detail!.originalName);
    } catch (error) {
      message.error(errorText(error, 'Không tải được tệp'));
    }
  }

  return (
    <Page
      breadcrumb={[{ label: 'Kho văn bản', to: '/admin/documents' }, { label: detail.code }]}
      title={detail.title}
      tags={
        <Space size={6}>
          <Tag>{documentTypeLabels[detail.docType]}</Tag>
          <Badge status={DOC_STATUS[detail.status].badge} text={DOC_STATUS[detail.status].label} />
        </Space>
      }
      meta={
        <>
          {detail.docNumber && <span>Số {detail.docNumber}</span>}
          {detail.issuedBy && <span>{detail.issuedBy}</span>}
          {detail.issuedDate && <span>Ngày {date(detail.issuedDate)}</span>}
          {detail.pageCount ? <span>{detail.pageCount} trang{detail.ocrUsed ? ' · có nhận dạng ảnh' : ''}</span> : null}
          <span>
            {detail.uploadedBy.fullName} tải lên {fromNow(detail.createdAt)} · {fileSize(detail.size)}
          </span>
        </>
      }
      extra={
        <>
          <Button icon={<DownloadOutlined />} onClick={() => void download()}>
            Tệp gốc
          </Button>
          {can(user, WORKING) && extractJob && (
            <Button
              icon={<PauseCircleOutlined />}
              loading={cancel.isPending}
              onClick={() =>
                modal.confirm({
                  title: 'Dừng trích xuất?',
                  content: 'Kết quả chưa hoàn tất sẽ không được áp dụng.',
                  okText: 'Dừng',
                  okButtonProps: { danger: true },
                  onOk: () => cancel.mutateAsync(extractJob.id),
                })
              }
            >
              Dừng trích xuất
            </Button>
          )}
          {can(user, WORKING) && !activeJob && detail.status === 'PROCESSED' && (
            <Button
              icon={<RedoOutlined />}
              loading={reextract.isPending}
              onClick={() =>
                modal.confirm({
                  title: 'Trích xuất lại văn bản?',
                  content: 'Đề xuất chưa xử lý sẽ được thay bằng kết quả mới; đề xuất đã duyệt hoặc đã hiệu chỉnh được giữ nguyên.',
                  okText: 'Trích xuất lại',
                  onOk: () => reextract.mutateAsync(),
                })
              }
            >
              Trích xuất lại
            </Button>
          )}
        </>
      }
      wide
    >
      {activeJob && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Flex align="center" gap={16} wrap>
            <Badge status="processing" text={`${JOB_LABEL[activeJob.kind] ?? activeJob.kind}${activeJob.status === 'PENDING' ? ' (đang chờ)' : ''}`} />
            {activeJob.chunksTotal ? (
              <Progress style={{ flex: 1, minWidth: 200, margin: 0 }} percent={Math.round(((activeJob.chunksDone ?? 0) / activeJob.chunksTotal) * 100)} format={() => `${activeJob.chunksDone ?? 0}/${activeJob.chunksTotal} đoạn`} />
            ) : null}
            {activeJob.startedAt && <span className="muted">Bắt đầu {fromNow(activeJob.startedAt)}</span>}
          </Flex>
        </Card>
      )}
      {detail.status === 'FAILED' && <Alert type="error" showIcon title="Không xử lý được văn bản" description={detail.processingError} style={{ marginBottom: 16 }} />}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={13}>
          <Card
            className="card-flush doc-viewer"
            title="Nội dung văn bản"
            extra={
              <Flex gap={8} align="center">
                {isPdf && (
                  <Segmented
                    size="small"
                    value={view}
                    onChange={value => setView(value as 'pdf' | 'text')}
                    options={[
                      { value: 'pdf', label: 'Bản gốc' },
                      { value: 'text', label: 'Chữ đã đọc' },
                    ]}
                  />
                )}
                {(!isPdf || view === 'text') && pages.length > 1 && <Pagination simple size="small" current={current?.pageNumber ?? 1} total={pages.length} pageSize={1} onChange={setPage} />}
              </Flex>
            }
          >
            {isPdf && view === 'pdf' ? (
              <div className="doc-preview is-pdf review-pdf">
                {bytes ? <LazyPdfViewer data={bytes} focus={pdfFocus} /> : <PageSkeleton />}
              </div>
            ) : text.isLoading ? (
              <PageSkeleton />
            ) : current ? (
              <ScrollBox bodyClassName="doc-text" ref={textRef} label="Về đầu văn bản">
                {current.ocrUsed && (
                  <Tag style={{ marginBottom: 8 }}>
                    Nhận dạng ảnh{current.ocrConfidence ? ` · độ tin cậy ${pct(current.ocrConfidence)}` : ''}
                  </Tag>
                )}
                <Highlighted text={current.text} quote={selected && selected.pageNumber === current.pageNumber ? selected.sourceQuote : selected?.pageNumber ? null : selected?.sourceQuote} />
              </ScrollBox>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={processing ? 'Đang đọc văn bản' : 'Chưa có nội dung'} style={{ padding: 32 }} />
            )}
          </Card>
        </Col>
        <Col xs={24} xl={11}>
          <Card
            className="card-flush"
            title={`Đề xuất trích xuất (${num(candidates.data?.length ?? detail.counts.candidates)})`}
          >
            <div className="card-filter">
              <Segmented
                size="small"
                value={filter}
                onChange={value => setFilter(String(value))}
                options={[
                  { value: 'OPEN', label: `Chờ xử lý ${(counts.PROPOSED ?? 0) + (counts.SUBMITTED ?? 0)}` },
                  { value: 'APPROVED', label: `Đã duyệt ${counts.APPROVED ?? 0}` },
                  { value: 'REJECTED', label: `Từ chối ${counts.REJECTED ?? 0}` },
                  { value: 'ALL', label: 'Tất cả' },
                ]}
              />
            </div>
            <ScrollBox bodyClassName="candidate-list">
              {candidates.error && !candidates.data ? (
                <LoadError error={candidates.error} retry={() => void candidates.refetch()} />
              ) : list.length ? (
                list.map(item => (
                  <CandidateCard
                    key={item.id}
                    item={item}
                    active={item.id === selectedId}
                    screen={clerk && item.origin === 'AI' && item.status === 'PROPOSED'}
                    onSelect={() => setSelectedId(item.id)}
                    onEdit={() => setEditing(item as unknown as Proposal)}
                    onApprove={() => setApproving(item as unknown as Proposal)}
                    onReject={() => setRejecting(item)}
                  />
                ))
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={processing ? 'Đang trích xuất' : 'Không có đề xuất'} style={{ padding: 32 }} />
              )}
            </ScrollBox>
          </Card>
          {detail.jobs.length > 0 && (
            <Card size="small" title="Lượt xử lý" style={{ marginTop: 16 }}>
              <Flex vertical gap={6}>
                {detail.jobs.slice(0, 6).map(job => (
                  <Flex key={job.id} justify="space-between" gap={12} wrap className="entry-meta">
                    <span>
                      {JOB_LABEL[job.kind] ?? job.kind} · {JOB_STATUS[job.status] ?? job.status}
                      {job.model ? ` · ${job.model}` : ''}
                    </span>
                    <span>{dateTime(job.finishedAt ?? job.startedAt ?? job.createdAt)}</span>
                    {job.note && <Typography.Text type="secondary" style={{ flexBasis: '100%', fontSize: 12 }}>{job.note}</Typography.Text>}
                  </Flex>
                ))}
              </Flex>
            </Card>
          )}
        </Col>
      </Row>
      <ProposalForm open={editing !== undefined} item={editing} onClose={() => setEditing(undefined)} />
      <ApproveModal item={approving} onClose={() => setApproving(null)} />
      <ReasonModal
        open={Boolean(rejecting)}
        title="Từ chối đề xuất"
        label="Lý do từ chối"
        okText="Từ chối"
        danger
        max={500}
        loading={reject.isPending}
        onCancel={() => setRejecting(null)}
        onSubmit={reason => rejecting && reject.mutate({ item: rejecting, reason })}
      />
    </Page>
  );
}
