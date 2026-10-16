import { AimOutlined, ColumnWidthOutlined, LeftOutlined, RightOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { Button, Flex, InputNumber, Spin, Tooltip, Typography } from 'antd';
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

GlobalWorkerOptions.workerSrc = workerUrl;

/** Khung chuẩn hoá 0..1 trên trang (gốc trên-trái), cùng hệ toạ độ với bố cục máy chủ lưu. */
export type Box = [number, number, number, number];
export type LayoutSpan = [number, number, number, number, string];
export type PdfFocus = { pageNumber: number; box?: Box | null; matchBox?: Box | null; label?: string };
export type PickedLine = { pageNumber: number; box: Box; text: string };

type Size = { width: number; height: number };

type Props = {
  /** Nội dung tệp PDF (được sao chép trước khi giao cho pdf.js). */
  data: ArrayBuffer;
  focus?: PdfFocus | null;
  /** Chế độ chọn dòng: hiện khung từng dòng chữ để người dùng bấm chọn. */
  picking?: boolean;
  loadSpans?: (pageNumber: number) => Promise<LayoutSpan[]>;
  onPick?: (line: PickedLine) => void;
  /** Nút phụ trên thanh công cụ (ví dụ "Chỉ lại vị trí"). */
  extra?: React.ReactNode;
};

const GAP = 16;
const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/** Dòng (hàng bảng) chứa một đoạn chữ: mọi đoạn có tâm dọc nằm trong dải dọc của đoạn đó. */
function rowOf(spans: LayoutSpan[], span: LayoutSpan): PickedLine['box'] {
  const pad = (span[3] - span[1]) * 0.25;
  const inRow = spans.filter(other => {
    const center = (other[1] + other[3]) / 2;
    return center >= span[1] - pad && center <= span[3] + pad;
  });
  return [
    Math.min(...inRow.map(item => item[0])),
    Math.min(...inRow.map(item => item[1])),
    Math.max(...inRow.map(item => item[2])),
    Math.max(...inRow.map(item => item[3])),
  ];
}

const pct = (value: number) => `${(value * 100).toFixed(3)}%`;
const boxStyle = (box: Box, pad = 0.004): React.CSSProperties => ({
  left: pct(Math.max(0, box[0] - pad)),
  top: pct(Math.max(0, box[1] - pad)),
  width: pct(Math.min(1, box[2] + pad) - Math.max(0, box[0] - pad)),
  height: pct(Math.min(1, box[3] + pad) - Math.max(0, box[1] - pad)),
});

function PageCanvas({ pdf, pageNumber, scale, onSize }: { pdf: PDFDocumentProxy; pageNumber: number; scale: number; onSize: (pageNumber: number, size: Size) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let task: RenderTask | null = null;
    let cancelled = false;
    void pdf.getPage(pageNumber).then(page => {
      if (cancelled || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1 });
      onSize(pageNumber, { width: base.width, height: base.height });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * ratio });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, pageNumber, scale, onSize]);
  return <canvas ref={canvasRef} aria-label={`Trang ${pageNumber}`} />;
}

function PickLayer({ pageNumber, loadSpans, onPick }: { pageNumber: number; loadSpans: (pageNumber: number) => Promise<LayoutSpan[]>; onPick: (line: PickedLine) => void }) {
  const [spans, setSpans] = useState<LayoutSpan[] | null>(null);
  const [hover, setHover] = useState<Box | null>(null);
  useEffect(() => {
    let active = true;
    loadSpans(pageNumber).then(result => active && setSpans(result), () => active && setSpans([]));
    return () => {
      active = false;
    };
  }, [pageNumber, loadSpans]);
  if (!spans) return null;
  return (
    <div className="pdf-pick-layer">
      {hover && <div className="pdf-pick-row" style={boxStyle(hover, 0.002)} />}
      {spans.map((span, index) => (
        <button
          key={index}
          type="button"
          className="pdf-span"
          style={boxStyle([span[0], span[1], span[2], span[3]], 0.001)}
          title={span[4]}
          aria-label={`Chọn dòng: ${span[4]}`}
          onMouseEnter={() => setHover(rowOf(spans, span))}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(rowOf(spans, span))}
          onClick={() => onPick({ pageNumber, box: rowOf(spans, span), text: span[4] })}
        />
      ))}
    </div>
  );
}

