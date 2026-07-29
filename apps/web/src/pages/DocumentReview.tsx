import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  FileText,
  ListChecks,
  Pencil,
  RefreshCw,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, auth } from '../api';
import { ADMIN_ROLES, APPROVAL_ROLES, DOCUMENT_ROLES, hasAnyRole } from '../authz';
import { Empty, Modal, PageHead, Spinner } from '../components/UI';
import type {
  CandidateStatus,
  Department,
  DocumentPage,
  DocumentStatus,
  DocumentTextResponse,
  ExtractionJobInfo,
  IndicatorCandidate,
  SourceDocumentDetail,
} from '../types';
import { documentTypeLabels } from '../types';
import '../documents.css';

type CandidateForm = {
  name: string;
  description: string;
  category: string;
  unit: string;
  targetValue: string;
  targetYear: string;
  direction: 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER';
  frequency: '' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  deadline: string;
  responsibleDepartmentId: string;
  coordinatingDepartments: string;
  legalBasis: string;
};

type ApproveResult = {
  candidate: IndicatorCandidate;
  target: { id: string; code: string; title?: string; year?: number };
};

type QuoteMatch = { pageNumber: number; start: number; end: number };

const frequencyShortLabels: Record<'MONTHLY' | 'QUARTERLY' | 'YEARLY', string> = { MONTHLY: 'Tháng', QUARTERLY: 'Quý', YEARLY: 'Năm' };
const frequencyLongLabels: Record<'MONTHLY' | 'QUARTERLY' | 'YEARLY', string> = { MONTHLY: 'Hàng tháng', QUARTERLY: 'Hàng quý', YEARLY: 'Hàng năm' };
const tabLabels: Record<CandidateStatus, string> = { PROPOSED: 'Chờ xác minh', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Có lỗi xảy ra, vui lòng thử lại';
}

function mutationMessage(reason: unknown, fallback: string) {
  if (reason instanceof ApiError && reason.status === 409) {
    return `${reason.message}. Dữ liệu mới nhất đã được tải lại; vui lòng kiểm tra trước khi thao tác tiếp.`;
  }
  return reason instanceof Error ? reason.message : fallback;
}

function latestExtractJob(jobs: ExtractionJobInfo[]) {
  return jobs
    .filter(job => job.kind === 'INDICATOR_EXTRACT')
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];
}

function statusMeta(status: DocumentStatus, jobs?: ExtractionJobInfo[]) {
  if (status === 'UPLOADED') return { label: 'Chờ xử lý', tone: 'slate' };
  if (status === 'PROCESSING') {
    const extract = jobs ? latestExtractJob(jobs) : undefined;
    return { label: extract?.status === 'PROCESSING' ? 'Đang trích xuất' : 'Đang xử lý', tone: 'blue' };
  }
  if (status === 'PROCESSED') return { label: 'Đã xử lý', tone: 'green' };
  return { label: 'Lỗi', tone: 'red' };
}

function confidenceTone(value: number) {
  return value >= 0.8 ? 'green' : value >= 0.5 ? 'amber' : 'red';
}

