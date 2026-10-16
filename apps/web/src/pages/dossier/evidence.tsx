import { FileTextOutlined, LinkOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { App, Button, Flex, Upload, type UploadFile } from 'antd';
import { useState } from 'react';
import { DocumentViewer } from '@/components/DocumentViewer';
import { errorText, http } from '@/lib/api';
import { fileSize } from '@/lib/format';
import type { Evidence } from '@/types/domain';

export const EVIDENCE_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.pdf,.jpg,.jpeg,.png,.webp';
const MAX_BYTES = 10 * 1024 * 1024;
const VIEWABLE = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
const EXTENSIONS: Record<string, string> = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

type Links = { progressUpdateId?: string; directiveId?: string; evaluationId?: string; title?: string; note?: string };

export async function uploadEvidenceFiles(targetId: string, files: File[], links: Links = {}) {
  const failures: string[] = [];
  for (const file of files) {
    const body = new FormData();
    body.set('file', file);
    body.set('title', (files.length === 1 && links.title?.trim()) || file.name);
    for (const key of ['progressUpdateId', 'directiveId', 'evaluationId', 'note'] as const) {
      const value = links[key]?.trim();
      if (value) body.set(key, value);
    }
    try {
      await http.post(`/targets/${targetId}/evidence/upload`, body);
    } catch (error) {
      failures.push(`${file.name}: ${errorText(error)}`);
    }
  }
  return failures;
}

async function openFile(targetId: string, item: Evidence) {
  const raw = await http.blob(`/targets/${targetId}/evidence/${item.id}/download`);
  const type = raw.type || item.mimeType || '';
  const viewable = VIEWABLE.test(type);
  const url = URL.createObjectURL(new Blob([raw], { type: viewable ? type : 'application/octet-stream' }));
  const viewer = viewable ? window.open(url, '_blank') : null;
  if (!viewer) {
    const extension = EXTENSIONS[type] ?? '';
    const link = document.createElement('a');
    link.href = url;
    link.download = extension && !item.title.toLowerCase().endsWith(extension) ? item.title + extension : item.title;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Danh sách minh chứng: tệp (mở qua API có xác thực), liên kết ngoài, văn bản trong kho. */
export function EvidenceList({ targetId, items }: { targetId: string; items: Evidence[] }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);
  if (!items.length) return null;
  return (
    <Flex gap={6} wrap className="evidence-list">
      {items.map(item => {
        if (item.kind === 'LINK') {
          return (
            <a key={item.id} className="evidence" href={item.url ?? undefined} target="_blank" rel="noopener noreferrer" title={item.note || item.url || ''}>
              <LinkOutlined />
              <span>{item.title}</span>
            </a>
          );
        }
        if (item.kind === 'DOCUMENT') {
          return item.sourceDocumentId ? (
            <button key={item.id} type="button" className="evidence" onClick={() => setViewing(item.sourceDocumentId!)}>
              <FileTextOutlined />
              <span>{item.title}</span>
            </button>
          ) : (
            <span key={item.id} className="evidence">
              <FileTextOutlined />
              <span>{item.title}</span>
            </span>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className="evidence"
            disabled={busy === item.id}
            title={item.note || undefined}
            onClick={async () => {
              setBusy(item.id);
              try {
                await openFile(targetId, item);
              } catch (error) {
                message.error(errorText(error, 'Không mở được minh chứng'));
              } finally {
                setBusy('');
              }
            }}
          >
            <PaperClipOutlined />
            <span>{item.title}</span>
            {item.size ? <small>{fileSize(item.size)}</small> : null}
          </button>
        );
      })}
      <DocumentViewer id={viewing} onClose={() => setViewing(null)} />
    </Flex>
  );
}

/** Chọn tệp minh chứng (ảnh/PDF ≤ 10MB, tối đa 10 tệp); tải lên sau khi bản ghi chính được tạo. */
export function EvidencePicker({ files, onChange, label = 'Đính kèm minh chứng' }: { files: File[]; onChange: (files: File[]) => void; label?: string }) {
  const { message } = App.useApp();
  const list: UploadFile[] = files.map((file, index) => ({ uid: String(index), name: file.name, size: file.size, status: 'done' }));
  return (
    <Upload
      multiple
      accept={EVIDENCE_ACCEPT}
      fileList={list}
      beforeUpload={(file, batch) => {
        // antd gọi hàm này cho từng tệp trong một lượt chọn; gom cả lượt ở tệp cuối để không mất tệp.
        if (file !== batch[batch.length - 1]) return false;
        const accepted = batch.filter(item => {
          if (item.size > MAX_BYTES) {
            message.warning(`${item.name} vượt quá 10MB`);
            return false;
          }
          if (item.type && !VIEWABLE.test(item.type)) {
            message.warning(`${item.name}: chỉ nhận ảnh JPEG, PNG, WEBP hoặc PDF`);
            return false;
          }
          return true;
        });
        if (files.length + accepted.length > 10) message.warning('Tối đa 10 tệp mỗi lần');
        onChange([...files, ...accepted].slice(0, 10));
        return false;
      }}
      onRemove={item => onChange(files.filter((_, index) => String(index) !== item.uid))}
    >
      <Button icon={<UploadOutlined />}>{label}</Button>
    </Upload>
  );
}
