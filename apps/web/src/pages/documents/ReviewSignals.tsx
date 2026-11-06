import { BranchesOutlined, MergeCellsOutlined, TagOutlined, WarningOutlined } from '@ant-design/icons';
import { Button, Flex, Space, Tag, Tooltip, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { pct } from '@/lib/format';
import { validationRuleLabels, type IndicatorCandidate, type MatchClass, type OcrReading } from '@/types/core';

// B15: những gì người duyệt cần thấy cùng lúc: mục chứa chỉ tiêu, cờ kiểm tra B10, hai bản đọc OCR (phần khác nhau tô
// màu, âm tiết không hợp lệ gạch chân), chỉ tiêu gần trùng B14 và gợi ý mã trong danh mục.

export const MATCH_LABEL: Record<MatchClass, { label: string; color: string }> = {
  TRUNG: { label: 'Trùng chỉ tiêu có sẵn', color: 'red' },
  GAN_TRUNG: { label: 'Gần trùng', color: 'orange' },
  MOI: { label: 'Chỉ tiêu mới', color: 'default' },
};

export function methodTag(item: Pick<IndicatorCandidate, 'extractionMethod' | 'origin'>) {
  if (item.origin === 'HUMAN' || item.extractionMethod === 'LLM') return null;
  return (
    <Tooltip title={item.extractionMethod === 'FORM_TEMPLATE' ? 'Ô biểu mẫu cố định, luật tạo bản ghi không qua Qwen' : 'Bản ghi do bộ luật tạo, không phải Qwen: đối chiếu kỹ với văn bản'}>
      <Tag color="purple">{item.extractionMethod === 'FORM_TEMPLATE' ? 'Kết quả từ luật · biểu mẫu' : 'Kết quả từ luật'}</Tag>
    </Tooltip>
  );
}

/** So khớp từng từ (LCS) để tô các từ hai bộ đọc khác nhau. */
function diffWords(a: string[], b: string[]): boolean[] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const same = new Array<boolean>(a.length).fill(false);
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) {
      same[i] = true;
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) i += 1;
    else j += 1;
  }
  return same;
}

