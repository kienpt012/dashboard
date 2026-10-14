import type { PublishedFeedback, PublicOverview, PublicTarget } from '../types';

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

export type CustomHtmlBinding = {
  slot: string;
  label: string;
  source: 'overview' | 'target' | 'document';
  field: string;
  format?: string;
  targetKey?: string;
  documentId?: string;
};

export type PublicDashboardWidget = {
  id: string;
  type: PublicDashboardWidgetType;
  title?: string;
  settings: Record<string, unknown> & {
    html?: string;
    bindings?: CustomHtmlBinding[];
    mode?: 'highlight' | 'all' | 'selected';
    targetKeys?: string[];
    publicationIds?: string[];
    maxItems?: number;
    body?: string;
    label?: string;
    href?: string;
    metricKeys?: string[];
  };
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
  revision: number;
  config: PublicDashboardConfig;
  data: PublicDashboardData;
};

export type DashboardEditorDocumentPublication = {
  id: string;
  title: string;
  summary?: string | null;
  version: number;
  publishedAt?: string | null;
  revokedAt?: string | null;
};

export type DashboardEditorDocument = {
  id: string;
  code: string;
  title: string;
  status: string;
  publication: DashboardEditorDocumentPublication | null;
};

export type DashboardEditorTarget = {
  key: string;
  code: string;
  title: string;
  department: string;
  year: number;
};

export type PublicDashboardRevision = {
  revision: number;
  name?: string | null;
  templateKey?: string | null;
  changeNote?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
};

export type PublicDashboardEditorDashboard = {
  id: string;
  draftName: string;
  draftTemplateKey: string;
  draftConfig: PublicDashboardConfig;
  draftVersion: number;
  publishedRevision?: number | null;
  updatedAt?: string | null;
};

export type PublicDashboardEditorResponse = {
  dashboard: PublicDashboardEditorDashboard;
  history: PublicDashboardRevision[];
  previewData?: PublicDashboardData;
  catalog: {
    targets: DashboardEditorTarget[];
    documents: DashboardEditorDocument[];
  };
};
