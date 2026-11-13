import { Card, Flex } from 'antd';
import { Link } from 'react-router-dom';
import { Metric } from '@/components/Data';
import { Query } from '@/components/States';
import { useReadScope } from '@/components/ReadScope';
import { useApi } from '@/hooks/useApi';
import { num } from '@/lib/format';
import type { DirectiveList } from './types';

export function DirectiveOpsCard({ year }: { year: number }) {
  const readScope = useReadScope();
  const data = useApi<DirectiveList>(`/directives?year=${year}&scope=${readScope.scope}`, { refetchInterval: 120_000 });
  return <Card title="Văn bản chỉ đạo" className="card-flush" extra={<Link to={`/admin/van-ban-chi-dao?year=${year}`}>Xem tất cả</Link>}>
    <Query query={data}>{result => <Flex wrap>
      <Metric label="Tổng nhiệm vụ" value={num(result.summary.total)} to={`/admin/van-ban-chi-dao?year=${year}`} />
      <Metric label="Hoàn thành" value={`${result.summary.total ? Math.round(result.summary.completed * 100 / result.summary.total) : 0}%`} to={`/admin/van-ban-chi-dao?year=${year}&status=COMPLETED`} />
      <Metric label="Nhiệm vụ quá hạn" value={num(result.summary.overdue)} tone={result.summary.overdue ? 'bad' : undefined} to={`/admin/van-ban-chi-dao?year=${year}&status=OVERDUE`} />
      <Metric label="Đến hạn trong 7 ngày" value={num(result.summary.dueSoon)} tone={result.summary.dueSoon ? 'warn' : undefined} to={`/admin/van-ban-chi-dao?year=${year}&status=DUE_SOON`} />
      <Metric label="Việc theo tháng" value="Xem danh sách" to="/admin/viec-theo-thang" />
    </Flex>}</Query>
  </Card>;
}
