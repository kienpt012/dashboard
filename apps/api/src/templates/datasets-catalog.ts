import type { TemplateDataset } from './types';

// Bảng dữ liệu nghiệp vụ dùng chung giữa các bộ chỉ tiêu. Một bảng nuôi nhiều chỉ tiêu ở nhiều bộ khác nhau —
// vd số liệu hồ sơ thủ tục hành chính theo tháng cùng lúc tính: chỉ số CĐS 6.3, 6.4, 6.6, 6.7; chỉ tiêu KT-XH
// "tỷ lệ giải quyết hồ sơ đúng hạn" và chỉ tiêu thống kê X0302. Cán bộ nhập một lần, mọi nơi dùng chung.
// Cột được thiết kế theo các "cột chính cần kiểm tra" trong hướng dẫn tính điểm DTI của đơn vị.

const LEADER_TITLES = ['Bí thư', 'Chủ tịch', 'Phó Bí thư', 'Phó Chủ tịch', 'Khác'];

export const DATASET_CATALOG: Record<string, TemplateDataset> = {
  ho_so_tthc_thang: {
    code: 'ho_so_tthc_thang',
    name: 'Số liệu hồ sơ thủ tục hành chính theo tháng',
    description: 'Mỗi dòng là số liệu tổng hợp một tháng của Trung tâm Phục vụ hành chính công.',
    ownerRole: 'CENTER',
    updateCycle: 'Hằng tháng, trước ngày 20',
    sourceSystem: 'Hệ thống thông tin giải quyết thủ tục hành chính của Thành phố/Tỉnh (Cổng dịch vụ công)',
    collectionGuide: 'Đăng nhập Hệ thống thông tin giải quyết TTHC → Thống kê → Báo cáo tình hình giải quyết hồ sơ theo tháng của đơn vị; chép các cột tương ứng. Chụp màn hình báo cáo làm minh chứng.',
    columns: [
      { key: 'thang', label: 'Tháng (ngày đầu tháng)', type: 'date', required: true },
      { key: 'tong_ho_so', label: 'Tổng hồ sơ giải quyết', type: 'number', required: true },
      { key: 'nop_truc_tuyen', label: 'Hồ sơ nộp trực tuyến (một phần + toàn trình)', type: 'number' },
      { key: 'truc_tuyen_toan_trinh', label: 'Hồ sơ trực tuyến toàn trình', type: 'number' },
      { key: 'dung_han', label: 'Hồ sơ giải quyết đúng hạn, trước hạn', type: 'number' },
      { key: 'co_ket_qua_dien_tu', label: 'Hồ sơ được cấp kết quả điện tử', type: 'number' },
      { key: 'da_so_hoa', label: 'Hồ sơ tiếp nhận đã số hóa', type: 'number' },
      { key: 'thanh_toan_truc_tuyen', label: 'Hồ sơ có thanh toán trực tuyến', type: 'number' },
    ],
  },
  cuoc_hop_cds: {
    code: 'cuoc_hop_cds',
    name: 'Cuộc họp về chuyển đổi số',
    description: 'Mỗi dòng là một cuộc họp có nội dung chuyển đổi số hoặc an toàn thông tin.',
    ownerRole: 'OFFICE',
    updateCycle: 'Sau mỗi cuộc họp',
    collectionGuide: 'Văn phòng ghi nhận sau mỗi cuộc họp; đính kèm thông báo kết luận/biên bản ở mục minh chứng của chỉ số liên quan.',
    columns: [
      { key: 'ten_cuoc_hop', label: 'Tên cuộc họp', type: 'text', required: true },
      { key: 'ngay_hop', label: 'Ngày họp', type: 'date', required: true },
      { key: 'chu_de_chinh', label: 'Chủ đề chính', type: 'enum', options: ['Chuyển đổi số', 'An toàn thông tin', 'Đề án 06', 'Khác'], required: true },
      { key: 'chuc_danh_chu_tri', label: 'Chức danh người chủ trì', type: 'enum', options: LEADER_TITLES, required: true },
      { key: 'co_bien_ban', label: 'Có biên bản/thông báo kết luận', type: 'boolean' },
    ],
  },
  van_ban_cds: {
    code: 'van_ban_cds',
    name: 'Văn bản chỉ đạo về chuyển đổi số',
    description: 'Mỗi dòng là một văn bản chỉ đạo chuyên đề về chuyển đổi số, an toàn thông tin hoặc kế hoạch liên quan.',
    ownerRole: 'OFFICE',
    updateCycle: 'Khi ban hành văn bản',
    collectionGuide: 'Văn thư ghi số ký hiệu, ngày ban hành, người ký từ sổ văn bản đi.',
    columns: [
      { key: 'so_ky_hieu', label: 'Số, ký hiệu', type: 'text', required: true },
      { key: 'ngay_ban_hanh', label: 'Ngày ban hành', type: 'date', required: true },
      { key: 'nhom_van_ban', label: 'Nhóm văn bản', type: 'enum', options: ['Chỉ đạo chuyên đề chuyển đổi số', 'An toàn thông tin', 'Kế hoạch thực hiện Nghị quyết 57', 'Kế hoạch chuyển đổi số năm', 'Phát triển dữ liệu số', 'Bình dân học vụ số', 'Khác'], required: true },
      { key: 'chuc_danh_nguoi_ky', label: 'Chức danh người ký', type: 'enum', options: LEADER_TITLES, required: true },
      { key: 'tinh_trang', label: 'Tình trạng', type: 'enum', options: ['Đã ban hành', 'Dự thảo'], required: true },
    ],
  },
  tin_bai_cds: {
    code: 'tin_bai_cds',
    name: 'Tin, bài về chuyển đổi số',
    description: 'Mỗi dòng là một tin, bài đăng tại chuyên mục chuyển đổi số của Cổng/Trang thông tin điện tử.',
    ownerRole: 'OFFICE',
    updateCycle: 'Khi đăng tin',
    collectionGuide: 'Sao chép tiêu đề, ngày đăng, đường dẫn từ chuyên mục chuyển đổi số trên Cổng/Trang thông tin điện tử.',
    columns: [
      { key: 'tieu_de', label: 'Tiêu đề', type: 'text', required: true },
      { key: 'ngay_dang', label: 'Ngày đăng', type: 'date', required: true },
      { key: 'kenh_dang_tai', label: 'Kênh đăng tải', type: 'enum', options: ['Cổng/Trang thông tin điện tử', 'Mạng xã hội', 'Khác'], required: true },
      { key: 'url_bai_viet', label: 'Đường dẫn bài viết', type: 'text' },
    ],
  },
  bao_cao_dti_quy: {
    code: 'bao_cao_dti_quy',
    name: 'Báo cáo định kỳ quý về chuyển đổi số trên Hệ thống DTI',
    description: 'Mỗi dòng là tình trạng nộp báo cáo của một quý.',
    ownerRole: 'OFFICE',
    updateCycle: 'Hằng quý',
    sourceSystem: 'Hệ thống DTI của Thành phố',
    collectionGuide: 'Ghi hạn nộp và ngày nộp thực tế theo xác nhận trên Hệ thống DTI.',
    columns: [
      { key: 'quy', label: 'Quý', type: 'enum', options: ['Quý I', 'Quý II', 'Quý III', 'Quý IV'], required: true },
      { key: 'han_nop', label: 'Hạn nộp', type: 'date', required: true },
      { key: 'ngay_nop', label: 'Ngày nộp thực tế', type: 'date' },
      { key: 'trang_thai', label: 'Trạng thái', type: 'enum', options: ['Đúng hạn', 'Trễ hạn', 'Không thực hiện'], required: true },
    ],
  },
  tap_huan_ccvc: {
    code: 'tap_huan_ccvc',
    name: 'Công chức, viên chức được bồi dưỡng, tập huấn chuyển đổi số',
    description: 'Mỗi dòng là một công chức, viên chức của đơn vị và tình trạng tập huấn chuyển đổi số trong năm.',
    ownerRole: 'OFFICE',
    updateCycle: 'Khi có lớp tập huấn',
    collectionGuide: 'Danh sách CCVC theo biên chế; đánh dấu người đã hoàn thành lớp bồi dưỡng (trực tiếp hoặc trực tuyến), ghi mã lớp.',
    columns: [
      { key: 'ho_ten', label: 'Họ và tên', type: 'text', required: true },
      { key: 'chuc_vu', label: 'Chức vụ', type: 'text' },
      { key: 'da_tap_huan', label: 'Đã hoàn thành tập huấn', type: 'boolean', required: true },
      { key: 'ma_lop', label: 'Mã lớp tập huấn', type: 'text' },
    ],
  },
};

