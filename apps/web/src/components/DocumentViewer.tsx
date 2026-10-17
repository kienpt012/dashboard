import { DownloadOutlined, ExportOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Drawer, Empty, Flex, Grid, Image, Spin, Tag, Typography } from 'antd';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { ScrollBox } from './Scroll';
import { LazyPdfViewer } from './pdf/LazyPdfViewer';
import type { Box, LayoutSpan, PdfFocus, PickedLine } from './pdf/PdfViewer';
import { errorText, http, saveBlob } from '@/lib/api';
import { date, fileSize } from '@/lib/format';
import { documentTypeLabels, type DocumentTextResponse, type SourceDocumentDetail } from '@/types/core';

const INLINE = /^(application\/pdf|image\/(png|jpeg|webp|gif))$/;

/** Chỗ cần mở tới trong văn bản: trang, khung tô sáng (PDF, ảnh) và câu khớp (văn bản chỉ có chữ). */
export type DocumentFocus = PdfFocus & { quote?: string | null };

type Props = {
  id: string | null;
  onClose: () => void;
  focus?: DocumentFocus | null;
  /** Dòng giới thiệu phía trên khung xem (ví dụ: chỉ tiêu đang xem nằm ở đâu). */
  heading?: React.ReactNode;
  /** Nút phụ trên thanh công cụ trình xem PDF. */
  toolbar?: React.ReactNode;
  picking?: boolean;
  onPick?: (line: PickedLine) => void;
};

const fold = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');

/** Văn bản chỉ có chữ (DOCX, XLSX): tô câu khớp trong trang và cuộn tới. */
function TextPages({ pages, focus }: { pages: DocumentTextResponse['pages']; focus?: DocumentFocus | null }) {
  const markRef = useRef<HTMLElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = markRef.current ?? pageRef.current;
    target?.scrollIntoView({ block: 'center' });
  }, [focus?.pageNumber, focus?.quote]);
  const quote = focus?.quote ? fold(focus.quote) : '';
  return (
    <ScrollBox bodyClassName="doc-text" label="Về đầu văn bản">
      {pages.map(page => {
        const here = focus?.pageNumber === page.pageNumber;
        const lines = page.text.split('\n');
        // Dòng có chứa phần đầu câu khớp được tô (câu khớp có thể vắt qua nhiều dòng).
        const head = quote.slice(0, Math.min(quote.length, 24));
        const hit = here && head ? lines.findIndex(line => fold(line).includes(head) || (fold(line).length > 8 && quote.includes(fold(line)))) : -1;
        return (
          <div key={page.pageNumber} ref={here ? pageRef : undefined}>
            {pages.length > 1 && <div className="doc-text-page">Trang {page.pageNumber}</div>}
            {lines.map((line, index) => (
              <Fragment key={index}>
                {index === hit ? (
                  <mark ref={markRef} className="doc-text-mark">
                    {line}
                  </mark>
                ) : (
                  line
                )}
                {'\n'}
              </Fragment>
            ))}
          </div>
        );
      })}
    </ScrollBox>
  );
}