/**
 * Trình xem PDF trong hệ thống: vẽ trang bằng pdf.js (chỉ những trang đang nhìn thấy), mở thẳng tới trang của chỉ tiêu
 * và tô sáng đúng dòng; chế độ chọn dòng cho người dùng chỉ lại vị trí khi hệ thống định vị sai.
 */
export function PdfViewer({ data, focus, picking = false, loadSpans, onPick, extra }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sizes, setSizes] = useState<Record<number, Size>>({});
  const [fallback, setFallback] = useState<Size | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [visible, setVisible] = useState<number[]>([]);
  const [current, setCurrent] = useState(1);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    let active = true;
    setPdf(null);
    setError(null);
    setSizes({});
    // pdf.js chuyển bộ đệm sang worker (làm rỗng bản gốc): giao bản sao.
    const task = getDocument({ data: new Uint8Array(data.slice(0)) });
    task.promise.then(
      async document => {
        const first = (await document.getPage(focus?.pageNumber && focus.pageNumber <= document.numPages ? focus.pageNumber : 1)).getViewport({ scale: 1 });
        if (!active) return;
        setFallback({ width: first.width, height: first.height });
        setPdf(document);
      },
      reason => active && setError(reason instanceof Error ? reason.message : 'Không mở được tệp PDF'),
    );
    return () => {
      active = false;
      // Huỷ tác vụ tải cũng giải phóng tài liệu đã mở trong worker.
      void task.destroy();
    };
    // Chỉ mở lại khi đổi tệp; trang cần tới xử lý riêng ở hiệu ứng cuộn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [pdf]);

  const fit = fallback && width ? Math.max(0.3, (width - GAP * 2) / fallback.width) : 1;
  const scale = fit * zoom;
  const sizeOf = useCallback((pageNumber: number) => sizes[pageNumber] ?? fallback ?? { width: 595, height: 842 }, [sizes, fallback]);
  const onSize = useCallback((pageNumber: number, size: Size) => {
    setSizes(previous => (previous[pageNumber]?.width === size.width && previous[pageNumber]?.height === size.height ? previous : { ...previous, [pageNumber]: size }));
  }, []);

  // Trang đang trong tầm nhìn (cộng thêm một màn hình trên, dưới) mới được vẽ.
  const updateVisible = useCallback(() => {
    const element = scrollRef.current;
    if (!element || !pdf) return;
    const top = element.scrollTop - element.clientHeight;
    const bottom = element.scrollTop + element.clientHeight * 2;
    const middle = element.scrollTop + element.clientHeight / 3;
    const shown: number[] = [];
    let here = 1;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const node = pageRefs.current.get(pageNumber);
      if (!node) continue;
      const start = node.offsetTop;
      const end = start + node.offsetHeight;
      if (end >= top && start <= bottom) shown.push(pageNumber);
      if (start <= middle) here = pageNumber;
    }
    setVisible(previous => (previous.length === shown.length && previous.every((value, index) => value === shown[index]) ? previous : shown));
    setCurrent(here);
  }, [pdf]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateVisible);
    };
    element.addEventListener('scroll', onScroll, { passive: true });
    updateVisible();
    return () => {
      element.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [updateVisible, scale, sizes]);

  const goTo = useCallback(
    (pageNumber: number, box?: Box | null, smooth = true) => {
      const element = scrollRef.current;
      const node = pageRefs.current.get(pageNumber);
      if (!element || !node) return;
      const offset = box ? box[1] * node.offsetHeight - element.clientHeight / 3 : -GAP;
      element.scrollTo({ top: Math.max(0, node.offsetTop + offset), behavior: smooth ? 'smooth' : 'auto' });
    },
    [],
  );

  // Mở văn bản: tới thẳng dòng của chỉ tiêu (không cuộn mượt từ trang 1), rồi nháy sáng.
  const focusKey = focus ? `${focus.pageNumber}:${focus.box?.join(',') ?? ''}` : '';
  useEffect(() => {
    if (!pdf || !focus || !width) return;
    const frame = requestAnimationFrame(() => {
      goTo(focus.pageNumber, focus.box ?? focus.matchBox, false);
      setPulse(value => value + 1);
      updateVisible();
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, focusKey, width > 0]);

  const pages = useMemo(() => (pdf ? Array.from({ length: pdf.numPages }, (_, index) => index + 1) : []), [pdf]);

  if (error) {
    return (
      <Flex justify="center" align="center" style={{ height: '100%', padding: 24 }}>
        <Typography.Text type="danger">Không mở được tệp PDF: {error}</Typography.Text>
      </Flex>
    );
  }

  const zoomIndex = ZOOMS.findIndex(value => value >= zoom - 0.001);
  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <Flex align="center" gap={4}>
          <Button size="small" type="text" icon={<LeftOutlined />} aria-label="Trang trước" disabled={!pdf || current <= 1} onClick={() => goTo(current - 1)} />
          <InputNumber
            size="small"
            min={1}
            max={pdf?.numPages ?? 1}
            value={current}
            controls={false}
            style={{ width: 56 }}
            aria-label="Số trang"
            onPressEnter={event => {
              const value = Number((event.target as HTMLInputElement).value);
              if (pdf && value >= 1 && value <= pdf.numPages) goTo(value);
            }}
          />
          <Typography.Text type="secondary" className="num">/ {pdf?.numPages ?? '…'}</Typography.Text>
          <Button size="small" type="text" icon={<RightOutlined />} aria-label="Trang sau" disabled={!pdf || current >= (pdf?.numPages ?? 1)} onClick={() => goTo(current + 1)} />
        </Flex>
        <Flex align="center" gap={2}>
          <Tooltip title="Thu nhỏ">
            <Button size="small" type="text" icon={<ZoomOutOutlined />} aria-label="Thu nhỏ" disabled={zoomIndex <= 0} onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)])} />
          </Tooltip>
          <Typography.Text className="num pdf-zoom">{Math.round(zoom * 100)}%</Typography.Text>
          <Tooltip title="Phóng to">
            <Button size="small" type="text" icon={<ZoomInOutlined />} aria-label="Phóng to" disabled={zoomIndex >= ZOOMS.length - 1} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)])} />
          </Tooltip>
          <Tooltip title="Vừa khung">
            <Button size="small" type="text" icon={<ColumnWidthOutlined />} aria-label="Vừa khung" onClick={() => setZoom(1)} />
          </Tooltip>
        </Flex>
        {focus && (
          <Button
            size="small"
            icon={<AimOutlined />}
            onClick={() => {
              goTo(focus.pageNumber, focus.box ?? focus.matchBox);
              setPulse(value => value + 1);
            }}
          >
            Về dòng tô sáng (trang {focus.pageNumber})
          </Button>
        )}
        <span style={{ flex: 1 }} />
        {extra}
      </div>
      {picking && <div className="pdf-pick-hint">Di chuột lên văn bản và bấm vào dòng chứa chỉ tiêu.</div>}
      <div className="pdf-pages" ref={scrollRef}>
        {!pdf ? (
          <Flex justify="center" align="center" style={{ height: '100%' }}>
            <Spin description="Đang mở văn bản…">
              <div style={{ width: 120, height: 80 }} />
            </Spin>
          </Flex>
        ) : (
          pages.map(pageNumber => {
            const size = sizeOf(pageNumber);
            const shown = visible.includes(pageNumber);
            const focused = focus?.pageNumber === pageNumber;
            return (
              <div
                key={pageNumber}
                ref={node => {
                  if (node) pageRefs.current.set(pageNumber, node);
                  else pageRefs.current.delete(pageNumber);
                }}
                className="pdf-page"
                style={{ width: size.width * scale, height: size.height * scale }}
                data-page={pageNumber}
              >
                {shown && <PageCanvas pdf={pdf} pageNumber={pageNumber} scale={scale} onSize={onSize} />}
                {focused && (focus.box || focus.matchBox) && (
                  <>
                    {focus.box && <div key={`row-${pulse}`} className="pdf-mark" style={boxStyle(focus.box)} />}
                    {focus.matchBox && <div className="pdf-mark-text" style={boxStyle(focus.matchBox, 0.002)} />}
                    <div className="pdf-mark-label" style={{ left: pct(Math.max(0, (focus.box ?? focus.matchBox)![0] - 0.004)), top: pct(Math.max(0, (focus.box ?? focus.matchBox)![1] - 0.004)) }}>
                      {focus.label ?? 'Chỉ tiêu ở đây'}
                    </div>
                  </>
                )}
                {picking && shown && loadSpans && onPick && <PickLayer pageNumber={pageNumber} loadSpans={loadSpans} onPick={onPick} />}
                <span className="pdf-page-number">{pageNumber}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
