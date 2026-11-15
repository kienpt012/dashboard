/** Màu thống nhất cho điều hành, hồ sơ, nhật ký và bàn làm việc. */
export const ACTIVITY_COLORS: Record<string, string> = {
  REPORT_SUBMITTED: 'blue', PROGRESS_CREATED: 'blue', PROGRESS_SUBMITTED: 'blue',
  REPORT_APPROVED: 'green', PROGRESS_APPROVED: 'green', PROGRESS_APPROVED_DIRECTLY: 'green',
  REPORT_REJECTED: 'red', PROGRESS_REJECTED: 'red',
  REPORT_AUTO_APPROVED: 'cyan', PROGRESS_AUTO_APPROVED: 'cyan',
  REPORT_AUTO_BLOCKED: 'volcano', REPORT_MIRRORED: 'geekblue',
  REPORT_REVISION_REQUESTED: 'orange', REPORT_REVISION_RESOLVED: 'green',
  ASSIGNED: 'purple', TARGET_ASSIGNED: 'purple', TASK_DISPATCHED: 'purple',
  TRANSFERRED: 'geekblue', TARGET_TRANSFERRED: 'geekblue', RETURNED: 'volcano', TARGET_RETURNED: 'volcano',
  DIRECTIVE_ADDED: 'cyan', TARGET_DIRECTIVE_ADDED: 'cyan', DIRECTIVE_REMOVED: 'volcano',
  EXPLANATION_REQUESTED: 'orange', TARGET_EXPLANATION_REQUESTED: 'orange', EXPLANATION_ANSWERED: 'gold',
  EVALUATED: 'lime', TARGET_EVALUATED: 'lime',
  PROPOSAL_CREATED: 'purple', PROPOSAL_SUBMITTED: 'purple', PROPOSAL_APPROVED: 'green', PROPOSAL_REJECTED: 'red', PROPOSAL_AUTO_APPROVED: 'cyan',
  DOCUMENT_UPLOADED: 'cyan', DOCUMENT_UPDATED: 'cyan', DOCUMENT_DELETED: 'volcano',
  DESK_NOTE_SENT: 'magenta', DESK_NOTE_CREATED: 'magenta', DESK_NOTE_REPLIED: 'magenta', DESK_NOTE_READ: 'magenta', DESK_NOTE_DONE: 'green',
  DESK_NOTE_STATE_UPDATED: 'magenta', DESK_NOTE_RECALLED: 'volcano',
  TARGET_CREATED: 'blue', TARGET_UPDATED: 'blue', TARGET_LINKED: 'geekblue', TARGET_UNLINKED: 'volcano',
  EVIDENCE_ADDED: 'cyan', COMPUTED_UPDATE: 'geekblue', REMINDER: 'orange', ESCALATED: 'red',
};
export const activityColor = (action: string) => ACTIVITY_COLORS[action] ?? 'default';