function percentOf(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value * 100)))}%`;
}

function findQuote(pages: DocumentPage[], quote: string, preferredPage?: number | null): QuoteMatch | null {
  const trimmed = quote.trim();
  if (!trimmed) return null;
  const pattern = new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'i');
  const ordered = preferredPage
    ? [...pages].sort((left, right) => Number(right.pageNumber === preferredPage) - Number(left.pageNumber === preferredPage))
    : pages;
  for (const page of ordered) {
    const match = pattern.exec(page.text);
    if (match) return { pageNumber: page.pageNumber, start: match.index, end: match.index + match[0].length };
  }
  return null;
}

export default function DocumentReview() {
  const { id = '' } = useParams();
  const user = auth.user;
  const canEdit = hasAnyRole(user, APPROVAL_ROLES);
  const canApprove = hasAnyRole(user, ADMIN_ROLES);
  const canReject = hasAnyRole(user, APPROVAL_ROLES);
  const canReextract = hasAnyRole(user, DOCUMENT_ROLES);
  const [doc, setDoc] = useState<SourceDocumentDetail | null>(null);
  const [docLoading, setDocLoading] = useState(true);
  const [text, setText] = useState<DocumentTextResponse | null>(null);
  const [textLoading, setTextLoading] = useState(true);
  const [textError, setTextError] = useState('');
  const [candidates, setCandidates] = useState<IndicatorCandidate[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<ReactNode>('');
  const [tab, setTab] = useState<CandidateStatus>('PROPOSED');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'edit' | 'approve' | 'reject' | 'reextract' | 'cancelExtract' | null>(null);
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);
  const [modalCandidate, setModalCandidate] = useState<IndicatorCandidate | null>(null);
  const [editForm, setEditForm] = useState<CandidateForm | null>(null);
  const [approveWeight, setApproveWeight] = useState('1');
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const docRequestId = useRef(0);
  const textRequestId = useRef(0);
  const candidatesRequestId = useRef(0);
  const wasJobsActive = useRef(false);
  const markRef = useRef<HTMLElement>(null);

  async function loadDocument(background = false) {
    const requestId = ++docRequestId.current;
    if (!background) {
      setDocLoading(true);
      setLoadError('');
    }
    try {
      const result = await api<SourceDocumentDetail>(`/documents/${id}`);
      if (requestId === docRequestId.current) setDoc(result);
    } catch (reason) {
      if (requestId === docRequestId.current && !background) setLoadError(reason instanceof Error ? reason.message : 'Không thể tải thông tin văn bản');
    } finally {
      if (requestId === docRequestId.current && !background) setDocLoading(false);
    }
  }

  async function loadText(background = false) {
    const requestId = ++textRequestId.current;
    if (!background) {
      setTextLoading(true);
      setTextError('');
    }
    try {
      const result = await api<DocumentTextResponse>(`/documents/${id}/text`);
      if (requestId === textRequestId.current) {
        setText(result);
        setTextError('');
      }
    } catch (reason) {
      if (requestId === textRequestId.current && !background) setTextError(messageOf(reason));
    } finally {
      if (requestId === textRequestId.current && !background) setTextLoading(false);
    }
  }

  async function loadCandidates(background = false) {
    const requestId = ++candidatesRequestId.current;
    if (!background) setCandidatesLoading(true);
    try {
      const result = await api<IndicatorCandidate[]>(`/candidates?documentId=${id}`);
      if (requestId === candidatesRequestId.current) setCandidates(result);
    } catch (reason) {
      if (requestId === candidatesRequestId.current && !background) setLoadError(reason instanceof Error ? reason.message : 'Không thể tải danh sách đề xuất');
    } finally {
      if (requestId === candidatesRequestId.current && !background) setCandidatesLoading(false);
    }
  }

  function reloadAll() {
    void loadDocument();
    void loadText();
    void loadCandidates();
  }

  useEffect(() => {
    setDoc(null);
    setText(null);
    setCandidates([]);
    setSelectedId(null);
    setTab('PROPOSED');
    setNotice('');
    reloadAll();
  }, [id]);

  useEffect(() => {
    api<Department[]>('/departments').then(setDepartments).catch(() => undefined);
  }, []);

  const jobsActive = Boolean(doc && (
    doc.status === 'UPLOADED'
    || doc.status === 'PROCESSING'
    || doc.jobs.some(job => job.status === 'PENDING' || job.status === 'PROCESSING')
  ));

  useEffect(() => {
    if (!jobsActive) return;
    const timer = window.setInterval(() => void loadDocument(true), 4000);
    return () => window.clearInterval(timer);
  }, [jobsActive, id]);

  useEffect(() => {
    if (wasJobsActive.current && !jobsActive) {
      void loadCandidates(true);
      void loadText(true);
    }
    wasJobsActive.current = jobsActive;
  }, [jobsActive]);

  const grouped = useMemo(() => ({
    PROPOSED: candidates.filter(candidate => candidate.status === 'PROPOSED'),
    APPROVED: candidates.filter(candidate => candidate.status === 'APPROVED'),
    REJECTED: candidates.filter(candidate => candidate.status === 'REJECTED'),
  }), [candidates]);
  const visibleCandidates = grouped[tab];
  const selectedCandidate = useMemo(() => candidates.find(candidate => candidate.id === selectedId) || null, [candidates, selectedId]);

  useEffect(() => {
    if (selectedId && !visibleCandidates.some(candidate => candidate.id === selectedId)) setSelectedId(null);
  }, [tab, candidates]);

  const quoteMatch = useMemo(
    () => (selectedCandidate && selectedCandidate.sourceQuote && text ? findQuote(text.pages, selectedCandidate.sourceQuote, selectedCandidate.pageNumber) : null),
    [selectedCandidate, text],
  );
  const quoteMissing = Boolean(selectedCandidate && selectedCandidate.sourceQuote && text && text.pages.length && !quoteMatch);

  useEffect(() => {
    if (quoteMatch) markRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [quoteMatch]);

  function candidateDepartment(candidate: IndicatorCandidate) {
    if (candidate.responsibleDepartment) return { name: candidate.responsibleDepartment.name, matched: true };
    const found = candidate.responsibleDepartmentId ? departments.find(item => item.id === candidate.responsibleDepartmentId) : undefined;
    if (found) return { name: found.name, matched: true };
    if (candidate.responsibleDepartmentName) return { name: candidate.responsibleDepartmentName, matched: false };
    return { name: '—', matched: true };
  }

  function fieldDot(value?: number) {
    if (typeof value !== 'number') return null;
    return <i className={`cand-dot ${confidenceTone(value)}`} title={`Độ tin cậy của trường dữ liệu: ${percentOf(value)}`} />;
  }

  function closeModal() {
    if (submitting) return;
    setModal(null);
    setCancelJobId(null);
    setModalCandidate(null);
    setEditForm(null);
    setError('');
  }

  function openEdit(candidate: IndicatorCandidate) {
    setModalCandidate(candidate);
    setEditForm({
      name: candidate.name,
      description: candidate.description || '',
      category: candidate.category || '',
      unit: candidate.unit || '',
      targetValue: candidate.targetValue != null ? String(candidate.targetValue) : '',
      targetYear: candidate.targetYear != null ? String(candidate.targetYear) : '',
      direction: candidate.direction || 'HIGHER_IS_BETTER',
      frequency: candidate.frequency || '',
      deadline: candidate.deadline ? candidate.deadline.slice(0, 10) : '',
      responsibleDepartmentId: candidate.responsibleDepartmentId || '',
      coordinatingDepartments: candidate.coordinatingDepartments || '',
      legalBasis: candidate.legalBasis || '',
    });
    setError('');
    setModal('edit');
  }

  function openApprove(candidate: IndicatorCandidate) {
    setModalCandidate(candidate);
    setApproveWeight('1');
    setError('');
    setModal('approve');
  }

  function openReject(candidate: IndicatorCandidate) {
    setModalCandidate(candidate);
    setRejectReason('');
    setError('');
    setModal('reject');
  }

  async function handleConflict(reason: unknown, fallback: string) {
    setModal(null);
    setModalCandidate(null);
    setEditForm(null);
    await loadCandidates();
    setLoadError(mutationMessage(reason, fallback));
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!modalCandidate || !editForm) return;
    setError('');
    const payload: Record<string, unknown> = { expectedVersion: modalCandidate.version };
    const name = editForm.name.trim();
    if (!name) {
      setError('Tên chỉ tiêu không được để trống.');
      return;
    }
    if (name !== modalCandidate.name) payload.name = name;
    const description = editForm.description.trim();
    if (description !== (modalCandidate.description || '')) payload.description = description;
    const category = editForm.category.trim();
    if (category !== (modalCandidate.category || '')) payload.category = category;
    const unit = editForm.unit.trim();
    if (unit !== (modalCandidate.unit || '')) payload.unit = unit;
    let targetValue: number | null = null;
    if (editForm.targetValue.trim() !== '') {
      targetValue = Number(editForm.targetValue);
      if (!Number.isFinite(targetValue) || targetValue < 0) {
        setError('Giá trị mục tiêu phải là một số không âm.');
        return;
      }
    }
    if ((targetValue ?? null) !== (modalCandidate.targetValue ?? null)) payload.targetValue = targetValue;
    let targetYear: number | null = null;
    if (editForm.targetYear.trim() !== '') {
      targetYear = Number(editForm.targetYear);
      if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
        setError('Năm kế hoạch phải nằm trong khoảng từ 2000 đến 2100.');
        return;
      }
    }
    if ((targetYear ?? null) !== (modalCandidate.targetYear ?? null)) payload.targetYear = targetYear;
    if (editForm.direction !== (modalCandidate.direction || 'HIGHER_IS_BETTER')) payload.direction = editForm.direction;
    const frequency = editForm.frequency || null;
    if (frequency !== (modalCandidate.frequency ?? null)) payload.frequency = frequency;
    const deadline = editForm.deadline || null;
    if (deadline !== (modalCandidate.deadline ? modalCandidate.deadline.slice(0, 10) : null)) payload.deadline = deadline;
    const responsibleDepartmentId = editForm.responsibleDepartmentId || null;
    if (responsibleDepartmentId !== (modalCandidate.responsibleDepartmentId ?? null)) payload.responsibleDepartmentId = responsibleDepartmentId;
    const coordinating = editForm.coordinatingDepartments.trim();
    if (coordinating !== (modalCandidate.coordinatingDepartments || '')) payload.coordinatingDepartments = coordinating;
    const legalBasis = editForm.legalBasis.trim();
    if (legalBasis !== (modalCandidate.legalBasis || '')) payload.legalBasis = legalBasis;
    if (Object.keys(payload).length === 1) {
      setError('Chưa có thay đổi nào để lưu.');
      return;
    }
    setSubmitting(true);
    try {
      await api<IndicatorCandidate>(`/candidates/${modalCandidate.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      setModal(null);
      setModalCandidate(null);
      setEditForm(null);
      setNotice('Đã hiệu chỉnh đề xuất. Các trường do con người chỉnh sửa được đánh dấu để phân biệt với kết quả máy tạo.');
      await loadCandidates();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) await handleConflict(reason, 'Không thể cập nhật đề xuất');
      else setError(messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitApprove(event: FormEvent) {
    event.preventDefault();
    if (!modalCandidate) return;
    setError('');
    const weight = Number(approveWeight);
    if (!Number.isFinite(weight) || weight < 0.1 || weight > 10) {
      setError('Trọng số phải nằm trong khoảng từ 0.1 đến 10.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api<ApproveResult>(`/candidates/${modalCandidate.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: modalCandidate.version, weight }),
      });
      setModal(null);
      setModalCandidate(null);
      setNotice(<>Đã tạo chỉ tiêu <Link className="cand-created-link" to={`/admin/targets?search=${encodeURIComponent(result.target.code)}${result.target.year ? `&year=${result.target.year}` : ''}`}>{result.target.code}</Link> từ đề xuất đã xác minh. Theo dõi tại mục Quản lý chỉ tiêu.</>);
      await loadCandidates();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) await handleConflict(reason, 'Không thể duyệt đề xuất');
      else setError(messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitReject(event: FormEvent) {
    event.preventDefault();
    if (!modalCandidate) return;
    setError('');
    const reasonText = rejectReason.trim();
    if (reasonText.length < 5) {
      setError('Lý do từ chối phải có ít nhất 5 ký tự.');
      return;
    }
    setSubmitting(true);
    try {
      await api<IndicatorCandidate>(`/candidates/${modalCandidate.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ expectedVersion: modalCandidate.version, reason: reasonText }),
      });
      setModal(null);
      setModalCandidate(null);
      setNotice('Đã từ chối đề xuất và lưu lý do để phục vụ đối soát.');
      await loadCandidates();
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) await handleConflict(reason, 'Không thể từ chối đề xuất');
      else setError(messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmReextract() {
    setError('');
    setSubmitting(true);
    try {
      await api(`/documents/${id}/extract`, { method: 'POST' });
      setModal(null);
      setNotice('Đã yêu cầu trích xuất lại. Hệ thống đang xử lý; các đề xuất mới sẽ xuất hiện khi hoàn tất.');
      await loadDocument();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCancelExtraction() {
    if (!cancelJobId) return;
    setError('');
    setSubmitting(true);
    try {
      await api(`/documents/${id}/extraction-jobs/${cancelJobId}/cancel`, { method: 'POST' });
      setModal(null);
      setCancelJobId(null);
      setNotice('Đã dừng lượt trích xuất. Kết quả chưa hoàn tất không được áp dụng; dữ liệu đã duyệt hoặc hiệu chỉnh vẫn được giữ nguyên.');
      await Promise.all([loadDocument(), loadText(), loadCandidates()]);
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSubmitting(false);
    }
  }

  const docMeta = doc ? statusMeta(doc.status, doc.jobs) : null;
  const activeExtract = doc ? latestExtractJob(doc.jobs) : undefined;
  const canCancelExtraction = Boolean(
    canReextract
    && activeExtract
    && (activeExtract.status === 'PENDING' || activeExtract.status === 'PROCESSING'),
  );
  const showExtractStatus = Boolean(
    activeExtract
    && (activeExtract.status === 'PENDING' || activeExtract.status === 'PROCESSING' || activeExtract.status === 'CANCELLED'),
  );

  function pageBody(page: DocumentPage): ReactNode {
    if (quoteMatch && quoteMatch.pageNumber === page.pageNumber) {
      return <>
        {page.text.slice(0, quoteMatch.start)}
        <mark ref={markRef} className="doc-mark">{page.text.slice(quoteMatch.start, quoteMatch.end)}</mark>
        {page.text.slice(quoteMatch.end)}
      </>;
    }
    return page.text;
  }

  return <>
    <PageHead
      eyebrow="TIẾP NHẬN DỮ LIỆU"
      title="Xác minh trích xuất"
      description="Đối chiếu từng đề xuất của hệ thống với nội dung văn bản gốc, hiệu chỉnh khi cần và chỉ duyệt những chỉ tiêu đã được xác minh."
      actions={<>
        <Link className="btn secondary" to="/admin/documents"><ArrowLeft />Kho văn bản</Link>
        {canCancelExtraction && activeExtract && <button
          type="button"
          className="btn danger"
          disabled={submitting}
          onClick={() => {
            setError('');
            setCancelJobId(activeExtract.id);
            setModal('cancelExtract');
          }}
        ><XCircle />Dừng trích xuất</button>}
        {canReextract && <button
          type="button"
          className="btn primary"
          disabled={!doc || doc.status !== 'PROCESSED' || jobsActive || submitting}
          title={doc && doc.status !== 'PROCESSED' ? 'Chỉ trích xuất lại được khi văn bản đã xử lý xong' : ''}
          onClick={() => { setError(''); setModal('reextract'); }}
        ><RefreshCw />Trích xuất lại</button>}
      </>}
    />

    {notice && <div className="notice success" role="status"><BadgeCheck />{notice}<button aria-label="Đóng thông báo" onClick={() => setNotice('')}><X /></button></div>}
    {loadError && <div className="notice error" role="alert">{loadError}<button onClick={reloadAll}>Thử lại</button></div>}

    <div className="doc-workspace">
      <section className="panel">
        <div className="panel-head"><div><h3><FileText /> Nội dung tài liệu</h3><p>Bản số hóa của văn bản gốc, dùng để đối chiếu từng đề xuất</p></div></div>
        {docLoading ? <Spinner /> : doc && <>
          <div className="doc-meta">
            <span className="code">{doc.code}</span>
            <strong>{doc.title}</strong>
            <span className="doc-meta-line">
              {documentTypeLabels[doc.docType]}
              {doc.docNumber ? ` · Số ${doc.docNumber}` : ''}
              {doc.issuedBy ? ` · ${doc.issuedBy}` : ''}
              {doc.issuedDate ? ` · Ban hành ${new Date(doc.issuedDate).toLocaleDateString('vi-VN')}` : ''}
            </span>
            <div className="doc-meta-tags">
              {docMeta && <span className={`status ${docMeta.tone}`}><i />{docMeta.label}</span>}
              {doc.pageCount != null && <span className="doc-meta-chip">{doc.pageCount} trang</span>}
              <span className="doc-meta-chip">{doc.counts.candidates} đề xuất</span>
              {doc.ocrUsed && <span className="doc-ocr-badge" title="Văn bản được nhận dạng ký tự quang học (OCR); độ chính xác từng trang hiển thị ngay trong nội dung bên dưới.">OCR</span>}
            </div>
            {showExtractStatus && activeExtract && <div
              className={`doc-progress-line${activeExtract.status === 'CANCELLED' ? ' cancelled' : ''}`}
              role="status"
              aria-live="polite"
            >
              {activeExtract.status === 'CANCELLED' ? <XCircle /> : <RefreshCw />}
              {activeExtract.status === 'CANCELLED'
                ? 'Đã dừng trích xuất chỉ tiêu'
                : activeExtract.status === 'PENDING'
                  ? 'Đang chờ trích xuất chỉ tiêu'
                  : 'Đang trích xuất chỉ tiêu'}
              {activeExtract.chunksTotal != null
                ? ` · Tiến độ ${activeExtract.chunksDone ?? 0}/${activeExtract.chunksTotal} đoạn`
                : activeExtract.chunksDone != null
                  ? ` · Đã xử lý ${activeExtract.chunksDone} đoạn`
                  : ''}
              {activeExtract.status !== 'CANCELLED' ? '...' : ''}
            </div>}
            {doc.status === 'FAILED' && doc.processingError && <small className="doc-error-line">{doc.processingError}</small>}
          </div>
          {quoteMissing && <div className="doc-quote-warning"><AlertTriangle />Không tìm thấy chính xác đoạn trích dẫn của đề xuất đang chọn trong bản số hóa. Vui lòng đối chiếu thủ công{selectedCandidate?.pageNumber ? ` tại trang ${selectedCandidate.pageNumber}` : ''}.</div>}
          {textLoading ? <Spinner /> : text && text.pages.length ? <div className="doc-viewer">
            {text.pages.map(page => <div key={page.pageNumber} className="doc-page">
              <div className="doc-page-head">
                <b>Trang {page.pageNumber}</b>
                {page.ocrUsed && <span className="doc-ocr-badge" title="Trang được nhận dạng bằng OCR">OCR{typeof page.ocrConfidence === 'number' ? ` ${percentOf(page.ocrConfidence)}` : ''}</span>}
              </div>
              <pre>{pageBody(page)}</pre>
            </div>)}
          </div> : <Empty title="Chưa có nội dung" description={textError || 'Nội dung văn bản sẽ hiển thị sau khi hệ thống xử lý xong.'} />}
        </>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h3><ListChecks /> Chỉ tiêu ứng viên</h3><p>Kết quả máy tạo cần được cán bộ xác minh; nhấn vào một đề xuất để đối chiếu trích dẫn gốc</p></div></div>
        <div className="cand-chips">
          {(['PROPOSED', 'APPROVED', 'REJECTED'] as CandidateStatus[]).map(key => <button
            key={key}
            type="button"
            className={`cand-chip ${tab === key ? 'active' : ''}`}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >{tabLabels[key]}<b>{grouped[key].length}</b></button>)}
        </div>
        {candidatesLoading ? <Spinner /> : visibleCandidates.length ? <div className="cand-list">
          {visibleCandidates.map(candidate => {
            const department = candidateDepartment(candidate);
            return <article
              key={candidate.id}
              className={`cand-card ${selectedId === candidate.id ? 'selected' : ''}`}
              tabIndex={0}
              aria-label={`Đối chiếu đề xuất ${candidate.name}`}
              onClick={() => setSelectedId(candidate.id)}
              onKeyDown={event => {
                if (event.target !== event.currentTarget) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                setSelectedId(candidate.id);
              }}
            >
              <div className="cand-head">
                <h4>{fieldDot(candidate.fieldConfidence?.name)}{candidate.name}</h4>
                {candidate.humanEdited && <span className="cand-badge">Đã hiệu chỉnh</span>}
              </div>
              <div className="cand-meta-line">
                <span className={`cand-method ${candidate.extractionMethod === 'LLM' ? 'ai' : 'rule'}`}>{candidate.extractionMethod === 'LLM' ? 'AI' : 'Luật'}</span>
                {candidate.model && <span className="cand-model">{candidate.model}</span>}
                <span className="cand-model">{candidate.kind === 'PROGRESS_UPDATE' ? 'Cập nhật tiến độ' : 'Chỉ tiêu mới'}{candidate.pageNumber ? ` · Trang ${candidate.pageNumber}` : ''}</span>
              </div>
              <div className="cand-value">
                <strong>{candidate.targetValue != null ? candidate.targetValue.toLocaleString('vi-VN') : '—'}</strong>
                <span>{candidate.unit || ''}{candidate.targetYear ? ` · Năm ${candidate.targetYear}` : ''}</span>
                {fieldDot(candidate.fieldConfidence?.targetValue)}
                {fieldDot(candidate.fieldConfidence?.unit)}
              </div>
              <div className="cand-confidence">
                <div className="cand-confidence-bar"><i className={confidenceTone(candidate.confidence)} style={{ width: percentOf(candidate.confidence) }} /></div>
                <b>{percentOf(candidate.confidence)}</b>
              </div>
              <div className="cand-fields">
                <div>
                  <span>Phòng ban</span>
                  <strong>{fieldDot(candidate.fieldConfidence?.responsibleDepartment)}{department.name}</strong>
                  {!department.matched && <small className="cand-note">Chưa khớp phòng ban trong hệ thống</small>}
                </div>
                <div><span>Tần suất</span><strong>{fieldDot(candidate.fieldConfidence?.frequency)}{candidate.frequency ? frequencyShortLabels[candidate.frequency] : '—'}</strong></div>
                <div><span>Hạn</span><strong>{fieldDot(candidate.fieldConfidence?.deadline)}{candidate.deadline ? new Date(candidate.deadline).toLocaleDateString('vi-VN') : '—'}</strong></div>
                <div><span>Căn cứ</span><strong>{candidate.legalBasis || '—'}</strong></div>
                {candidate.actualValue != null && <div><span>Giá trị thực hiện</span><strong>{candidate.actualValue.toLocaleString('vi-VN')} {candidate.unit || ''}</strong></div>}
              </div>
              {candidate.isDuplicateSuspect && <div className="cand-duplicate"><AlertTriangle />Nghi trùng với chỉ tiêu {candidate.matchedTarget ? `${candidate.matchedTarget.code} — ${candidate.matchedTarget.title}` : 'đã có trong hệ thống'}</div>}
              {candidate.warnings?.length ? <ul className="cand-warning">{candidate.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
              {candidate.status === 'PROPOSED' && <div className="cand-actions">
                {canEdit && <button type="button" className="btn secondary compact" disabled={submitting} onClick={event => { event.stopPropagation(); openEdit(candidate); }}><Pencil />Sửa</button>}
                {canApprove && <button type="button" className="btn primary compact" disabled={submitting} onClick={event => { event.stopPropagation(); openApprove(candidate); }}><BadgeCheck />Duyệt</button>}
                {canReject && <button type="button" className="btn secondary compact" disabled={submitting} onClick={event => { event.stopPropagation(); openReject(candidate); }}><XCircle />Từ chối</button>}
              </div>}
              {candidate.status === 'APPROVED' && <div className="cand-created">
                Đã tạo chỉ tiêu {candidate.createdTarget
                  ? <Link className="cand-created-link" to={`/admin/targets?search=${encodeURIComponent(candidate.createdTarget.code)}`} onClick={event => event.stopPropagation()}>{candidate.createdTarget.code}</Link>
                  : 'chính thức'}
                {candidate.reviewedBy && <small className="block muted">Duyệt bởi {candidate.reviewedBy.fullName}{candidate.reviewedAt ? ` · ${new Date(candidate.reviewedAt).toLocaleString('vi-VN')}` : ''}</small>}
              </div>}
              {candidate.status === 'REJECTED' && <div className="cand-review-note">
                <strong>Lý do từ chối:</strong> {candidate.reviewNote || '—'}
                {candidate.reviewedBy && <small className="block muted">Từ chối bởi {candidate.reviewedBy.fullName}{candidate.reviewedAt ? ` · ${new Date(candidate.reviewedAt).toLocaleString('vi-VN')}` : ''}</small>}
              </div>}
            </article>;
          })}
        </div> : <Empty
          title={tab === 'PROPOSED' ? 'Không có đề xuất chờ xác minh' : tab === 'APPROVED' ? 'Chưa có đề xuất được duyệt' : 'Chưa có đề xuất bị từ chối'}
          description={jobsActive ? 'Hệ thống đang xử lý văn bản; đề xuất sẽ xuất hiện khi trích xuất hoàn tất.' : 'Các đề xuất thuộc trạng thái này sẽ hiển thị tại đây.'}
        />}
      </section>
    </div>

    {modal === 'edit' && modalCandidate && editForm && <Modal title="Hiệu chỉnh đề xuất trước khi duyệt" onClose={closeModal} wide>
      <form className="form-grid" onSubmit={submitEdit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <label className="full">Tên chỉ tiêu<input required maxLength={300} value={editForm.name} onChange={event => setEditForm({ ...editForm, name: event.target.value })} /></label>
        <label className="full">Mô tả<textarea maxLength={2000} value={editForm.description} onChange={event => setEditForm({ ...editForm, description: event.target.value })} /></label>
        <label>Lĩnh vực<input maxLength={200} value={editForm.category} onChange={event => setEditForm({ ...editForm, category: event.target.value })} /></label>
        <label>Đơn vị tính<input maxLength={50} value={editForm.unit} onChange={event => setEditForm({ ...editForm, unit: event.target.value })} /></label>
        <label>Giá trị mục tiêu<input type="number" step="any" min="0" value={editForm.targetValue} onChange={event => setEditForm({ ...editForm, targetValue: event.target.value })} /></label>
        <label>Năm kế hoạch<input type="number" min="2000" max="2100" value={editForm.targetYear} onChange={event => setEditForm({ ...editForm, targetYear: event.target.value })} /></label>
        <label>Chiều đánh giá<select value={editForm.direction} onChange={event => setEditForm({ ...editForm, direction: event.target.value as CandidateForm['direction'] })}>
          <option value="HIGHER_IS_BETTER">Càng cao càng tốt</option>
          <option value="LOWER_IS_BETTER">Càng thấp càng tốt</option>
        </select></label>
        <label>Tần suất báo cáo<select value={editForm.frequency} onChange={event => setEditForm({ ...editForm, frequency: event.target.value as CandidateForm['frequency'] })}>
          <option value="">— Chưa xác định —</option>
          <option value="MONTHLY">Hàng tháng</option>
          <option value="QUARTERLY">Hàng quý</option>
          <option value="YEARLY">Hàng năm</option>
        </select></label>
        <label>Hạn hoàn thành<input type="date" value={editForm.deadline} onChange={event => setEditForm({ ...editForm, deadline: event.target.value })} /></label>
        <label>Phòng ban phụ trách<select value={editForm.responsibleDepartmentId} onChange={event => setEditForm({ ...editForm, responsibleDepartmentId: event.target.value })}>
          <option value="">— Không gắn phòng ban —</option>
          {departments.filter(department => department.isActive || department.id === modalCandidate.responsibleDepartmentId).map(department => <option key={department.id} value={department.id}>{department.name}{department.isActive ? '' : ' (đã ngừng)'}</option>)}
        </select>{modalCandidate.responsibleDepartmentName && !modalCandidate.responsibleDepartmentId && <small className="muted">Văn bản ghi: “{modalCandidate.responsibleDepartmentName}”</small>}</label>
        <label className="full">Đơn vị phối hợp<input maxLength={500} value={editForm.coordinatingDepartments} onChange={event => setEditForm({ ...editForm, coordinatingDepartments: event.target.value })} /></label>
        <label className="full">Căn cứ pháp lý<textarea maxLength={1000} value={editForm.legalBasis} onChange={event => setEditForm({ ...editForm, legalBasis: event.target.value })} /></label>
        <div className="permission-note full"><Pencil /><div><strong>Chỉnh sửa được ghi vết</strong><p>Các trường do con người hiệu chỉnh sẽ được đánh dấu “Đã hiệu chỉnh” và giữ nguyên khi trích xuất lại văn bản.</p></div></div>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button>
          <button className="btn primary" disabled={submitting}>{submitting ? 'Đang lưu...' : 'Lưu hiệu chỉnh'}</button>
        </div>
      </form>
    </Modal>}

    {modal === 'approve' && modalCandidate && <Modal title="Duyệt và tạo chỉ tiêu chính thức" onClose={closeModal}>
      <form className="form-grid single" onSubmit={submitApprove}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <div className="target-preview">
          <span>{modalCandidate.document.code}</span>
          <strong>{modalCandidate.name}</strong>
          <p>
            Mục tiêu: {modalCandidate.targetValue != null ? modalCandidate.targetValue.toLocaleString('vi-VN') : '—'} {modalCandidate.unit || ''}
            {modalCandidate.targetYear ? ` · Năm ${modalCandidate.targetYear}` : ''}
            {` · ${candidateDepartment(modalCandidate).name}`}
            {modalCandidate.frequency ? ` · ${frequencyLongLabels[modalCandidate.frequency]}` : ''}
            {modalCandidate.deadline ? ` · Hạn ${new Date(modalCandidate.deadline).toLocaleDateString('vi-VN')}` : ''}
            {` · ${modalCandidate.direction === 'LOWER_IS_BETTER' ? 'Càng thấp càng tốt' : 'Càng cao càng tốt'}`}
          </p>
        </div>
        <div className="permission-note"><ShieldCheck /><div><strong>Tạo chỉ tiêu chính thức</strong><p>Sau khi duyệt, hệ thống tạo chỉ tiêu mới trong danh mục với đầy đủ căn cứ trích xuất; đề xuất này sẽ không thể chỉnh sửa thêm.</p></div></div>
        <label className="full">Trọng số<input type="number" step="0.1" min="0.1" max="10" required value={approveWeight} onChange={event => setApproveWeight(event.target.value)} /><small className="muted">Trọng số dùng khi tổng hợp tiến độ chung; mặc định là 1.</small></label>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button>
          <button className="btn primary" disabled={submitting}>{submitting ? 'Đang tạo chỉ tiêu...' : 'Xác nhận duyệt'}</button>
        </div>
      </form>
    </Modal>}

    {modal === 'reject' && modalCandidate && <Modal title="Từ chối đề xuất" onClose={closeModal}>
      <form className="form-grid single" onSubmit={submitReject}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <div className="target-preview"><span>{modalCandidate.document.code}</span><strong>{modalCandidate.name}</strong><p>Đề xuất bị từ chối vẫn được lưu cùng lý do để phục vụ đối soát về sau.</p></div>
        <label className="full">Lý do từ chối<textarea required minLength={5} maxLength={500} value={rejectReason} onChange={event => setRejectReason(event.target.value)} placeholder="VD: Không phải chỉ tiêu định lượng, số liệu trích sai ngữ cảnh..." /></label>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button>
          <button className="btn danger" disabled={submitting}>{submitting ? 'Đang lưu...' : 'Từ chối đề xuất'}</button>
        </div>
      </form>
    </Modal>}

    {modal === 'reextract' && <Modal title="Trích xuất lại văn bản" onClose={closeModal}>
      <div className="form-grid single">
        {error && <div className="form-error full" role="alert">{error}</div>}
        <div className="permission-note warning"><RefreshCw /><div><strong>Đề xuất chưa hiệu chỉnh sẽ được tạo lại</strong><p>Hệ thống đọc lại văn bản và sinh danh sách đề xuất mới. Đề xuất đã duyệt, đã từ chối hoặc đã được hiệu chỉnh thủ công sẽ được giữ nguyên.</p></div></div>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Hủy</button>
          <button type="button" className="btn primary" disabled={submitting} onClick={() => void confirmReextract()}>{submitting ? 'Đang gửi yêu cầu...' : 'Trích xuất lại'}</button>
        </div>
      </div>
    </Modal>}

    {modal === 'cancelExtract' && <Modal title="Dừng trích xuất chỉ tiêu" onClose={closeModal}>
      <div className="form-grid single">
        {error && <div className="form-error full" role="alert">{error}</div>}
        <div className="permission-note warning"><AlertTriangle /><div><strong>Xác nhận dừng lượt trích xuất đang chạy</strong><p>Kết quả chưa hoàn tất của lượt chạy này sẽ không được áp dụng. Dữ liệu đã được duyệt hoặc hiệu chỉnh thủ công vẫn được giữ nguyên.</p></div></div>
        <div className="modal-actions full">
          <button type="button" className="btn secondary" disabled={submitting} onClick={closeModal}>Tiếp tục trích xuất</button>
          <button type="button" className="btn danger" disabled={submitting} onClick={() => void confirmCancelExtraction()}>{submitting ? 'Đang dừng...' : 'Xác nhận dừng'}</button>
        </div>
      </div>
    </Modal>}
  </>;
}
