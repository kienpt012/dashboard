import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// Thành phần vẽ của từng loại widget, tải lười theo nhóm. Khai báo (kích thước, cài đặt) nằm ở sổ widget phía máy chủ.

type Loader = () => Promise<Record<string, ComponentType>>;

function from(loader: Loader, name: string): LazyExoticComponent<ComponentType> {
  return lazy(() => loader().then(module => ({ default: module[name] })));
}

export const WIDGET_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = {};

export function registerGroup(loader: Loader, names: Record<string, string>) {
  for (const [type, name] of Object.entries(names)) WIDGET_COMPONENTS[type] = from(loader, name);
}

registerGroup(() => import('./department'), {
  'dept.status': 'DeptStatus',
  'dept.workload': 'DeptWorkload',
  'dept.alerts': 'DeptAlerts',
  'dept.ticker': 'DeptTicker',
  'dept.stalled': 'DeptStalled',
  'dept.recent': 'DeptRecent',
  'dept.deadlines': 'DeptDeadlines',
  'dept.frameworks': 'DeptFrameworks',
  'dept.team': 'DeptTeam',
  'dept.feedback': 'DeptFeedback',
});

registerGroup(() => import('./targets'), {
  'target.kpi': 'TargetKpi',
  'target.watchlist': 'TargetWatchlist',
  'target.chart': 'TargetChart',
});

registerGroup(() => import('./mine'), {
  'my.work': 'MyWorkWidget',
  'my.notifications': 'MyNotifications',
  'docs.recent': 'RecentDocuments',
});

registerGroup(() => import('./personal'), {
  hero: 'Hero',
  clock: 'Clock',
  calendar: 'CalendarWidget',
  notepad: 'Notepad',
  todo: 'Todo',
  countdown: 'Countdown',
  focus: 'Focus',
});

registerGroup(() => import('./tools'), {
  launcher: 'Launcher',
  search: 'Search',
  jarvis: 'JarvisWidget',
});

registerGroup(() => import('./content'), {
  text: 'TextBlock',
  image: 'ImageBlock',
});
