import type { FeedbackCategory, FeedbackPriority, FeedbackStatus } from '@/types/core';

export const FEEDBACK_STATUS: Record<FeedbackStatus, { label: string; color: string }> = {
  RECEIVED: { label: 'Mới tiếp nhận', color: 'blue' },
  ASSIGNED: { label: 'Đã phân công', color: 'geekblue' },
  IN_PROGRESS: { label: 'Đang xử lý', color: 'processing' },
  WAITING_CITIZEN: { label: 'Chờ người dân bổ sung', color: 'gold' },
  PENDING_REVIEW: { label: 'Chờ duyệt kết quả', color: 'purple' },
  RESOLVED: { label: 'Đã có kết quả', color: 'green' },
  CLOSED: { label: 'Đã đóng', color: 'default' },
  REJECTED: { label: 'Không tiếp nhận', color: 'red' },
  REOPENED: { label: 'Xem xét lại', color: 'orange' },
};

export const FEEDBACK_PRIORITY: Record<FeedbackPriority, { label: string; color: string }> = {
  URGENT: { label: 'Khẩn', color: 'red' },
  HIGH: { label: 'Cao', color: 'orange' },
  NORMAL: { label: 'Bình thường', color: 'default' },
  LOW: { label: 'Thấp', color: 'default' },
};

export const FEEDBACK_CATEGORY: Record<FeedbackCategory, string> = {
  INFRASTRUCTURE: 'Hạ tầng, giao thông',
  ENVIRONMENT: 'Môi trường, vệ sinh',
  ADMINISTRATIVE_PROCEDURE: 'Thủ tục hành chính',
  SECURITY_ORDER: 'An ninh, trật tự',
  SOCIAL_WELFARE: 'An sinh xã hội',
  CULTURE_EDUCATION: 'Văn hóa, giáo dục',
  OTHER: 'Nội dung khác',
};

export const FEEDBACK_EVENT: Record<string, string> = {
  CREATED: 'Tiếp nhận phản ánh',
  FEEDBACK_ASSIGNED: 'Phân công xử lý',
  FEEDBACK_TRIAGED: 'Phân loại',
  FEEDBACK_STARTED: 'Bắt đầu xử lý',
  INFORMATION_REQUESTED: 'Yêu cầu người dân bổ sung',
  CITIZEN_MESSAGE_ADDED: 'Người dân bổ sung thông tin',
  PUBLIC_MESSAGE_ADDED: 'Gửi phản hồi công khai',
  INTERNAL_NOTE_ADDED: 'Thêm ghi chú nội bộ',
  FEEDBACK_SUBMITTED_FOR_REVIEW: 'Trình duyệt kết quả',
  RESOLUTION_APPROVED: 'Duyệt kết quả',
  RESOLUTION_RETURNED: 'Trả lại kết quả',
  FEEDBACK_CLOSED: 'Đóng hồ sơ',
  FEEDBACK_CLOSED_NO_RESPONSE: 'Đóng do quá hạn bổ sung',
  FEEDBACK_REJECTED: 'Không tiếp nhận',
  FEEDBACK_REOPENED: 'Mở lại hồ sơ',
  CITIZEN_REOPEN_REQUESTED: 'Người dân đề nghị xem xét lại',
  CITIZEN_REOPEN_REQUEST_APPROVED: 'Chấp nhận đề nghị xem xét lại',
  CITIZEN_REOPEN_REQUEST_REJECTED: 'Từ chối đề nghị xem xét lại',
  CITIZEN_RATED: 'Người dân đánh giá',
  FEEDBACK_PUBLISHED: 'Công khai kết quả',
  FEEDBACK_UNPUBLISHED: 'Gỡ công khai',
  CONTACT_ATTEMPT_LOGGED: 'Ghi nhận liên hệ người dân',
  CITIZEN_ATTACHMENTS_ADDED: 'Người dân bổ sung tệp',
};

export function options<T extends string>(map: Record<T, string | { label: string }>) {
  return (Object.keys(map) as T[]).map(value => ({ value, label: typeof map[value] === 'string' ? (map[value] as string) : (map[value] as { label: string }).label }));
}
