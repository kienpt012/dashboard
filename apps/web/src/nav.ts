import {
  Building2,
  Bug,
  CheckCheck,
  Database,
  FileBarChart,
  FilePlus2,
  FileText,
  Gauge,
  History,
  Inbox,
  LayoutDashboard,
  Layers,
  MessageSquareText,
  MonitorPlay,
  Scale,
  Settings,
  Sheet,
  Target,
  UserRound,
  Users,
  Wand2,
  type LucideIcon,
} from 'lucide-react';
import {
  ADMIN_ROLES,
  ALL_ROLES,
  APPROVAL_ROLES,
  IMPORT_ROLES,
  SUPERVISOR_ROLES,
} from './authz';
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
  /** Mã màn hình hiện ở dải định danh chân trang — ảnh chụp màn hình luôn biết là màn hình nào. */
  screen: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

/** Điều hướng theo nhịp làm việc của IOC: điều hành → chỉ tiêu → dữ liệu → người dân → hệ thống. */
export const navGroups: NavGroup[] = [
  {
    label: 'Điều hành',
    items: [
      {
        to: '/admin',
        label: 'Trung tâm điều hành',
        scopedLabel: 'Điều hành của phòng',
        hint: 'Toàn cảnh bộ chỉ tiêu, cảnh báo, việc bị treo, phòng nào đang chậm',
        icon: Gauge,
        roles: ALL_ROLES,
        keywords: 'tong quan dashboard dieu hanh ioc canh bao',
        screen: 'DH-01',
      },
      {
        to: '/admin/viec-cua-toi',
        label: 'Việc của tôi',
        hint: 'Cần báo cáo, chờ duyệt, đề xuất, giải trình — gom về một chỗ',
        icon: Inbox,
        roles: ALL_ROLES,
        keywords: 'viec cua toi can lam nhac viec',
        screen: 'DH-02',
      },
      {
        to: '/trinh-chieu',
        label: 'Trình chiếu',
        hint: 'Màn hình lớn tự chuyển qua từng bộ chỉ tiêu và từng phòng',
        icon: MonitorPlay,
        roles: ALL_ROLES,
        keywords: 'trinh chieu man hinh lon phong hop wallboard tv',
        screen: 'DH-03',
      },
      {
        to: '/admin/trach-nhiem',
        label: 'Trách nhiệm',
        hint: 'Chậm duyệt, bị tự thông qua, từ chối đề xuất, việc bị đá qua lại',
        icon: Scale,
        roles: SUPERVISOR_ROLES,
        keywords: 'trach nhiem nguoi dung dau truong phong cham duyet',
        screen: 'DH-04',
      },
    ],
  },
  {
    label: 'Chỉ tiêu',
    items: [
      {
        to: '/admin/bo-chi-tieu',
        label: 'Bộ chỉ tiêu',
        hint: 'KT-XH, chuyển đổi số, thống kê, nhiệm vụ — nạp từ thư viện mẫu',
        icon: Layers,
        roles: ALL_ROLES,
        keywords: 'bo chi tieu framework thu vien mau tt148 dti',
        screen: 'CT-01',
      },
      {
        to: '/admin/targets',
        label: 'Danh mục chỉ tiêu',
        scopedLabel: 'Chỉ tiêu của phòng',
        hint: 'Tra cứu, lọc, mở hồ sơ ba phần của từng chỉ tiêu',
        icon: Target,
        roles: ALL_ROLES,
        keywords: 'chi tieu target kpi danh muc',
        screen: 'CT-02',
      },
      {
        to: '/admin/proposals',
        label: 'Đề xuất chỉ tiêu',
        hint: 'Đề xuất của AI và cán bộ, trình, duyệt, tự thông qua khi quá hạn',
        icon: FilePlus2,
        roles: ALL_ROLES,
        keywords: 'de xuat chi tieu moi phat hien ung vien ai',
        screen: 'CT-03',
      },
      {
        to: '/admin/approvals',
        label: 'Duyệt báo cáo',
        hint: 'Xét duyệt số liệu chuyên viên gửi lên',
        icon: CheckCheck,
        roles: APPROVAL_ROLES,
        keywords: 'duyet phe duyet approve cho duyet',
        screen: 'CT-04',
      },
      {
        to: '/admin/reports',
        label: 'Báo cáo tổng hợp',
        scopedLabel: 'Báo cáo của phòng',
        hint: 'Tổng hợp kết quả theo năm và đơn vị, xuất Excel',
        icon: FileBarChart,
        roles: ALL_ROLES,
        keywords: 'bao cao report thong ke xuat excel',
        screen: 'CT-05',
      },
    ],
  },
  {
    label: 'Dữ liệu',
    items: [
      {
        to: '/admin/kho-du-lieu',
        label: 'Kho dữ liệu',
        hint: 'Bảng dữ liệu nghiệp vụ để chỉ tiêu tự tính, nhập từ Excel',
        icon: Database,
        roles: ALL_ROLES,
        keywords: 'kho du lieu dataset bang du lieu tu tinh',
        screen: 'DL-01',
      },
      {
        to: '/admin/documents',
        label: 'Kho văn bản',
        hint: 'Văn bản chỉ đạo và đề xuất chỉ tiêu do AI trích xuất',
        icon: FileText,
        roles: ALL_ROLES,
        keywords: 'van ban tai lieu document ocr trich xuat',
        screen: 'DL-02',
      },
      {
        to: '/admin/imports',
        label: 'Nhập số liệu Excel',
        scopedLabel: 'Nộp báo cáo Excel',
        hint: 'Tải phiếu Excel, đối chiếu và ghi số liệu',
        icon: Sheet,
        roles: IMPORT_ROLES,
        keywords: 'nhap lieu import excel tai len',
        screen: 'DL-03',
      },
    ],
  },
  {
    label: 'Người dân',
    items: [
      {
        to: '/admin/feedback',
        label: 'Phản ánh người dân',
        scopedLabel: 'Phản ánh của phòng',
        hint: 'Tiếp nhận, phân công và trả lời phản ánh',
        icon: MessageSquareText,
        roles: ALL_ROLES,
        keywords: 'phan anh kien nghi feedback nguoi dan',
        screen: 'ND-01',
      },
      {
        to: '/admin/public-dashboard',
        label: 'Thiết kế trang công khai',
        hint: 'Bố trí nội dung hiển thị cho người dân',
        icon: LayoutDashboard,
        roles: ADMIN_ROLES,
        keywords: 'trang cong khai studio thiet ke cong thong tin',
        screen: 'ND-02',
      },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      {
        to: '/admin/thiet-lap',
        label: 'Thiết lập địa phương',
        hint: 'Hồ sơ địa phương, cơ cấu tổ chức, bộ chỉ tiêu mẫu, thời hạn',
        icon: Wand2,
        roles: ADMIN_ROLES,
        keywords: 'thiet lap dia phuong khoi tao setup wizard',
        screen: 'HT-01',
      },
      {
        to: '/admin/departments',
        label: 'Phòng ban',
        scopedLabel: 'Thông tin phòng ban',
        hint: 'Cơ cấu đơn vị, lĩnh vực phụ trách',
        icon: Building2,
        roles: ALL_ROLES,
        keywords: 'phong ban don vi department',
        screen: 'HT-02',
      },
      {
        to: '/admin/users',
        label: 'Tài khoản',
        hint: 'Người dùng, vai trò, chức vụ',
        icon: Users,
        roles: ADMIN_ROLES,
        keywords: 'tai khoan nguoi dung user phan quyen',
        screen: 'HT-03',
      },
      {
        to: '/admin/settings',
        label: 'Cấu hình',
        hint: 'Ngưỡng cảnh báo, thời hạn tự thông qua, trình chiếu',
        icon: Settings,
        roles: ADMIN_ROLES,
        keywords: 'thiet lap cau hinh setting thoi han',
        screen: 'HT-04',
      },
      {
        to: '/admin/audit-logs',
        label: 'Nhật ký hệ thống',
        hint: 'Dấu vết thao tác của toàn hệ thống',
        icon: History,
        roles: ADMIN_ROLES,
        keywords: 'nhat ky audit log lich su',
        screen: 'HT-05',
      },
      {
        to: '/admin/bao-loi',
        label: 'Báo lỗi',
        hint: 'Lỗi người dùng gửi kèm địa chỉ trang và thời điểm',
        icon: Bug,
        roles: ADMIN_ROLES,
        keywords: 'bao loi bug gop y',
        screen: 'HT-06',
      },
      {
        to: '/admin/profile',
        label: 'Hồ sơ & bảo mật',
        hint: 'Thông tin cá nhân và đổi mật khẩu',
        icon: UserRound,
        roles: ALL_ROLES,
        keywords: 'ho so profile mat khau bao mat',
        screen: 'HT-07',
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
  if (pathname.startsWith('/admin/targets/')) return 'Hồ sơ chỉ tiêu';
  if (pathname === '/admin/forbidden') return 'Quyền truy cập';
  return 'Trung tâm điều hành';
}

/** Nhóm chứa đường dẫn hiện tại — dùng cho đường dẫn phân cấp trên thanh trên. */
export function groupFor(pathname: string) {
  const exact = navGroups.find(group => group.items.some(item => item.to === pathname));
  if (exact) return exact.label;
  if (pathname.startsWith('/admin/documents')) return 'Dữ liệu';
  if (pathname.startsWith('/admin/targets')) return 'Chỉ tiêu';
  return 'Điều hành';
}

/** Mã màn hình cho dải định danh ở chân trang (UX-02). */
export function screenCodeFor(pathname: string) {
  const item = navItems.find(entry => entry.to === pathname);
  if (item) return item.screen;
  if (pathname.startsWith('/admin/targets/')) return 'CT-06';
  if (pathname.startsWith('/admin/documents/')) return 'DL-04';
  return 'IOC';
}
