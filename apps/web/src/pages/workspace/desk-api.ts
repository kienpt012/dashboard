import type { Role } from '@/types/auth';

export type DeskPerson = { id: string; fullName: string; username: string; position?: string | null; role?: Role; departmentId?: string | null };
export type DeskRecipient = { userId: string; user: DeskPerson; seenAt: string | null; doneAt: string | null; hiddenAt: string | null; x: number | null; y: number | null };
export type DeskNote = {
  id: string; content: string; color: 'yellow' | 'pink' | 'blue' | 'green'; dueAt: string | null;
  createdAt: string; recalledAt: string | null; author: DeskPerson; recipients: DeskRecipient[];
  target?: { id: string; title: string } | null; document?: { id: string; title: string; docNumber?: string | null } | null;
  replies: { id: string; author: DeskPerson; content: string; createdAt: string }[];
};
export type DeskNotesData = { received: DeskNote[]; sent: DeskNote[] };
export type DeskRecipientsData = { users: DeskPerson[]; departments: { id: string; name: string }[]; roles: Role[]; canBroadcast: boolean; defaultRecipientIds: string[] };
export type DeskBriefingItem = { id: string; kind: string; title: string; status: string; dueAt?: string | null; href?: string; assignee?: { fullName: string; username: string } | null; targetId?: string; periodKey?: string; autoApproveAt?: string | null };
export type DeskCounts = { reports: number; notes: number; approvals: number; work: number; proposals: number; feedback: number; notifications: number };
export type DeskBriefingData = { counts: DeskCounts; systemNotes: DeskBriefingItem[]; today: DeskBriefingItem[]; tomorrow: DeskBriefingItem[]; week: DeskBriefingItem[] };
export type WorkApp = { id: string; name: string; url: string; icon: string; color: string; group: string; description: string; roles: Role[]; departmentIds: string[]; sortOrder: number; isActive: boolean; badgeUrl?: string | null; badgePath?: string | null; badge?: number };
export type WorkAppsData = { apps: WorkApp[]; badges: Partial<DeskCounts> };
