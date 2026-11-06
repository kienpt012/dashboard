import { Card, Col, Drawer, Empty, Row, Segmented, Statistic, Table, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LoadError, PageSkeleton } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { dateTime, num, pct } from '@/lib/format';

// B17. Theo dõi chất lượng quy trình xử lý văn bản: dòng OCR phải rà soát, bản ghi trượt từng luật B10, bản ghi do luật
// dự phòng thay vì Qwen, chỉ tiêu gần trùng, thời gian xử lý mỗi trang.

type Quality = {
  days: number;
  documents: number;
  pages: number;
  ocr: { elements: number; flagged: number; reviewRate: number | null };
  candidates: {
    total: number;
    flagged: number;
    flaggedRate: number | null;
    byRule: { rule: string; label: string; count: number; rate: number | null }[];
    llm: number;
    rule: number;
    form: number;
    ruleRate: number | null;
    nearDuplicates: number;
    duplicates: number;
    humanEdited: number;
  };
  llm: { chunks: number; broken: number; brokenRate: number | null };
  timing: { parseMsPerPage: number | null; extractMsPerPage: number | null };
  recent: {
    documentId: string;
    code: string;
    title: string;
    parser: string | null;
    pages: number;
    ocrPages: number;
    ocrReviewRate: number | null;
    msPerPage: number | null;
    llmChunks: number;
    llmBroken: number;
    model: string | null;
    candidates: number;
    flagged: number;
    rule: number;
    near: number;
    finishedAt: string | null;
  }[];
};

const rate = (value: number | null | undefined) => (value === null || value === undefined ? '—' : pct(value * 100));
const seconds = (ms: number | null | undefined) => (ms ? `${num(Math.round(ms / 100) / 10)} giây` : '—');

export function QualityPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [days, setDays] = useState(30);
  const quality = useApi<Quality>(open ? `/documents/quality?days=${days}` : null);
  const data = quality.data;
  return (
    <Drawer open={open} onClose={onClose} title="Chất lượng xử lý văn bản" size="large" destroyOnHidden>
      <Segmented
        value={days}
        onChange={value => setDays(Number(value))}
        options={[
          { value: 7, label: '7 ngày' },
          { value: 30, label: '30 ngày' },
          { value: 90, label: '90 ngày' },
          { value: 365, label: '1 năm' },
        ]}
        style={{ marginBottom: 16 }}
      />
      {quality.error && !data ? (
        <LoadError error={quality.error} retry={() => void quality.refetch()} />
      ) : !data ? (
        <PageSkeleton />
      ) : !data.documents && !data.candidates.total ? (
        <Empty description="Chưa có văn bản nào được xử lý trong khoảng này" />
      ) : (
        <>
          <Row gutter={[12, 12]}>
            <Col xs={12} md={8}>
              <Card size="small">
                <Tooltip title={`${num(data.ocr.flagged)}/${num(data.ocr.elements)} dòng, đoạn đọc bằng OCR mang cờ cần rà soát`}>
                  <Statistic title="Dòng OCR phải rà soát" value={rate(data.ocr.reviewRate)} />
                </Tooltip>
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Tooltip title={`${num(data.candidates.flagged)}/${num(data.candidates.total)} đề xuất trượt ít nhất một luật B10`}>
                  <Statistic title="Đề xuất có cờ kiểm tra" value={rate(data.candidates.flaggedRate)} />
                </Tooltip>
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Tooltip title={`${num(data.candidates.rule)} đề xuất do bộ luật tạo; Qwen lỗi hoặc hết giờ ở ${num(data.llm.broken)}/${num(data.llm.chunks)} đoạn`}>
                  <Statistic title="Từ luật dự phòng thay vì Qwen" value={rate(data.candidates.ruleRate)} />
                </Tooltip>
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Statistic title="Chỉ tiêu gần trùng" value={num(data.candidates.nearDuplicates)} suffix={data.candidates.duplicates ? `· ${num(data.candidates.duplicates)} trùng` : undefined} />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Statistic title="Đọc văn bản mỗi trang" value={seconds(data.timing.parseMsPerPage)} />
              </Card>
            </Col>
            <Col xs={12} md={8}>
              <Card size="small">
                <Statistic title="Trích xuất mỗi trang" value={seconds(data.timing.extractMsPerPage)} />
              </Card>
            </Col>
          </Row>

          <Typography.Title level={5} style={{ marginTop: 20 }}>Tỷ lệ đề xuất trượt từng luật</Typography.Title>
          <Table
            size="small"
            rowKey="rule"
            pagination={false}
            dataSource={data.candidates.byRule}
            columns={[
              { title: 'Luật', dataIndex: 'label' },
              { title: 'Số đề xuất', dataIndex: 'count', align: 'right', render: (value: number) => num(value) },
              { title: 'Tỷ lệ', dataIndex: 'rate', align: 'right', render: (value: number | null) => rate(value) },
            ]}
          />

          <Typography.Title level={5} style={{ marginTop: 20 }}>Văn bản gần đây</Typography.Title>
          <Table
            size="small"
            rowKey="documentId"
            pagination={false}
            scroll={{ x: 760 }}
            dataSource={data.recent}
            columns={[
              {
                title: 'Văn bản',
                dataIndex: 'code',
                render: (_value: string, row) => (
                  <Tooltip title={row.parser ?? undefined}>
                    <Link to={`/admin/documents/${row.documentId}`}>{row.code}</Link>
                  </Tooltip>
                ),
              },
              { title: 'Trang', dataIndex: 'pages', align: 'right', render: (value: number, row) => `${num(value)}${row.ocrPages ? ` (${num(row.ocrPages)} OCR)` : ''}` },
              { title: 'OCR rà soát', dataIndex: 'ocrReviewRate', align: 'right', render: (value: number | null) => rate(value) },
              { title: 'Qwen lỗi', dataIndex: 'llmBroken', align: 'right', render: (value: number, row) => (row.llmChunks ? `${num(value)}/${num(row.llmChunks)}` : '—') },
              { title: 'Đề xuất', dataIndex: 'candidates', align: 'right', render: (value: number) => num(value) },
              { title: 'Có cờ', dataIndex: 'flagged', align: 'right', render: (value: number) => num(value) },
              { title: 'Từ luật', dataIndex: 'rule', align: 'right', render: (value: number) => num(value) },
              { title: 'Gần trùng', dataIndex: 'near', align: 'right', render: (value: number) => num(value) },
              { title: 'Mỗi trang', dataIndex: 'msPerPage', align: 'right', render: (value: number | null) => seconds(value) },
              { title: 'Xong lúc', dataIndex: 'finishedAt', render: (value: string | null) => (value ? dateTime(value) : '—') },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}
