import {
  Building2,
  CheckCheck,
  FileBarChart,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  Sheet,
  Target,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { ADMIN_ROLES, ALL_ROLES, APPROVAL_ROLES, IMPORT_ROLES } from './authz';
import type { Role } from './types';

export type NavItem = {
  to: string;
  label: string;
  /** Nhãn thay thế khi người dùng chỉ phụ trách một đơn vị. */
  scopedLabel?: string;
  /** Mô tả ngắn, dùng trong bảng lệnh. */
  hint: string;
  icon: LucideIcon;
  roles: readonly Role[];
  /** Từ khoá phụ để tìm trong bảng lệnh (gõ không dấu vẫn ra). */
  keywords?: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Điều hướng quản trị, chia nhóm theo công việc thay vì một danh sách phẳng 14 mục.
 *  Thứ tự nhóm phản ánh nhịp làm việc hằng ngày: theo dõi → nhập liệu → phục vụ dân
 *  → tổ chức → hệ thống.
 */
export const navGroups: NavGroup[] = [
  {
    label: 'Điều hành',
    items: [
      {
        to: '/admin',
        label: 'Tổng quan điều hành',
        scopedLabel: 'Tổng quan đơn vị',
        hint: 'Tiến độ chung, cảnh báo, cập nhật gần đây',
        icon: Gauge,
        roles: ALL_ROLES,
        keywords: 'tong quan dashboard bang dieu khien',
      },
      {
        to: '/admin/targets',
        label: 'Quản lý chỉ tiêu',
        scopedLabel: 'Chỉ tiêu của đơn vị',
        hint: 'Danh mục chỉ tiêu, giao việc, cập nhật số liệu',
        icon: Target,
        roles: ALL_ROLES,
        keywords: 'chi tieu target kpi',
      },
      {
        to: '/admin/reports',
        label: 'Báo cáo chỉ tiêu',
        scopedLabel: 'Báo cáo của đơn vị',
        hint: 'Tổng hợp kết quả theo năm và đơn vị',
        icon: FileBarChart,
        roles: ALL_ROLES,
        keywords: 'bao cao report thong ke xuat excel',
      },
      {
        to: '/admin/approvals',
        label: 'Duyệt báo cáo',
        hint: 'Xét duyệt số liệu đơn vị gửi lên',
        icon: CheckCheck,
        roles: APPROVAL_ROLES,
        keywords: 'duyet phe duyet approve cho duyet',
      },
    ],
  },
  {
    label: 'Dữ liệu',
    items: [
      {
        to: '/admin/imports',
        label: 'Nhập dữ liệu báo cáo',
        scopedLabel: 'Nộp báo cáo Excel',
        hint: 'Tải tệp Excel, đối chiếu và ghi số liệu',
        icon: Sheet,
        roles: IMPORT_ROLES,
        keywords: 'nhap lieu import excel tai len',
      },
      {
        to: '/admin/documents',
        label: 'Kho văn bản',
        hint: 'Văn bản hành chính và đề xuất chỉ tiêu do AI trích xuất',
        icon: FileText,
        roles: ALL_ROLES,
        keywords: 'van ban tai lieu document ocr trich xuat',
      },
    ],
  },
  {
    label: 'Người dân',
    items: [
      {
        to: '/admin/feedback',
        label: 'Phản ánh người dân',
        scopedLabel: 'Phản ánh của đơn vị',
        hint: 'Tiếp nhận, phân công và trả lời phản ánh',
        icon: MessageSquareText,
        roles: ALL_ROLES,
        keywords: 'phan anh kien nghi feedback nguoi dan',
      },
      {
        to: '/admin/public-dashboard',
        label: 'Thiết kế trang công khai',
        hint: 'Bố trí nội dung hiển thị cho người dân',
        icon: LayoutDashboard,
        roles: ADMIN_ROLES,
        keywords: 'trang cong khai studio thiet ke cong thong tin',
      },
    ],
  },
  {
    label: 'Tổ chức',
    items: [
      {
        to: '/admin/departments',
        label: 'Phòng ban',
        scopedLabel: 'Thông tin phòng ban',
        hint: 'Cơ cấu đơn vị trực thuộc',
        icon: Building2,
        roles: ALL_ROLES,
        keywords: 'phong ban don vi department',
      },
      {
        to: '/admin/users',
        label: 'Tài khoản',
        hint: 'Người dùng, vai trò và phân quyền',
        icon: Users,
        roles: ADMIN_ROLES,
        keywords: 'tai khoan nguoi dung user phan quyen',
      },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      {
        to: '/admin/settings',
        label: 'Thiết lập hệ thống',
        hint: 'Ngưỡng cảnh báo, thư điện tử, tham số vận hành',
        icon: Settings,
        roles: ADMIN_ROLES,
        keywords: 'thiet lap cau hinh setting',
      },
      {
        to: '/admin/audit-logs',
        label: 'Nhật ký hệ thống',
        hint: 'Dấu vết thao tác của toàn hệ thống',
        icon: History,
        roles: ADMIN_ROLES,
        keywords: 'nhat ky audit log lich su',
      },
      {
        to: '/admin/profile',
        label: 'Hồ sơ & bảo mật',
        hint: 'Thông tin cá nhân và đổi mật khẩu',
        icon: UserRound,
        roles: ALL_ROLES,
        keywords: 'ho so profile mat khau bao mat',
      },
    ],
  },
];

export const navItems: NavItem[] = navGroups.flatMap(group => group.items);

/** Tiêu đề hiển thị trên thanh trên, tra theo đường dẫn. */
export function titleFor(pathname: string, scoped: boolean) {
  const item = navItems.find(entry => entry.to === pathname);
  if (item) return (scoped && item.scopedLabel) || item.label;
  if (pathname.startsWith('/admin/documents/')) return 'Xác minh trích xuất AI';
  if (pathname === '/admin/forbidden') return 'Quyền truy cập';
  return 'Trung tâm điều hành';
}

/** Nhóm chứa đường dẫn hiện tại — dùng cho đường dẫn phân cấp trên thanh trên. */
export function groupFor(pathname: string) {
  const exact = navGroups.find(group => group.items.some(item => item.to === pathname));
  if (exact) return exact.label;
  if (pathname.startsWith('/admin/documents')) return 'Dữ liệu';
  return 'Điều hành';
}
