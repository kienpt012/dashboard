import {
  AimOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BugOutlined,
  ControlOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  FundProjectionScreenOutlined,
  GlobalOutlined,
  HomeOutlined,
  HistoryOutlined,
  InboxOutlined,
  MessageOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';
import { ADMINS, ALL, APPROVERS, IMPORTERS, SUPERVISORS } from '@/lib/roles';
import type { Role } from '@/types/auth';

export type NavItem = {
  path: string;
  label: string;
  /** Nhãn khi người dùng chỉ phụ trách một phòng. */
  scopedLabel?: string;
  icon: ReactNode;
  roles: readonly Role[];
  /** Mã màn hình ở dải định danh chân trang. */
  screen: string;
  /** Từ khoá không dấu cho ô tìm kiếm nhanh. */
  keywords: string;
  /** Mở ngoài khung quản trị (trình chiếu toàn màn hình). */
  standalone?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: 'Điều hành',
    items: [
      { path: '/admin', label: 'Bàn làm việc', icon: <HomeOutlined />, roles: ALL, screen: 'DH-00', keywords: 'ban lam viec trang chu widget hinh nen loi tat' },
      { path: '/admin/dieu-hanh', label: 'Trung tâm điều hành', scopedLabel: 'Điều hành của phòng', icon: <DashboardOutlined />, roles: ALL, screen: 'DH-01', keywords: 'tong quan dieu hanh dashboard' },
      { path: '/admin/viec-cua-toi', label: 'Việc của tôi', icon: <InboxOutlined />, roles: ALL, screen: 'DH-02', keywords: 'viec cua toi can lam' },
      { path: '/trinh-chieu', label: 'Trình chiếu', icon: <FundProjectionScreenOutlined />, roles: ALL, screen: 'DH-03', keywords: 'trinh chieu man hinh lon phong hop', standalone: true },
      { path: '/admin/trach-nhiem', label: 'Trách nhiệm', icon: <AuditOutlined />, roles: SUPERVISORS, screen: 'DH-04', keywords: 'trach nhiem cham duyet nguoi dung dau' },
    ],
  },
  {
    label: 'Chỉ tiêu',
    items: [
      { path: '/admin/bo-chi-tieu', label: 'Bộ chỉ tiêu', icon: <AppstoreOutlined />, roles: ALL, screen: 'CT-01', keywords: 'bo chi tieu thu vien mau' },
      { path: '/admin/targets', label: 'Danh mục chỉ tiêu', scopedLabel: 'Chỉ tiêu của phòng', icon: <AimOutlined />, roles: ALL, screen: 'CT-02', keywords: 'chi tieu danh muc kpi' },
      { path: '/admin/proposals', label: 'Đề xuất chỉ tiêu', icon: <FileAddOutlined />, roles: ALL, screen: 'CT-03', keywords: 'de xuat chi tieu moi' },
      { path: '/admin/approvals', label: 'Duyệt báo cáo', icon: <FileDoneOutlined />, roles: APPROVERS, screen: 'CT-04', keywords: 'duyet bao cao so lieu' },
      { path: '/admin/reports', label: 'Báo cáo tổng hợp', scopedLabel: 'Báo cáo của phòng', icon: <BarChartOutlined />, roles: ALL, screen: 'CT-05', keywords: 'bao cao tong hop xuat excel in' },
    ],
  },
  {
    label: 'Dữ liệu',
    items: [
      { path: '/admin/kho-du-lieu', label: 'Kho dữ liệu', icon: <DatabaseOutlined />, roles: ALL, screen: 'DL-01', keywords: 'kho du lieu bang du lieu' },
      { path: '/admin/documents', label: 'Kho văn bản', icon: <FileTextOutlined />, roles: ALL, screen: 'DL-02', keywords: 'van ban tai lieu trich xuat' },
      { path: '/admin/imports', label: 'Nhập số liệu Excel', scopedLabel: 'Nộp báo cáo Excel', icon: <FileExcelOutlined />, roles: IMPORTERS, screen: 'DL-03', keywords: 'nhap excel tai len' },
    ],
  },
  {
    label: 'Người dân',
    items: [
      { path: '/admin/feedback', label: 'Phản ánh', scopedLabel: 'Phản ánh của phòng', icon: <MessageOutlined />, roles: ALL, screen: 'ND-01', keywords: 'phan anh kien nghi' },
      { path: '/admin/public-dashboard', label: 'Trang công khai', icon: <GlobalOutlined />, roles: ADMINS, screen: 'ND-02', keywords: 'trang cong khai cong thong tin' },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      { path: '/admin/thiet-lap', label: 'Thiết lập địa phương', icon: <ToolOutlined />, roles: ADMINS, screen: 'HT-01', keywords: 'thiet lap dia phuong khoi tao' },
      { path: '/admin/departments', label: 'Phòng ban', scopedLabel: 'Thông tin phòng', icon: <ApartmentOutlined />, roles: ALL, screen: 'HT-02', keywords: 'phong ban don vi' },
      { path: '/admin/users', label: 'Tài khoản', icon: <TeamOutlined />, roles: ADMINS, screen: 'HT-03', keywords: 'tai khoan nguoi dung phan quyen' },
      { path: '/admin/settings', label: 'Cấu hình', icon: <ControlOutlined />, roles: ADMINS, screen: 'HT-04', keywords: 'cau hinh thoi han nguong' },
      { path: '/admin/audit-logs', label: 'Nhật ký hệ thống', icon: <HistoryOutlined />, roles: ADMINS, screen: 'HT-05', keywords: 'nhat ky lich su thao tac' },
      { path: '/admin/bao-loi', label: 'Báo lỗi', icon: <BugOutlined />, roles: ADMINS, screen: 'HT-06', keywords: 'bao loi gop y' },
      { path: '/admin/profile', label: 'Hồ sơ cá nhân', icon: <UserOutlined />, roles: ALL, screen: 'HT-07', keywords: 'ho so mat khau bao mat' },
    ],
  },
];

export const navItems = navGroups.flatMap(group => group.items);

const EXTRA: { prefix: string; label: string; screen: string; group: string }[] = [
  { prefix: '/admin/targets/', label: 'Hồ sơ chỉ tiêu', screen: 'CT-06', group: 'Chỉ tiêu' },
  { prefix: '/admin/documents/', label: 'Xác minh trích xuất', screen: 'DL-04', group: 'Dữ liệu' },
  { prefix: '/admin/kho-du-lieu/', label: 'Bảng dữ liệu', screen: 'DL-05', group: 'Dữ liệu' },
];

export function routeInfo(pathname: string, scoped: boolean) {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
  for (const group of navGroups) {
    const item = group.items.find(entry => entry.path === path);
    if (item) return { label: (scoped && item.scopedLabel) || item.label, screen: item.screen, group: group.label, path: item.path };
  }
  const extra = EXTRA.find(entry => path.startsWith(entry.prefix));
  if (extra) return { label: extra.label, screen: extra.screen, group: extra.group, path };
  return { label: 'Bàn làm việc', screen: 'IOC', group: 'Điều hành', path };
}

/** Bỏ dấu tiếng Việt để tìm kiếm không cần gõ dấu. */
export function fold(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}
