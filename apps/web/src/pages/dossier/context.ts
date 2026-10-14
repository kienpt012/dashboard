import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { createContext, useContext } from 'react';
import { invalidate } from '@/hooks/useApi';
import { ApiError, errorText } from '@/lib/api';
import type { CurrentUser } from '@/types/auth';
import type { Directive, Dossier, Report } from '@/types/domain';

/** API trả thêm vài trường mà kiểu chung chưa khai báo. */
export type DossierReport = Report & { userId: string; baseVersion: number; reviewedBy?: string | null };
export type DossierDirective = Directive & { createdById: string; sourceDocumentId?: string | null };
export type DossierData = Omit<Dossier, 'reports' | 'directives'> & {
  reports: DossierReport[];
  directives: DossierDirective[];
  computedAt?: string | null;
  assignedAt?: string | null;
  archivedAt?: string | null;
  archiveReason?: string | null;
};

type Ctx = { d: DossierData; me: CurrentUser; refresh: () => Promise<void> };

export const DossierContext = createContext<Ctx | null>(null);

export function useDossier() {
  const value = useContext(DossierContext);
  if (!value) throw new Error('Thiếu hồ sơ chỉ tiêu');
  return value;
}

/** Chạy một thao tác trên hồ sơ: báo kết quả, tải lại hồ sơ và các màn hình liên quan; 409 thì tải lại để thấy bản mới. */
export function useDossierRun() {
  const { message } = App.useApp();
  const client = useQueryClient();
  const { refresh } = useDossier();
  return async function run<T>(task: () => Promise<T>, success?: string): Promise<T | undefined> {
    try {
      const result = await task();
      if (success) message.success(success);
      await Promise.all([refresh(), invalidate(client, ['/targets', '/ioc', '/my-work', '/notifications'])]);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        message.warning('Hồ sơ vừa được người khác cập nhật, đã tải lại bản mới');
        await refresh();
      } else {
        message.error(errorText(error));
      }
      return undefined;
    }
  };
}
