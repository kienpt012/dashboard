import { Flex, Spin } from 'antd';
import { lazy, Suspense, type ComponentProps } from 'react';

// pdf.js nặng (~450KB): chỉ tải khi thật sự mở một văn bản PDF.
const PdfViewer = lazy(() => import('./PdfViewer').then(module => ({ default: module.PdfViewer })));

export function LazyPdfViewer(props: ComponentProps<typeof PdfViewer>) {
  return (
    <Suspense
      fallback={
        <Flex justify="center" align="center" style={{ height: '100%', minHeight: 240 }}>
          <Spin description="Đang mở trình xem văn bản…" />
        </Flex>
      }
    >
      <PdfViewer {...props} />
    </Suspense>
  );
}
