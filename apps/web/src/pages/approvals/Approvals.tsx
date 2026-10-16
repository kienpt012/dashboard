import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { Button, Card, Input, Select, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { useMe } from '@/app/session';
import { FilterBar, Page } from '@/components/Page';
import { LoadError } from '@/components/States';
import { useApi } from '@/hooks/useApi';
import { departmentOptions, useDepartments } from '@/hooks/useRefs';
import { query } from '@/lib/api';
import { num } from '@/lib/format';
import { isGlobal } from '@/lib/roles';
import { PendingReviews, type PendingUpdate } from './PendingReviews';

export default function Approvals() {
  const user = useMe();
  const global = isGlobal(user);
  const [departmentId, setDepartmentId] = useState<string>();
  const [text, setText] = useState('');
  const departments = useDepartments();
  const list = useApi<PendingUpdate[]>(`/targets/pending-updates${query({ departmentId: global ? departmentId : undefined })}`, { keepPrevious: true, refetchInterval: 60_000 });

  const rows = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase('vi');
    return (list.data ?? []).filter(row => !needle || `${row.target.code} ${row.target.title} ${row.user.fullName}`.toLocaleLowerCase('vi').includes(needle));
  }, [list.data, text]);

  return (
    <Page
      title="Duyệt báo cáo"
      meta={list.data && <span>{num(list.data.length)} báo cáo chờ duyệt</span>}
      extra={
        <Tooltip title="Tải lại">
          <Button icon={<ReloadOutlined spin={list.isFetching} />} onClick={() => void list.refetch()} aria-label="Tải lại" />
        </Tooltip>
      }
    >
      <Card className="card-flush">
        <div className="table-filters">
          <FilterBar
            active={departmentId ? 1 : 0}
            search={<Input allowClear prefix={<SearchOutlined />} placeholder="Mã, tên chỉ tiêu, người gửi" value={text} onChange={event => setText(event.target.value)} style={{ width: '100%', maxWidth: 300 }} />}
            filters={
              global && (
                <Select allowClear placeholder="Phòng ban" value={departmentId} onChange={setDepartmentId} options={departmentOptions(departments.data, false)} style={{ width: 220 }} popupMatchSelectWidth={false} />
              )
            }
          />
        </div>
        {list.error && !list.data ? <LoadError error={list.error} retry={() => void list.refetch()} /> : <PendingReviews rows={rows} loading={list.isLoading} />}
      </Card>
    </Page>
  );
}
