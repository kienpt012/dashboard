import { BadRequestException, type ValidationError } from '@nestjs/common';

// Thông báo kiểm tra dữ liệu bằng tiếng Việt. Các DTO đã tự đặt thông báo tiếng Việt được giữ nguyên;
// chỉ thông báo mặc định (tiếng Anh) của class-validator mới được chuyển, để không lộ chữ tiếng Anh lên giao diện.

const FIELD_LABELS: Record<string, string> = {
  expectedVersion: 'Phiên bản dữ liệu',
  expectedPublicationVersion: 'Phiên bản công bố',
  baseVersion: 'Phiên bản gốc',
  year: 'Năm',
  title: 'Tiêu đề',
  name: 'Tên',
  code: 'Mã',
  description: 'Mô tả',
  content: 'Nội dung',
  email: 'Email',
  password: 'Mật khẩu',
  currentPassword: 'Mật khẩu hiện tại',
  newPassword: 'Mật khẩu mới',
  username: 'Tên đăng nhập',
  fullName: 'Họ và tên',
  position: 'Chức vụ',
  role: 'Vai trò',
  departmentId: 'Phòng ban',
  frameworkId: 'Bộ chỉ tiêu',
  targetId: 'Chỉ tiêu',
  value: 'Giá trị',
  targetValue: 'Giá trị kế hoạch',
  unit: 'Đơn vị tính',
  periodKey: 'Kỳ báo cáo',
  note: 'Ghi chú',
  reason: 'Lý do',
  message: 'Nội dung',
  page: 'Trang',
  pageSize: 'Số dòng mỗi trang',
  dueDate: 'Hạn',
  dueAt: 'Hạn',
  weight: 'Trọng số',
  status: 'Trạng thái',
  priority: 'Mức ưu tiên',
  category: 'Nhóm',
  lookupSecret: 'Mã bảo mật',
  isPublic: 'Công khai',
  isActive: 'Trạng thái hoạt động',
};

const TEMPLATES: Record<string, (field: string, value: string | null) => string> = {
  isInt: field => `${field} phải là số nguyên`,
  isNumber: field => `${field} phải là số`,
  isPositive: field => `${field} phải là số dương`,
  min: (field, value) => `${field} không được nhỏ hơn ${value ?? 'giá trị tối thiểu'}`,
  max: (field, value) => `${field} không được lớn hơn ${value ?? 'giá trị tối đa'}`,
  minLength: (field, value) => `${field} cần ít nhất ${value ?? 'số'} ký tự`,
  maxLength: (field, value) => `${field} không được quá ${value ?? 'số'} ký tự`,
  isString: field => `${field} phải là chuỗi ký tự`,
  isBoolean: field => `${field} phải là đúng hoặc sai`,
  isEnum: field => `${field} không thuộc giá trị cho phép`,
  isIn: field => `${field} không thuộc giá trị cho phép`,
  isEmail: field => `${field} không phải email hợp lệ`,
  isDateString: field => `${field} phải là ngày hợp lệ`,
  isIso8601: field => `${field} phải là ngày hợp lệ`,
  isUuid: field => `${field} không đúng định dạng mã`,
  matches: field => `${field} không đúng định dạng`,
  isNotEmpty: field => `Thiếu ${field.toLocaleLowerCase('vi')}`,
  isDefined: field => `Thiếu ${field.toLocaleLowerCase('vi')}`,
  isArray: field => `${field} phải là danh sách`,
  arrayMinSize: (field, value) => `${field} cần ít nhất ${value ?? 'một'} phần tử`,
  arrayMaxSize: (field, value) => `${field} không được quá ${value ?? 'số'} phần tử`,
  isObject: field => `${field} phải là đối tượng`,
  equals: field => `${field} không hợp lệ`,
  whitelistValidation: field => `${field} không được phép gửi lên`,
};

/** Thông báo do class-validator tự sinh: không có ký tự ngoài ASCII (thông báo tiếng Việt luôn có dấu). */
function isDefaultMessage(message: string) {
  return /^[\x20-\x7e]*$/.test(message);
}

function labelOf(path: string) {
  const last = path.split('.').pop() ?? path;
  const label = FIELD_LABELS[last];
  return label ? (path.includes('.') ? `${label} (${path})` : label) : `Trường «${path}»`;
}

function numberIn(message: string) {
  return message.match(/(-?\d+(?:\.\d+)?)/)?.[1] ?? null;
}

export function translateConstraint(constraint: string, message: string, path: string) {
  if (!isDefaultMessage(message)) return message;
  const template = TEMPLATES[constraint];
  const field = labelOf(path);
  return template ? template(field, numberIn(message)) : `${field} không hợp lệ`;
}

/** Duỗi cây lỗi (kể cả đối tượng lồng nhau) thành danh sách thông báo tiếng Việt. */
export function validationMessages(errors: ValidationError[], parent = ''): string[] {
  const out: string[] = [];
  for (const error of errors) {
    const path = parent ? `${parent}.${error.property}` : error.property;
    for (const [constraint, message] of Object.entries(error.constraints ?? {})) {
      out.push(translateConstraint(constraint, message, path));
    }
    if (error.children?.length) out.push(...validationMessages(error.children, path));
  }
  return [...new Set(out)];
}

/** Giữ nguyên dạng phản hồi mặc định của Nest ({ message: string[], error, statusCode }). */
export function validationExceptionFactory(errors: ValidationError[]) {
  return new BadRequestException(validationMessages(errors));
}
