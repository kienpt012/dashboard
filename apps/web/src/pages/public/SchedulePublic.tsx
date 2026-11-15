import { CalendarOutlined, FilePdfOutlined, LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Result, Skeleton } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { apiBaseUrl, errorText } from '@/lib/api';
import { date } from '@/lib/format';
import { ScheduleWeek } from '@/pages/schedule/ScheduleWeek';
import { weekRange, type PublicScheduleResponse } from '@/pages/schedule/model';
import { PublicShell } from './PublicShell';

/** Lịch làm việc của lãnh đạo dành cho người dân: chỉ tuần đã công khai. */
export default function SchedulePublic() {
  const [params, setParams] = useSearchParams();
  const week = params.get('tuan') ?? '';
  const query = useApi<PublicScheduleResponse>(/^\d{4}-\d{2}-\d{2}$/.test(week) ? `/public/schedule?week=${week}` : '/public/schedule', { keepPrevious: true });
  const data = query.data;
  const go = (target: string | null) => setParams(target ? { tuan: target } : {});
  const isCurrentWeek = data ? data.today >= data.weekStart && data.today <= data.weekEnd : true;

  return (
    <PublicShell title="Lịch làm việc của lãnh đạo" width={960}>
      <div className="pub-container" style={{ paddingTop: 28, paddingBottom: 40 }}>
        <div className="sched-public-head">
          <div>
            <h1>Lịch làm việc của lãnh đạo</h1>
            {data && (
              <p className="sched-public-sub">
                Tuần {weekRange(data.weekStart)}
                {data.schedule?.publishedAt ? ` · công bố ${date(data.schedule.publishedAt)}` : ''}
              </p>
            )}
          </div>
          {data && (
            <div className="sched-nav">
              <Button icon={<LeftOutlined />} disabled={!data.previousWeek} onClick={() => go(data.previousWeek)}>
                Tuần trước
              </Button>
              {!isCurrentWeek && <Button onClick={() => go(null)}>Tuần này</Button>}
              <Button icon={<RightOutlined />} iconPlacement="end" disabled={!data.nextWeek} onClick={() => go(data.nextWeek)}>
                Tuần sau
              </Button>
            </div>
          )}
        </div>
        {query.error && !data ? (
          <Result
            status="warning"
            title="Chưa tải được lịch làm việc"
            subTitle={errorText(query.error)}
            extra={
              <Button icon={<ReloadOutlined />} onClick={() => void query.refetch()}>
                Thử lại
              </Button>
            }
          />
        ) : !data ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : !data.schedule ? (
          <Result icon={<CalendarOutlined />} title="Tuần này chưa công bố lịch làm việc" />
        ) : (
          <>
            {data.schedule.file && (
              <p style={{ margin: '0 0 16px' }}>
                <a href={`${apiBaseUrl}/public/schedule/${data.schedule.weekStart}/file`} target="_blank" rel="noopener noreferrer">
                  <FilePdfOutlined /> Xem bản lịch đã ký (PDF)
                </a>
              </p>
            )}
            {data.schedule.entries.length ? (
              <ScheduleWeek weekStart={data.schedule.weekStart} entries={data.schedule.entries} today={data.today} hideEmptyDays />
            ) : (
              <Result icon={<CalendarOutlined />} title="Lịch tuần chỉ có bản PDF" />
            )}
          </>
        )}
      </div>
    </PublicShell>
  );
}
