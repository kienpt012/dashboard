import { HCM_DTI_2026_TEMPLATE } from './hcm-dti-2026';
import { HCM_KTXH_2026_TEMPLATE } from './hcm-ktxh-2026';
import { TT148_TEMPLATE } from './tt148';
import type { FrameworkTemplate } from './types';

export { BUILTIN_DATASETS, DATASET_CATALOG } from './datasets-catalog';
export { ORG_TEMPLATES, ROLE_FALLBACK, type OrgRole, type TemplateDepartment } from './org-templates';
export { frameworkTemplateSummary, type FrameworkTemplate, type TemplateDataset, type TemplateTarget } from './types';

/** Thư viện bộ chỉ tiêu mẫu. Thêm mẫu mới cho tỉnh khác: tạo tệp định nghĩa và đăng ký vào đây. */
export const FRAMEWORK_TEMPLATES: FrameworkTemplate[] = [
  TT148_TEMPLATE,
  HCM_KTXH_2026_TEMPLATE,
  HCM_DTI_2026_TEMPLATE,
];

export function findFrameworkTemplate(key: string): FrameworkTemplate | undefined {
  return FRAMEWORK_TEMPLATES.find(template => template.key === key);
}
