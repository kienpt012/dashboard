import { CloudUploadOutlined, FileTextOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Flex, Popover, Typography } from 'antd';
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@/app/session';
import { useApi } from '@/hooks/useApi';
import { can, WORKING } from '@/lib/roles';
import type { SourceDocument } from '@/types/core';
import { DocumentViewer } from './DocumentViewer';

// Số hiệu văn bản hành chính: 333/QĐ-UBND, 21/KH-UBND, 148/2026/TT-BTC, 07/2026/NĐ-CP…
const NUMBER = /\d{1,5}\/(?:\d{4}\/)?[A-ZĐ]{1,6}(?:-[A-ZĐ0-9]{1,12})+/gu;

const normalize = (value: string) => value.replace(/\s+/g, '').toUpperCase();

/** Danh mục văn bản trong kho, dùng chung cho mọi chỗ cần đối chiếu số hiệu. */
export function useDocumentIndex() {
  const list = useApi<SourceDocument[]>('/documents', { staleTime: 5 * 60_000 });
  return useMemo(() => {
    const map = new Map<string, SourceDocument>();
    for (const doc of list.data ?? []) {
      if (doc.docNumber) map.set(normalize(doc.docNumber), doc);
      for (const found of `${doc.title} ${doc.originalName}`.match(NUMBER) ?? []) if (!map.has(normalize(found))) map.set(normalize(found), doc);
    }
    return map;
  }, [list.data]);
}

function Missing({ number }: { number: string }) {
  const user = useUser();
  return (
    <Flex vertical gap={8} style={{ maxWidth: 280 }}>
      <Typography.Text>Văn bản {number} chưa có trong kho.</Typography.Text>
      <Flex gap={8} wrap>
        <Link to={`/admin/documents?q=${encodeURIComponent(number)}`}>
          <Button size="small" icon={<SearchOutlined />}>
            Tìm trong kho
          </Button>
        </Link>
        {can(user, WORKING) && (
          <Link to={`/admin/documents?tai-len=1&so=${encodeURIComponent(number)}`}>
            <Button size="small" type="primary" icon={<CloudUploadOutlined />}>
              Tải lên kho
            </Button>
          </Link>
        )}
      </Flex>
    </Flex>
  );
}

/** Câu căn cứ pháp lý có số hiệu văn bản bấm được: mở xem văn bản trong kho, hoặc gợi ý tải lên nếu chưa có. */
export function LegalBasis({ text, className }: { text?: string | null; className?: string }) {
  const index = useDocumentIndex();
  const [open, setOpen] = useState<string | null>(null);
  if (!text) return null;
  const parts: (string | { number: string; doc?: SourceDocument })[] = [];
  let last = 0;
  for (const match of text.matchAll(NUMBER)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ number: match[0], doc: index.get(normalize(match[0])) });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return (
    <span className={className}>
      {parts.map((part, position) =>
        typeof part === 'string' ? (
          <Fragment key={position}>{part}</Fragment>
        ) : part.doc ? (
          <button key={position} type="button" className="doc-ref" onClick={() => setOpen(part.doc!.id)} title={part.doc.title}>
            <FileTextOutlined />
            {part.number}
          </button>
        ) : (
          <Popover key={position} content={<Missing number={part.number} />} trigger="click">
            <button type="button" className="doc-ref missing">
              {part.number}
            </button>
          </Popover>
        ),
      )}
      <DocumentViewer id={open} onClose={() => setOpen(null)} />
    </span>
  );
}

/** Nút mở xem nhanh một văn bản đã biết mã trong kho. */
export function DocumentLink({ id, children }: { id: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="doc-ref" onClick={() => setOpen(true)}>
        <FileTextOutlined />
        {children}
      </button>
      <DocumentViewer id={open ? id : null} onClose={() => setOpen(false)} />
    </>
  );
}
