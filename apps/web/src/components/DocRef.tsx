import { issuingLevelLabels } from '@/types/domain';
import type { IssuingLevel } from '@/types/domain';

export type DocReference = { docRef?: string | null; ordinal?: string | null; issuingLevel?: IssuingLevel | null };
export function docRefText(input: DocReference | object) {
  const value = input as DocReference;
  return [value.ordinal?.trim() && `STT ${value.ordinal.trim()}`, value.docRef?.trim(), value.issuingLevel && issuingLevelLabels[value.issuingLevel]].filter(Boolean).join(' · ');
}
export function DocRef({ value }: { value: DocReference | object }) {
  const text = docRefText(value);
  return text ? <span className="doc-ref">{text}</span> : null;
}
