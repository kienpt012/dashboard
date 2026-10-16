import type { PublicOverview, PublicTarget, PublishedFeedback } from '@/types/core';

// Cấu hình trang công khai (bản nháp, bản công bố) — khớp với apps/api/src/public-dashboard.ts.

export type PublicDashboardWidgetType =
  | 'overviewMetrics'
  | 'targetList'
  | 'departmentProgress'
  | 'feedbackList'
  | 'documentList'
  | 'richText'
  | 'customHtml'
  | 'cta';

export type PublicDashboardBreakpoint = 'desktop' | 'tablet' | 'mobile';

export type PublicDashboardTheme = {
  accent: string;
  background: string;
  surface: string;
  text: string;
  contentWidth: number;
  radius: number;
};

export type PublicDashboardLayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type CustomHtmlBindingSource = 'overview' | 'target' | 'document';

export type CustomHtmlBinding = {
  slot: string;
  label: string;
  source: CustomHtmlBindingSource;
  field: string;
  format?: string;
  targetKey?: string;
  documentId?: string;
};

export type TargetListMode = 'highlight' | 'all' | 'selected';

export type PublicDashboardWidgetSettings = {
  html?: string;
  bindings?: CustomHtmlBinding[];
  mode?: TargetListMode;
  targetKeys?: string[];
  publicationIds?: string[];
  maxItems?: number;
  body?: string;
  label?: string;
  href?: string;
  metricKeys?: string[];
};

export type PublicDashboardWidget = {
  id: string;
  type: PublicDashboardWidgetType;
  title?: string;
  settings: PublicDashboardWidgetSettings;
};

export type PublicDashboardConfig = {
  schemaVersion: 1;
  theme: PublicDashboardTheme;
  settings: {
    showHeader: boolean;
    showFooter: boolean;
  };
  widgets: PublicDashboardWidget[];
  layouts: Record<PublicDashboardBreakpoint, PublicDashboardLayoutItem[]>;
};

export type PublicDashboardDocument = {
  id: string;
  code: string;
  title: string;
  summary?: string | null;
  publishedAt?: string | null;
  downloadUrl?: string | null;
};

export type PublicDashboardData = {
  overview: PublicOverview;
  targets: PublicTarget[];
  feedbacks: PublishedFeedback[];
  documents: PublicDashboardDocument[];
};

export type PublicDashboardResponse = {
  /** 0 khi chưa có bản nào được công bố (máy chủ trả cấu hình mặc định). */
  revision: number;
  config: PublicDashboardConfig;
  data: PublicDashboardData;
};

export type DocumentPublication = {
  id: string;
  publicCode?: string;
  title: string;
  summary?: string | null;
  version: number;
  publishedAt?: string | null;
  revokedAt?: string | null;
};

export type EditorDocument = {
  id: string;
  code: string;
  title: string;
  status: string;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  publication: DocumentPublication | null;
};

export type EditorTarget = {
  key: string;
  code: string;
  title: string;
  department: string;
  year: number;
};

export type DashboardRevision = {
  revision: number;
  name?: string | null;
  templateKey?: string | null;
  changeNote?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
};

export type EditorDashboard = {
  id: string;
  draftName: string;
  draftTemplateKey: string;
  draftConfig: PublicDashboardConfig;
  draftVersion: number;
  publishedRevision?: number | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type EditorResponse = {
  dashboard: EditorDashboard;
  history: DashboardRevision[];
  previewData: PublicDashboardData;
  catalog: { targets: EditorTarget[]; documents: EditorDocument[] };
  templates: { key: string; name: string; description: string }[];
  bindingFields: Record<CustomHtmlBindingSource, string[]>;
};
