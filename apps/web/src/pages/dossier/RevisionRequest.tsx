import { Button, Tag } from 'antd';
import { useState } from 'react';
import { ReasonModal } from '@/components/ReasonModal';
import { http } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { useDossier, useDossierRun, type DossierReport } from './context';

export function RevisionRequest({ report }: { report: DossierReport }) {
  const { d } = useDossier();
  const run = useDossierRun();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (report.reviewStatus !== 'APPROVED') return null;
  const pending = Boolean(report.revisionRequestedAt && !report.revisionResolvedAt);
  return <>
    {report.revisionRequestedAt && <div className="entry-line"><Tag color={pending ? 'orange' : 'green'}>{pending ? 'Yêu cầu cập nhật lại' : 'Đã cập nhật lại'}</Tag><span>{report.revisionReason} · {dateTime(report.revisionRequestedAt)}</span></div>}
    {d.permissions.canRequestRevision && !d.isArchived && !pending && <Button size="small" onClick={() => setOpen(true)} style={{ marginTop: 8 }}>Yêu cầu cập nhật lại</Button>}
    <ReasonModal open={open} title="Yêu cầu cập nhật lại" label="Lý do cập nhật lại số liệu" okText="Gửi yêu cầu" loading={busy} onCancel={() => setOpen(false)} onSubmit={async reason => {
      setBusy(true);
      const result = await run(() => http.post(`/targets/${d.id}/updates/${report.id}/request-revision`, { reason }), 'Đã yêu cầu người phụ trách cập nhật lại');
      setBusy(false);
      if (result !== undefined) setOpen(false);
    }} />
  </>;
}
