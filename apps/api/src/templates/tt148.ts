import { FrameworkKind, IssuingLevel, LocalityKind, TargetDirection, TargetFrequency } from '@prisma/client';
import { datasetTemplates } from './datasets-catalog';
import type { OrgRole } from './org-templates';
import type { FrameworkTemplate, TemplateTarget } from './types';

// Hệ thống chỉ tiêu thống kê cấp xã — Phụ lục II Thông tư 148/2026/TT-BTC ngày 07/10/2026 của Bộ Tài chính,
// hiệu lực 01/12/2026. Danh mục (mã, mã cấp tỉnh tương ứng, tên) chép từ ảnh bản gốc ký số trên
// vanban.chinhphu.vn. Đơn vị tính là GỢI Ý để nhập số liệu; khi khai thác chính thức cần đối chiếu mục
// "Khái niệm, phương pháp tính" của từng chỉ tiêu trong Phụ lục II.

const G1 = '01. Đất đai, dân số';
const G2 = '02. Kinh tế';
const G3 = '03. Xã hội, môi trường';

type Row = [code: string, provinceCode: string, group: string, title: string, unit: string, lead: OrgRole, extra?: Partial<TemplateTarget>];

const ROWS: Row[] = [
  ['X0101', 'T0101', G1, 'Diện tích và cơ cấu đất', 'ha', 'ECONOMY', {
    dataSourceSystem: 'Kết quả thống kê, kiểm kê đất đai; Cơ sở dữ liệu đất đai',
    dataSourceAgency: 'Chủ trì: Văn phòng Đăng ký đất đai; phối hợp: UBND cấp xã',
  }],
  ['X0102', 'T0102', G1, 'Dân số, mật độ dân số', 'người', 'OFFICE', {
    coordinateRoles: ['POLICE', 'STATISTICS'],
    dataSourceSystem: 'Tổng điều tra dân số và nhà ở; Cơ sở dữ liệu quốc gia về dân cư; dữ liệu hành chính',
    dataSourceAgency: 'Chủ trì: Thống kê tỉnh; phối hợp: UBND cấp xã, Công an cấp xã',
  }],
  ['X0103', 'T0103', G1, 'Số hộ dân cư', 'hộ', 'OFFICE', { coordinateRoles: ['POLICE'] }],
  ['X0104', 'T0111', G1, 'Số cuộc kết hôn', 'cuộc', 'OFFICE', {
    dataSourceSystem: 'Cơ sở dữ liệu hộ tịch; chế độ báo cáo thống kê cấp bộ, ngành',
    dataSourceAgency: 'UBND cấp xã',
  }],
  ['X0105', 'T0113', G1, 'Số vụ ly hôn', 'vụ', 'OFFICE', { direction: TargetDirection.LOWER_IS_BETTER }],
  ['X0106', '', G1, 'Số trẻ em dưới 05 tuổi đã được đăng ký khai sinh', 'trẻ em', 'OFFICE', {
    dataSourceSystem: 'Cơ sở dữ liệu hộ tịch', dataSourceAgency: 'UBND cấp xã',
  }],
  ['X0107', 'T0116', G1, 'Số trường hợp tử vong được đăng ký khai tử', 'trường hợp', 'OFFICE', {
    dataSourceSystem: 'Cơ sở dữ liệu hộ tịch', dataSourceAgency: 'UBND cấp xã',
  }],
  ['X0201', 'T0301', G2, 'Số cơ sở, số lao động trong các cơ sở kinh tế', 'cơ sở', 'ECONOMY', { coordinateRoles: ['STATISTICS'] }],
  ['X0202', 'T0302', G2, 'Số cơ sở, số lao động trong các cơ sở hành chính, sự nghiệp', 'cơ sở', 'ECONOMY', { coordinateRoles: ['STATISTICS'] }],
  ['X0203', 'T0303', G2, 'Số hộ, số lao động kinh tế cá thể tham gia hoạt động nông nghiệp, lâm nghiệp và thủy sản', 'hộ', 'ECONOMY', { coordinateRoles: ['STATISTICS'] }],
  ['X0204', 'T0304', G2, 'Số doanh nghiệp, số lao động, nguồn vốn, doanh thu thuần, lợi nhuận trước thuế của doanh nghiệp', 'doanh nghiệp', 'ECONOMY', { coordinateRoles: ['STATISTICS'] }],
  ['X0205', 'T0310', G2, 'Số lượng trang trại', 'trang trại', 'ECONOMY'],
  ['X0206', 'T0311', G2, 'Giá trị sản phẩm và dịch vụ bình quân của trang trại', 'triệu đồng', 'ECONOMY'],
  ['X0207', 'T0312', G2, 'Số lượng hợp tác xã nông, lâm nghiệp và thủy sản, doanh thu bình quân hợp tác xã nông, lâm nghiệp và thủy sản', 'hợp tác xã', 'ECONOMY'],
  ['X0208', '', G2, 'Số dự án và vốn đầu tư thực hiện thuộc nguồn vốn ngân sách nhà nước do cấp xã quản lý', 'dự án', 'ECONOMY'],
  ['X0209', '', G2, 'Tổng giá trị sản phẩm trên địa bàn cấp xã', 'tỷ đồng', 'ECONOMY', { coordinateRoles: ['STATISTICS'] }],
  ['X0210', 'T0601', G2, 'Thu ngân sách xã, phường, đặc khu và cơ cấu thu', 'triệu đồng', 'ECONOMY', {
    frequency: TargetFrequency.MONTHLY,
    dataSourceSystem: 'Báo cáo thu ngân sách của xã, phường, đặc khu (hệ thống quản lý ngân sách, Kho bạc)',
    dataSourceAgency: 'Chủ trì: UBND cấp xã; phối hợp: Kho bạc Nhà nước khu vực, Thuế cơ sở, Hải quan khu vực',
  }],
  ['X0211', 'T0603', G2, 'Chi ngân sách xã, phường, đặc khu và cơ cấu chi', 'triệu đồng', 'ECONOMY', {
    frequency: TargetFrequency.MONTHLY,
    dataSourceSystem: 'Báo cáo chi ngân sách của xã, phường, đặc khu (hệ thống quản lý ngân sách, Kho bạc)',
    dataSourceAgency: 'Chủ trì: UBND cấp xã; phối hợp: Kho bạc Nhà nước khu vực',
  }],
  ['X0212', 'T0802', G2, 'Diện tích cây hằng năm', 'ha', 'ECONOMY'],
  ['X0213', 'T0803', G2, 'Diện tích cây lâu năm', 'ha', 'ECONOMY'],
  ['X0214', 'T0804', G2, 'Năng suất một số loại cây trồng chủ yếu', 'tạ/ha', 'ECONOMY'],
  ['X0215', 'T0805', G2, 'Sản lượng một số loại cây trồng chủ yếu', 'tấn', 'ECONOMY'],
  ['X0216', 'T0808', G2, 'Số lượng gia súc, gia cầm và động vật nuôi khác trong chăn nuôi', 'con', 'ECONOMY'],
  ['X0217', 'T0809', G2, 'Sản lượng một số sản phẩm chăn nuôi chủ yếu', 'tấn', 'ECONOMY'],
  ['X0218', 'T0810', G2, 'Diện tích rừng trồng mới tập trung', 'ha', 'ECONOMY'],
  ['X0219', 'T0813', G2, 'Diện tích mặt nước nuôi trồng thủy sản', 'ha', 'ECONOMY'],
  ['X0220', 'T0814', G2, 'Diện tích thu hoạch thủy sản', 'ha', 'ECONOMY'],
  ['X0221', 'T0815', G2, 'Sản lượng thủy sản', 'tấn', 'ECONOMY'],
  ['X0222', 'T0816', G2, 'Số lượng tàu khai thác thủy sản biển có động cơ', 'chiếc', 'ECONOMY'],
  ['X0223', '', G2, 'Diện tích đất sản xuất nông nghiệp, đất thủy sản sử dụng nhà kính, nhà lưới, nhà màng', 'ha', 'ECONOMY'],
  ['X0224', 'T0819', G2, 'Số lượng sản phẩm OCOP được công nhận 3 sao trở lên', 'sản phẩm', 'ECONOMY'],
  ['X0225', 'T0817', G2, 'Tỷ lệ chiều dài kênh mương được kiên cố', '%', 'ECONOMY'],
  ['X0226', 'T1004', G2, 'Số lượng chợ, siêu thị, trung tâm thương mại', 'cơ sở', 'ECONOMY'],
  ['X0301', 'T1312', G3, 'Tỷ lệ người dân có sử dụng dịch vụ công trực tuyến', '%', 'CENTER'],
  ['X0302', 'T1314', G3, 'Tỷ lệ hồ sơ trực tuyến toàn trình trên tổng hồ sơ giải quyết thủ tục hành chính', '%', 'CENTER', {
    dataSourceSystem: 'Hệ thống thông tin giải quyết thủ tục hành chính (Cổng dịch vụ công)',
    formula: {
      value: {
        op: 'percent',
        num: { agg: 'sum', dataset: 'ho_so_tthc_thang', column: 'truc_tuyen_toan_trinh', yearColumn: 'thang' },
        den: { agg: 'sum', dataset: 'ho_so_tthc_thang', column: 'tong_ho_so', yearColumn: 'thang' },
      },
      unit: '%',
      note: 'Tự tính từ bảng số liệu hồ sơ thủ tục hành chính theo tháng',
    },
  }],
  ['X0303', 'T1401', G3, 'Số cơ sở giáo dục mầm non', 'cơ sở', 'SOCIAL'],
  ['X0304', 'T1402', G3, 'Số nhóm trẻ, lớp mẫu giáo', 'nhóm, lớp', 'SOCIAL'],
  ['X0305', 'T1403', G3, 'Số phòng học mầm non', 'phòng', 'SOCIAL'],
  ['X0306', 'T1404', G3, 'Số giáo viên mầm non', 'người', 'SOCIAL'],
  ['X0307', 'T1405', G3, 'Số trẻ em mầm non', 'trẻ em', 'SOCIAL'],
  ['X0308', 'T1406', G3, 'Số trường tiểu học, trung học cơ sở', 'trường', 'SOCIAL'],
  ['X0309', 'T1407', G3, 'Số lớp tiểu học, trung học cơ sở', 'lớp', 'SOCIAL'],
  ['X0310', 'T1408', G3, 'Số phòng học tập tiểu học, trung học cơ sở', 'phòng', 'SOCIAL'],
  ['X0311', 'T1409', G3, 'Số giáo viên tiểu học, trung học cơ sở', 'người', 'SOCIAL'],
  ['X0312', 'T1410', G3, 'Số học sinh tiểu học, trung học cơ sở', 'học sinh', 'SOCIAL'],
  ['X0313', 'T1416', G3, 'Tỷ lệ phòng học kiên cố', '%', 'SOCIAL'],
  ['X0314', '', G3, 'Số nhân lực y tế của trạm y tế', 'người', 'SOCIAL'],
  ['X0315', '', G3, 'Số trẻ em được tiêm (uống) các vắc xin trong Chương trình tiêm chủng mở rộng theo quy định của Bộ Y tế', 'trẻ em', 'SOCIAL'],
  ['X0316', '', G3, 'Tỷ lệ dân số tham gia bảo hiểm y tế', '%', 'SOCIAL', { coordinateRoles: ['SOCIAL_INSURANCE'] }],
  ['X0317', 'T1702', G3, 'Tỷ lệ nghèo đa chiều', '%', 'SOCIAL', { direction: TargetDirection.LOWER_IS_BETTER }],
  ['X0318', 'T1704', G3, 'Thu nhập bình quân đầu người trên địa bàn cấp xã', 'triệu đồng/người', 'SOCIAL', { coordinateRoles: ['STATISTICS'] }],
  ['X0319', 'T1706', G3, 'Tỷ lệ dân số sử dụng nước sạch đáp ứng quy chuẩn', '%', 'ECONOMY'],
  ['X0320', 'T1802', G3, 'Số vụ cháy, nổ; số người chết, bị thương và thiệt hại về tài sản do cháy, nổ gây ra', 'vụ', 'POLICE', {
    direction: TargetDirection.LOWER_IS_BETTER,
  }],
  ['X0321', 'T2004', G3, 'Số vụ thiên tai và mức độ thiệt hại', 'vụ', 'ECONOMY', { direction: TargetDirection.LOWER_IS_BETTER }],
  ['X0322', '', G3, 'Tỷ lệ thu gom chất thải rắn sinh hoạt', '%', 'ECONOMY'],
];

