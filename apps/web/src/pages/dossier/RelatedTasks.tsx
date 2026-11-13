import { Card, Space, Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { LoadError } from '@/components/States';
import { DeptTag } from '@/components/Tags';
import { useApi } from '@/hooks/useApi';
import { date } from '@/lib/format';
import { useDossier } from './context';

type RelatedTask = {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  statusLabel?: string;
  department: { name: string; color?: string };
  framework: { id: string; name: string; docNumber?: string | null } | null;
};

const labels: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu', IN_PROGRESS: 'Đang thực hiện', ON_TRACK: 'Đang thực hiện', AT_RISK: 'Đang thực hiện',
  COMPLETED: 'Hoàn thành', OVERDUE: 'Quá hạn',
};

export function RelatedTasks() {
  const { d } = useDossier();
  const query = useApi<{ items: RelatedTask[] }>(d.kind === 'TASK' ? null : `/directives/related/${d.id}`);
  if (d.kind === 'TASK' || (!query.error && !query.data?.items.length)) return null;
  return (
    <Card title="Nhiệm vụ liên quan" size="small" style={{ marginTop: 16 }}>
      {query.error ? <LoadError error={query.error} retry={() => void query.refetch()} /> : (
        <Table<RelatedTask>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={query.data?.items}
          scroll={{ x: 700 }}
          columns={[
            { title: 'Nội dung', key: 'title', render: (_, task) => <Space orientation="vertical" size={2}><Link to={`/admin/targets/${task.id}`}>{task.title}</Link>{task.framework && <Link to={`/admin/van-ban-chi-dao/${task.framework.id}`}>{task.framework.docNumber || task.framework.name}</Link>}</Space> },
            { title: 'Phòng chủ trì', key: 'department', width: 200, render: (_, task) => <DeptTag name={task.department.name} color={task.department.color} /> },
            { title: 'Hạn hoàn thành', dataIndex: 'dueDate', width: 130, render: date },
            { title: 'Trạng thái', key: 'status', width: 160, render: (_, task) => <Tag color={task.status === 'OVERDUE' ? 'red' : task.status === 'COMPLETED' ? 'green' : 'blue'}>{task.statusLabel || labels[task.status] || task.status}</Tag> },
          ]}
        />
      )}
    </Card>
  );
}
