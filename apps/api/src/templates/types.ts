import { FrameworkKind, IssuingLevel, LocalityKind, TargetDirection, TargetFrequency } from '@prisma/client';
import type { DatasetColumn, FormulaSpec } from '../formula';
import type { OrgRole } from './org-templates';

// Kiểu dữ liệu của thư viện bộ chỉ tiêu mẫu. Mẫu chỉ chứa ĐỊNH NGHĨA lấy từ văn bản công khai (tên, mã, đơn vị,
// kỳ, cách chấm điểm); không chứa số liệu thực hiện của bất kỳ địa phương nào.

export interface TemplateDataset {
  code: string;
  name: string;
  description: string;
  ownerRole: OrgRole;
  updateCycle: string;
  sourceSystem?: string;
  collectionGuide: string;
  columns: DatasetColumn[];
}

export interface TemplateTarget {
  /** Khóa ổn định trong mẫu (vd "X0210", "6.4") — dùng để nối chỉ tiêu con với chỉ tiêu cha. */
  key: string;
  parentKey?: string;
  groupName?: string;
  ordinal?: string;
  standardCode?: string;
  title: string;
  description?: string;
  unit: string;
  /** Giá trị mục tiêu dạng số. Bộ chấm điểm dùng điểm tối đa; thiếu thì địa phương cần nhập kế hoạch. */
  targetValue?: number;
  targetText?: string;
  needsPlanValue?: boolean;
  direction?: TargetDirection;
  frequency: TargetFrequency;
  leadRole: OrgRole;
  coordinateRoles?: OrgRole[];
  maxScore?: number;
  scoringRule?: string;
  evidenceRequirement?: string;
  dataSourceSystem?: string;
  dataSourceAgency?: string;
  collectionGuide?: string;
  reportDueDay?: number;
  /** Có công thức thì chỉ tiêu tự tính từ kho dữ liệu; chỉ tiêu cha của bộ chấm điểm tự cộng điểm con. */
  formula?: FormulaSpec;
  sumChildren?: boolean;
  weight?: number;
}

export interface FrameworkTemplate {
  key: string;
  /** Mã bộ khi nạp cho một năm, vd "TT148-2026". */
  codeFor: (year: number) => string;
  nameFor: (year: number) => string;
  kind: FrameworkKind;
  issuingLevel: IssuingLevel;
  legalBasis: string;
  description: string;
  maxScore?: number;
  /** Phạm vi áp dụng để trình thiết lập gợi ý: mọi xã/phường, hay riêng địa phương thuộc một tỉnh. */
  scope: { localityKinds: LocalityKind[]; province?: string };
  datasets?: TemplateDataset[];
  targets: TemplateTarget[];
  /** Năm sớm nhất văn bản có hiệu lực (để cảnh báo khi nạp cho năm khác). */
  effectiveYear?: number;
}

export function frameworkTemplateSummary(template: FrameworkTemplate) {
  return {
    key: template.key,
    kind: template.kind,
    issuingLevel: template.issuingLevel,
    legalBasis: template.legalBasis,
    description: template.description,
    maxScore: template.maxScore ?? null,
    scope: template.scope,
    effectiveYear: template.effectiveYear ?? null,
    targetCount: template.targets.length,
    computedCount: template.targets.filter(target => target.formula).length,
    datasetCount: template.datasets?.length ?? 0,
    sampleName: template.nameFor(template.effectiveYear ?? 2026),
  };
}
