import { useMe } from '@/app/session';
import { useApi } from '@/hooks/useApi';
import { APPROVERS, can } from '@/lib/roles';

// Số cần chú ý cạnh tên chức năng (thanh bên, dock của bàn làm việc): báo cáo chờ mình duyệt, phản ánh mới hoặc xin
// xem xét lại. Thanh bên và dock dùng chung truy vấn nên chỉ tải một lần.

export function useNavCounts() {
  const user = useMe();
  const approvals = useApi<unknown[]>(can(user, APPROVERS) ? '/targets/pending-updates' : null, { refetchInterval: 120_000 });
  const feedback = useApi<{ received?: number; reopenRequested?: number }>('/feedbacks/stats', { refetchInterval: 120_000 });
  return {
    '/admin/approvals': approvals.data?.length ?? 0,
    '/admin/feedback': (feedback.data?.received ?? 0) + (feedback.data?.reopenRequested ?? 0),
  } as Record<string, number>;
}