/** Bảng dựng sẵn lấy dữ liệu trực tiếp từ hệ thống — không ai phải nhập. */
export const BUILTIN_DATASETS: Record<string, { name: string; description: string; columns: TemplateDataset['columns'] }> = {
  feedback: {
    name: 'Phản ánh của người dân (dữ liệu hệ thống)',
    description: 'Lấy trực tiếp từ phân hệ tiếp nhận phản ánh của IOC. Chỉ đọc.',
    columns: [
      { key: 'ma', label: 'Mã phản ánh', type: 'text' },
      { key: 'ngay_tiep_nhan', label: 'Ngày tiếp nhận', type: 'date' },
      { key: 'han_xu_ly', label: 'Hạn xử lý', type: 'date' },
      { key: 'ngay_giai_quyet', label: 'Ngày giải quyết', type: 'date' },
      { key: 'nhom_van_de', label: 'Nhóm vấn đề', type: 'text' },
      { key: 'trang_thai', label: 'Trạng thái', type: 'text' },
      { key: 'da_ket_thuc', label: 'Đã kết thúc xử lý', type: 'boolean' },
      { key: 'dung_han', label: 'Giải quyết đúng hạn', type: 'boolean' },
      { key: 'don_vi', label: 'Đơn vị xử lý', type: 'text' },
    ],
  },
};

export function datasetTemplates(codes: string[]): TemplateDataset[] {
  return codes.map(code => {
    const template = DATASET_CATALOG[code];
    if (!template) throw new Error(`Thiếu định nghĩa bảng dữ liệu mẫu ${code}`);
    return template;
  });
}
