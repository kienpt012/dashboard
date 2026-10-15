import { DownloadOutlined, ExportOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Drawer, Empty, Flex, Grid, Image, Spin, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { errorText, http, saveBlob } from '@/lib/api';
import { date, fileSize } from '@/lib/format';
import { documentTypeLabels, type DocumentTextResponse, type SourceDocumentDetail } from '@/types/core';

const INLINE = /^(application\/pdf|image\/(png|jpeg|webp|gif))$/;

/** Xem nhanh một văn bản trong kho ngay tại chỗ: PDF/ảnh hiện trực tiếp, định dạng khác hiện nội dung đã đọc. */
export function DocumentViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { message } = App.useApp();
  const screens = Grid.useBreakpoint();
  const doc = useApi<SourceDocumentDetail>(id ? `/documents/${id}` : null);
  const inline = doc.data ? INLINE.test(doc.data.mimeType) : false;
  const text = useApi<DocumentTextResponse>(id && doc.data && !inline && doc.data.status === 'PROCESSED' ? `/documents/${id}/text` : null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUrl(null);
    if (!id || !doc.data || !inline) return;
    let active = true;
    let created = '';
    setLoading(true);
    http
      .blob(`/documents/${id}/download`)
      .then(blob => {
        if (!active) return;
        created = URL.createObjectURL(new Blob([blob], { type: doc.data!.mimeType }));
        setUrl(created);
      })
      .catch(error => active && message.error(errorText(error, 'Không mở được tệp')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id, doc.data, inline, message]);

  async function download() {
    if (!doc.data) return;
    try {
      saveBlob(await http.blob(`/documents/${doc.data.id}/download`), doc.data.originalName);
    } catch (error) {
      message.error(errorText(error, 'Không tải được tệp'));
    }
  }

  const d = doc.data;
  return (
    <Drawer
      open={Boolean(id)}
      onClose={onClose}
      size={screens.lg ? 980 : '100%'}
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
      styles={{ body: { display: 'flex', flexDirection: 'column', gap: 16 } }}
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
                { label: 'Tệp', children: `${d.originalName} · ${fileSize(d.size)}` },
              ]}
            />
          </div>
          <div className="doc-preview">
            {inline ? (
              loading || !url ? (
                <Flex justify="center" align="center" style={{ height: '100%' }}>
                  <Spin />
                </Flex>
              ) : d.mimeType === 'application/pdf' ? (
                <iframe title={d.title} src={url} />
              ) : (
                <Flex justify="center" style={{ padding: 16 }}>
                  <Image src={url} alt={d.title} />
                </Flex>
              )
            ) : text.data?.pages.length ? (
              <div className="doc-text">{text.data.pages.map(page => page.text).join('\n\n')}</div>
            ) : (
              <Empty image={<FileTextOutlined style={{ fontSize: 40 }} />} description={d.status === 'PROCESSED' ? 'Không đọc được nội dung tệp' : 'Văn bản đang được xử lý'} style={{ padding: 48 }} />
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}
