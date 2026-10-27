import type { DocumentStatus } from '@/types/core';

export const DOC_STATUS: Record<DocumentStatus, { label: string; badge: 'default' | 'processing' | 'success' | 'error' }> = {
  UPLOADED: { label: 'Chờ xử lý', badge: 'default' },
  PROCESSING: { label: 'Đang xử lý', badge: 'processing' },
  PROCESSED: { label: 'Đã xử lý', badge: 'success' },
  FAILED: { label: 'Lỗi xử lý', badge: 'error' },
};
