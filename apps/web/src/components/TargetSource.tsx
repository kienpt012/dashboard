import { AimOutlined, CloseOutlined, FileSearchOutlined, FileTextOutlined, RobotOutlined, UndoOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Flex, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { invalidate, useApi } from '@/hooks/useApi';
import { errorText, http } from '@/lib/api';
import { DocumentViewer } from './DocumentViewer';
import type { Box, PickedLine } from './pdf/PdfViewer';

export type TargetSourceInfo = {
  status: 'located' | 'not-found' | 'no-document' | 'processing';
  document: { id: string; code: string; title: string; docNumber?: string | null; mimeType: string; pageCount?: number | null } | null;
  anchor: { pageNumber: number | null; box: Box | null; matchBox: Box | null; quote: string | null; score: number | null; manual: boolean; locatedAt: string } | null;
};

/** Tên ngắn của văn bản: số hiệu, hoặc phần đầu tiêu đề trước dấu gạch ("Phụ lục 2 – …" → "Phụ lục 2"). */
const docName = (document: NonNullable<TargetSourceInfo['document']>) => {
  if (document.docNumber) return document.docNumber;
  const head = document.title.split(/\s[–—-]\s/)[0];
  return head.length <= 40 ? head : document.title;
};

/**
 * Văn bản giao của chỉ tiêu và vị trí chỉ tiêu trong đó: bấm để mở văn bản ngay trong hệ thống, đúng trang, tô sáng
 * đúng dòng. Hệ thống tự định vị; người có quyền chỉ lại vị trí khi định vị sai hoặc chưa tìm thấy.
 */
export function TargetSource({ targetId, targetTitle, canEdit, variant = 'block' }: { targetId: string; targetTitle: string; canEdit: boolean; variant?: 'chip' | 'block' }) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const path = `/targets/${targetId}/source`;
  const source = useApi<TargetSourceInfo>(path, { staleTime: 60_000 });
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const info = source.data;
  if (!info?.document) {
    if (variant === 'chip' || !info) return null;
    return <Typography.Text type="secondary">Chưa gắn văn bản giao.</Typography.Text>;
  }
  const document = info.document;
  const anchor = info.anchor;
  const located = info.status === 'located' && anchor?.pageNumber;

  function close() {
    setOpen(false);
    setPicking(false);
  }

  async function pick(line: PickedLine) {
    setSaving(true);
    try {
      await http.put(path, { documentId: document.id, pageNumber: line.pageNumber, box: line.box, quote: line.text });
      await invalidate(client, [path, `/targets/${targetId}/dossier`]);
      message.success(`Đã ghi nhận vị trí chỉ tiêu ở trang ${line.pageNumber}`);
      setPicking(false);
    } catch (error) {
      message.error(errorText(error, 'Không lưu được vị trí'));
    } finally {
      setSaving(false);
    }
  }

  async function resetAuto() {
    try {
      await http.delete(path);
      await invalidate(client, [path]);
      message.success('Đã chuyển về để hệ thống tự định vị');
    } catch (error) {
      message.error(errorText(error, 'Không thực hiện được'));
    }
  }

  const label = located ? `${docName(document)} · trang ${anchor!.pageNumber}` : docName(document);
  const trigger =
    variant === 'chip' ? (
      <Tooltip title={located ? `Mở ${document.title} tại dòng của chỉ tiêu` : `Mở ${document.title}`}>
        <button type="button" className="source-chip" onClick={() => setOpen(true)}>
          <FileSearchOutlined />
          <span className="source-chip-text">{label}</span>
        </button>
      </Tooltip>
    ) : (
      <Flex vertical gap={4} align="flex-start">
        <button type="button" className="doc-ref source-link" onClick={() => setOpen(true)} title={document.title}>
          <FileTextOutlined />
          <span>{document.title}</span>
        </button>
        <Typography.Text type="secondary" className="source-meta">
          {info.status === 'processing'
            ? 'Văn bản đang được đọc…'
            : located
              ? (
                  <>
                    Trang {anchor!.pageNumber}
                    {anchor!.manual ? ' · vị trí do cán bộ chỉ' : anchor!.score ? ` · hệ thống tự định vị, khớp ${Math.min(100, Math.round(anchor!.score * 100))}%` : ''}
                  </>
                )
              : 'Hệ thống chưa tìm thấy dòng của chỉ tiêu trong văn bản'}
        </Typography.Text>
        <Button size="small" type={located ? 'primary' : 'default'} ghost={Boolean(located)} icon={<AimOutlined />} onClick={() => setOpen(true)}>
          {located ? 'Xem đúng dòng trong văn bản' : 'Mở văn bản'}
        </Button>
      </Flex>
    );

  const heading = picking ? (
    <Alert type="info" showIcon title={`Chọn dòng của chỉ tiêu “${targetTitle}”: di chuột lên trang và bấm vào dòng đó.`} />
  ) : located ? (
    <Alert
      type="success"
      showIcon
      icon={anchor!.manual ? <AimOutlined /> : <RobotOutlined />}
      title={
        <span>
          Chỉ tiêu “{targetTitle}” ở <b>trang {anchor!.pageNumber}</b>
          {anchor!.manual ? ' — vị trí do cán bộ chỉ.' : ' — hệ thống tự tìm trong văn bản.'}
        </span>
      }
    />
  ) : info.status === 'not-found' ? (
    <Alert
      type="warning"
      showIcon
      title={`Hệ thống chưa tìm thấy dòng của chỉ tiêu “${targetTitle}” trong văn bản này.${canEdit ? ' Bấm “Chỉ vị trí” rồi chọn dòng đúng.' : ''}`}
    />
  ) : null;

  const toolbar = canEdit && document.mimeType === 'application/pdf' && (
    <Flex gap={6}>
      {picking ? (
        <Button size="small" icon={<CloseOutlined />} disabled={saving} onClick={() => setPicking(false)}>
          Huỷ chọn
        </Button>
      ) : (
        <Button size="small" icon={<AimOutlined />} onClick={() => setPicking(true)}>
          {located ? 'Sai dòng? Chỉ lại' : 'Chỉ vị trí'}
        </Button>
      )}
      {anchor?.manual && !picking && (
        <Tooltip title="Bỏ vị trí chỉ tay, để hệ thống tự định vị lại">
          <Button size="small" icon={<UndoOutlined />} onClick={() => void resetAuto()}>
            Tự định vị
          </Button>
        </Tooltip>
      )}
    </Flex>
  );

  return (
    <>
      {trigger}
      <DocumentViewer
        id={open ? document.id : null}
        onClose={close}
        focus={located ? { pageNumber: anchor!.pageNumber!, box: anchor!.box, matchBox: anchor!.matchBox, quote: anchor!.quote, label: 'Chỉ tiêu ở đây' } : null}
        heading={heading}
        toolbar={toolbar}
        picking={picking}
        onPick={line => void pick(line)}
      />
    </>
  );
}