export const TT148_TEMPLATE: FrameworkTemplate = {
  key: 'tt148-cap-xa',
  codeFor: year => `TT148-${year}`,
  nameFor: year => `Chỉ tiêu thống kê cấp xã năm ${year} (TT 148/2026/TT-BTC)`,
  kind: FrameworkKind.STAT,
  issuingLevel: IssuingLevel.CENTRAL,
  legalBasis: 'Thông tư 148/2026/TT-BTC ngày 07/10/2026 của Bộ Tài chính, Phụ lục II (hiệu lực 01/12/2026)',
  description: '55 chỉ tiêu thống kê UBND cấp xã có trách nhiệm thu thập, tổng hợp. Bộ thống kê không có mục tiêu: hệ thống theo dõi đã cập nhật số liệu từng kỳ hay chưa và ai chịu trách nhiệm.',
  scope: { localityKinds: [LocalityKind.XA, LocalityKind.PHUONG, LocalityKind.DAC_KHU] },
  effectiveYear: 2026,
  datasets: datasetTemplates(['ho_so_tthc_thang']),
  targets: ROWS.map(([code, provinceCode, group, title, unit, lead, extra], index) => ({
    key: code,
    groupName: group,
    ordinal: String(index + 1),
    standardCode: code,
    title,
    unit,
    description: provinceCode ? `Mã chỉ tiêu cấp tỉnh tương ứng: ${provinceCode}. Đơn vị tính là gợi ý, đối chiếu Phụ lục II TT 148/2026/TT-BTC.` : 'Đơn vị tính là gợi ý, đối chiếu Phụ lục II TT 148/2026/TT-BTC.',
    targetValue: 0,
    direction: TargetDirection.HIGHER_IS_BETTER,
    frequency: TargetFrequency.YEARLY,
    leadRole: lead,
    dataSourceSystem: 'Theo mục "Nguồn số liệu" của chỉ tiêu trong Phụ lục II TT 148/2026/TT-BTC',
    dataSourceAgency: 'UBND cấp xã',
    ...extra,
  })),
};