function ReadingLine({ label, text, other, invalid }: { label: string; text: string; other: string; invalid?: string[] }) {
  const words = text.split(/\s+/).filter(Boolean);
  const same = diffWords(words.map(word => word.toLowerCase()), other.split(/\s+/).filter(Boolean).map(word => word.toLowerCase()));
  const bad = new Set((invalid ?? []).map(word => word.toLowerCase()));
  return (
    <div className="ocr-reading">
      <span className="ocr-reading-label">{label}</span>
      <span>
        {words.map((word, index) => {
          const plain = word.toLowerCase().replace(/[.,;:!?()"“”]/g, '');
          const classes = [same[index] ? '' : 'ocr-diff', bad.has(plain) ? 'ocr-invalid' : ''].filter(Boolean).join(' ');
          return (
            <span key={index}>
              {index ? ' ' : ''}
              {classes ? <span className={classes}>{word}</span> : word}
            </span>
          );
        })}
      </span>
    </div>
  );
}

export function OcrReadings({ readings }: { readings: OcrReading[] }) {
  return (
    <Flex vertical gap={6}>
      {readings.slice(0, 4).map((reading, index) => (
        <div key={index} className="ocr-readings">
          <ReadingLine label="VietOCR" text={reading.vietocr ?? reading.text} other={reading.second ?? ''} invalid={reading.invalidSyllables} />
          {reading.second ? <ReadingLine label="Bộ đọc 2" text={reading.second} other={reading.vietocr ?? reading.text} /> : null}
          {reading.vietocr && reading.text !== reading.vietocr ? <ReadingLine label="Đã gộp" text={reading.text} other={reading.vietocr} /> : null}
        </div>
      ))}
    </Flex>
  );
}

export function CandidateSignals({
  item,
  onMerge,
  onUseCode,
  merging,
  usingCode,
}: {
  item: IndicatorCandidate;
  onMerge?: (targetId: string) => void;
  onUseCode?: (code: string) => void;
  merging?: boolean;
  usingCode?: boolean;
}) {
  const flags = item.validationFlags ?? [];
  const similar = item.similarTargets?.items ?? [];
  const open = item.status === 'PROPOSED' || item.status === 'SUBMITTED';
  return (
    <Flex vertical gap={8} style={{ marginTop: 8 }} onClick={event => event.stopPropagation()}>
      {item.headingPath?.length ? (
        <div className="entry-meta">
          <BranchesOutlined /> {item.headingPath.join(' › ')}
        </div>
      ) : null}
      {flags.length ? (
        <div className="review-flags">
          <Typography.Text strong style={{ fontSize: 12.5 }}>
            <WarningOutlined /> Cần đối chiếu ({flags.length})
          </Typography.Text>
          <ul>
            {flags.map((flag, index) => (
              <li key={index}>
                <b>{validationRuleLabels[flag.rule] ?? flag.rule}:</b> {flag.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {item.ocrReadings?.length ? (
        <div>
          <div className="entry-meta" style={{ marginBottom: 4 }}>
            Hai bản đọc OCR của dòng nguồn (từ khác nhau tô màu, âm tiết không hợp lệ gạch chân)
          </div>
          <OcrReadings readings={item.ocrReadings} />
        </div>
      ) : null}
      {item.mergedTarget ? (
        <div className="entry-meta">
          Đã gộp vào chỉ tiêu <Link to={`/admin/targets/${item.mergedTarget.id}`}>{item.mergedTarget.code}</Link> — {item.mergedTarget.title}
        </div>
      ) : similar.length ? (
        <div>
          <div className="entry-meta" style={{ marginBottom: 4 }}>
            {item.similarTargets?.method === 'dice' ? 'Chỉ tiêu có tên gần giống (so theo chữ)' : 'Chỉ tiêu gần nhất theo nghĩa (bge-m3)'}
          </div>
          <Flex vertical gap={4}>
            {similar.slice(0, 3).map(target => (
              <Flex key={target.id} justify="space-between" align="center" gap={8} className="similar-row">
                <span>
                  <Link to={`/admin/targets/${target.id}`}>{target.code}</Link> {target.title}
                  <span className="muted"> · {target.unit} · {target.year} · {pct(target.score * 100)}</span>
                </span>
                {open && item.canDecide && onMerge && (
                  <Button size="small" icon={<MergeCellsOutlined />} loading={merging} onClick={() => onMerge(target.id)}>
                    Gộp vào
                  </Button>
                )}
              </Flex>
            ))}
          </Flex>
        </div>
      ) : null}
      {item.suggestedCode && !item.standardCode ? (
        <Flex align="center" gap={8} wrap className="entry-meta">
          <span>
            <TagOutlined /> Gợi ý mã trong danh mục: <b>{item.suggestedCode}</b>
            {item.suggestedCodeScore ? ` (${pct(item.suggestedCodeScore * 100)})` : ''}
          </span>
          {open && item.canEdit && onUseCode && (
            <Button size="small" type="link" loading={usingCode} onClick={() => onUseCode(item.suggestedCode!)} style={{ padding: 0 }}>
              Dùng mã này
            </Button>
          )}
        </Flex>
      ) : null}
    </Flex>
  );
}

export function matchTag(item: Pick<IndicatorCandidate, 'matchClass' | 'matchScore' | 'isDuplicateSuspect'>) {
  if (item.matchClass && item.matchClass !== 'MOI') {
    const meta = MATCH_LABEL[item.matchClass];
    return (
      <Tag color={meta.color} icon={<WarningOutlined />}>
        {meta.label}
        {item.matchScore ? ` · ${pct(item.matchScore * 100)}` : ''}
      </Tag>
    );
  }
  if (!item.matchClass && item.isDuplicateSuspect) {
    return (
      <Tag color="orange" icon={<WarningOutlined />}>
        Có thể trùng
      </Tag>
    );
  }
  return null;
}

export function flagCountTag(item: Pick<IndicatorCandidate, 'validationFlags' | 'ocrFlags'>) {
  const count = item.validationFlags?.length ?? 0;
  const ocr = item.ocrFlags?.includes('can_ra_soat');
  return (
    <Space size={4}>
      {count ? <Tag color="volcano">{count} cờ kiểm tra</Tag> : null}
      {ocr ? <Tag color="gold">OCR cần rà soát</Tag> : null}
    </Space>
  );
}