/** Xem nhanh một văn bản trong kho ngay tại chỗ: PDF/ảnh hiện trực tiếp, định dạng khác hiện nội dung đã đọc. */
export function DocumentViewer({ id, onClose, focus, heading, toolbar, picking, onPick }: Props) {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const doc = useApi<SourceDocumentDetail>(id ? `/documents/${id}` : null);
  const inline = doc.data ? INLINE.test(doc.data.mimeType) : false;
  const isPdf = doc.data?.mimeType === 'application/pdf';
  const text = useApi<DocumentTextResponse>(id && doc.data && !inline && doc.data.status === 'PROCESSED' ? `/documents/${id}/text` : null);
  const [url, setUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUrl(null);
    setBytes(null);
    if (!id || !doc.data || !inline) return;
    let active = true;
    let created = '';
    setLoading(true);
    http
      .blob(`/documents/${id}/download`)
      .then(async blob => {
        if (!active) return;
        if (isPdf) setBytes(await blob.arrayBuffer());
        else {
          created = URL.createObjectURL(new Blob([blob], { type: doc.data!.mimeType }));
          setUrl(created);
        }
      })
      .catch(error => active && message.error(errorText(error, 'Không mở được tệp')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
    // Tải lại tệp chỉ khi đổi văn bản (không phải mỗi lần làm mới thông tin văn bản).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, doc.data?.id, doc.data?.mimeType, inline, isPdf, message]);

  const loadSpans = useCallback(
    (pageNumber: number) => http.get<{ spans: LayoutSpan[] }>(`/documents/${id}/pages/${pageNumber}/layout`).then(result => result.spans),
    [id],
  );

  async function download() {
    if (!doc.data) return;
    try {
      saveBlob(await http.blob(`/documents/${doc.data.id}/download`), doc.data.originalName);
    } catch (error) {
      message.error(errorText(error, 'Không tải được tệp'));
    }
  }

  const d = doc.data;
  const box: Box | null | undefined = focus?.box ?? focus?.matchBox;
  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      size={screens.lg ? 1040 : '100%'}
      title={d ? d.docNumber || d.code : 'Văn bản'}
      extra={
        d && (
          <Flex gap={8}>
            <Button icon={<DownloadOutlined />} onClick={() => void download()}>
              Tệp gốc
            </Button>
            <Link to={`/admin/documents/${d.id}`} onClick={onClose}>
              <Button icon={<ExportOutlined />}>Mở trong kho</Button>
            </Link>
          </Flex>
        )
      }
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12 } }}
    >
      {!d ? (
        <Flex justify="center" style={{ padding: 48 }}>
          <Spin />
        </Flex>
      ) : (
        <>
          <div>
            <Typography.Title level={5} style={{ margin: '0 0 8px' }}>
              {d.title}
            </Typography.Title>
            <Descriptions
              size="small"
              column={{ xs: 1, md: 3 }}
              items={[
                { label: 'Loại', children: <Tag style={{ marginInlineEnd: 0 }}>{documentTypeLabels[d.docType]}</Tag> },
                { label: 'Ban hành', children: [d.issuedBy, d.issuedDate ? date(d.issuedDate) : null].filter(Boolean).join(' · ') || '—' },
                { label: 'Tệp', children: `${d.originalName} · ${fileSize(d.size)}${d.pageCount ? ` · ${d.pageCount} trang` : ''}` },
              ]}
            />
          </div>
          {heading}
          <div className={`doc-preview${isPdf ? ' is-pdf' : ''}`}>
            {inline ? (
              loading || (!url && !bytes) ? (
                <Flex justify="center" align="center" style={{ height: '100%', minHeight: 240 }}>
                  <Spin />
                </Flex>
              ) : isPdf && bytes ? (
                <LazyPdfViewer data={bytes} focus={focus} picking={picking} loadSpans={loadSpans} onPick={onPick} extra={toolbar} />
              ) : (
                <Flex justify="center" style={{ padding: 16 }}>
                  <div className="doc-image">
                    <Image src={url!} alt={d.title} preview={!box} />
                    {box && <div className="pdf-mark" style={{ left: `${box[0] * 100}%`, top: `${box[1] * 100}%`, width: `${(box[2] - box[0]) * 100}%`, height: `${(box[3] - box[1]) * 100}%` }} />}
                  </div>
                </Flex>
              )
            ) : text.data?.pages.length ? (
              <TextPages pages={text.data.pages} focus={focus} />
            ) : (
              <Empty image={<FileTextOutlined style={{ fontSize: 40 }} />} description={d.status === 'PROCESSED' ? 'Không đọc được nội dung tệp' : 'Văn bản đang được xử lý'} style={{ padding: 48 }} />
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
