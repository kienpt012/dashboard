import { AimOutlined, ApartmentOutlined, BellOutlined, CalendarOutlined, CheckSquareOutlined, ClockCircleOutlined, CloudOutlined, DashboardOutlined, FileTextOutlined, HourglassOutlined, InboxOutlined, LineChartOutlined, LinkOutlined, MessageOutlined, ProfileOutlined, PushpinOutlined, ScheduleOutlined, SendOutlined, ThunderboltOutlined, CalculatorOutlined } from '@ant-design/icons';
import type { WidgetType } from './model';

const icons = {
  clock: ClockCircleOutlined, weather: CloudOutlined, notes: FileTextOutlined, tasks: CheckSquareOutlined,
  focus: ThunderboltOutlined, calendar: CalendarOutlined, ioc: DashboardOutlined, work: ProfileOutlined,
  api: LineChartOutlined, embed: LinkOutlined, calculator: CalculatorOutlined, countdown: HourglassOutlined,
  'my-targets': AimOutlined, 'target-chart': LineChartOutlined, alerts: BellOutlined, approvals: InboxOutlined,
  departments: ApartmentOutlined, feedback: MessageOutlined, documents: FileTextOutlined, activity: ScheduleOutlined,
  'sent-notes': SendOutlined, agenda: CalendarOutlined, pins: PushpinOutlined, proposals: ProfileOutlined,
};
export function WidgetIcon({ type }: { type: WidgetType }) { const Icon = icons[type]; return <Icon />; }
