import type { IssuingLevel } from '@prisma/client';

export const DOC_REF_INCLUDE = {
  sourceDocument: { select: { docNumber: true } },
  framework: { select: { name: true, docNumber: true, legalBasis: true, issuingLevel: true, sourceDocument: { select: { docNumber: true } } } },
} as const;

type ReferenceSource = {
  ordinal?: string | null;
  issuingLevel?: IssuingLevel | null;
  sourceDocument?: { docNumber?: string | null } | null;
  framework?: {
    name?: string | null; docNumber?: string | null; legalBasis?: string | null; issuingLevel?: IssuingLevel | null;
    sourceDocument?: { docNumber?: string | null } | null;
  } | null;
};
const clean = (value?: string | null) => value?.trim() || null;

/** Một nguồn xác định văn bản giao cho mọi API, thông báo và tệp báo cáo. */
export function docRef(target: ReferenceSource) {
  const framework = target.framework;
  const basis = framework?.legalBasis?.match(/\b\d+[\p{L}\d.-]*\/[\p{L}\d]+(?:[-/][\p{L}\d]+)*/u)?.[0] ?? null;
  const name = clean(framework?.name);
  return {
    docRef: clean(target.sourceDocument?.docNumber) || clean(framework?.sourceDocument?.docNumber) || clean(framework?.docNumber) || basis || (name && (name.length > 80 ? `${name.slice(0, 77).trimEnd()}…` : name)),
    issuingLevel: framework?.issuingLevel ?? target.issuingLevel ?? null,
    ordinal: clean(target.ordinal),
  };
}

const LEVELS: Record<IssuingLevel, string> = { CENTRAL: 'Trung ương giao', PROVINCE: 'Tỉnh/Thành phố giao', LOCAL: 'Phường giao' };
export function docRefText(target: ReferenceSource) {
  const ref = docRef(target);
  return [ref.ordinal && `STT ${ref.ordinal}`, ref.docRef, ref.issuingLevel && LEVELS[ref.issuingLevel]].filter(Boolean).join(' · ');
}
