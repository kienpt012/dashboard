import { DepartmentKind, LocalityKind } from '@prisma/client';

// Mẫu cơ cấu tổ chức theo loại địa phương. Căn cứ: Nghị định 150/2025/NĐ-CP (sửa bởi Nghị định 370/2025/NĐ-CP,
// hiệu lực 01/01/2026) về cơ quan chuyên môn thuộc UBND cấp xã. Tỉnh được quyết định số lượng, tên phòng nên mẫu
// chỉ là điểm khởi đầu — trình thiết lập cho sửa, bỏ, thêm tự do.
//
// `role` là khóa vai trò nghiệp vụ dùng để ánh xạ đơn vị chủ trì của chỉ tiêu mẫu sang phòng thực tế của địa phương
// (vd chỉ tiêu thu ngân sách gắn role ECONOMY → "Phòng Kinh tế" ở xã, "Phòng Kinh tế, Hạ tầng và Đô thị" ở phường).

export type OrgRole =
  | 'LEADERSHIP'
  | 'OFFICE'
  | 'ECONOMY'
  | 'SOCIAL'
  | 'CENTER'
  | 'POLICE'
  | 'MILITARY'
  | 'FRONT'
  | 'SOCIAL_INSURANCE'
  | 'STATISTICS'
  | 'ACADEMIC'
  | 'OTHER';

export interface TemplateDepartment {
  code: string;
  name: string;
  shortName: string;
  kind: DepartmentKind;
  role: OrgRole;
  color: string;
  responsibilities: string;
  /** Đơn vị phối hợp ngoài bộ máy UBND (công an, BHXH…): mặc định không chọn. */
  optional?: boolean;
}

const OFFICE: TemplateDepartment = {
  code: 'VP',
  name: 'Văn phòng HĐND và UBND',
  shortName: 'Văn phòng',
  kind: DepartmentKind.OFFICE,
  role: 'OFFICE',
  color: '#0f766e',
  responsibilities: 'Tổng hợp, văn thư – lưu trữ, tư pháp – hộ tịch, nội vụ, thi đua – khen thưởng, cải cách hành chính, chuyển đổi số, tiếp công dân',
};

const SOCIAL: TemplateDepartment = {
  code: 'VHXH',
  name: 'Phòng Văn hóa – Xã hội',
  shortName: 'Văn hóa – Xã hội',
  kind: DepartmentKind.SPECIALIZED,
  role: 'SOCIAL',
  color: '#7c3aed',
  responsibilities: 'Văn hóa, thông tin, thể thao, du lịch, giáo dục, y tế, dân số, lao động – việc làm, bảo hiểm xã hội, giảm nghèo, bảo trợ xã hội, dân tộc – tôn giáo',
};

const CENTER: TemplateDepartment = {
  code: 'TTCC',
  name: 'Trung tâm Phục vụ hành chính công',
  shortName: 'Trung tâm PVHCC',
  kind: DepartmentKind.CENTER,
  role: 'CENTER',
  color: '#0891b2',
  responsibilities: 'Tiếp nhận, trả kết quả thủ tục hành chính, một cửa liên thông, dịch vụ công trực tuyến, thanh toán trực tuyến, số hóa hồ sơ, thu phí – lệ phí',
};

const EXTERNAL_UNITS: TemplateDepartment[] = [
  { code: 'CAND', name: 'Công an', shortName: 'Công an', kind: DepartmentKind.OTHER, role: 'POLICE', color: '#dc2626', responsibilities: 'An ninh trật tự, phòng chống tội phạm, ma túy, phòng cháy chữa cháy, an toàn giao thông, dữ liệu dân cư', optional: true },
  { code: 'QS', name: 'Ban Chỉ huy Quân sự', shortName: 'Quân sự', kind: DepartmentKind.OTHER, role: 'MILITARY', color: '#15803d', responsibilities: 'Quốc phòng, tuyển quân, dân quân tự vệ', optional: true },
  { code: 'MTTQ', name: 'Ủy ban Mặt trận Tổ quốc Việt Nam', shortName: 'Mặt trận', kind: DepartmentKind.OTHER, role: 'FRONT', color: '#d97706', responsibilities: 'Mặt trận Tổ quốc, đoàn thể, giám sát và phản biện xã hội, cuộc vận động khu dân cư văn hóa', optional: true },
  { code: 'BHXH', name: 'Bảo hiểm xã hội cơ sở', shortName: 'BHXH', kind: DepartmentKind.OTHER, role: 'SOCIAL_INSURANCE', color: '#0369a1', responsibilities: 'Bảo hiểm xã hội, bảo hiểm y tế, bảo hiểm thất nghiệp', optional: true },
  { code: 'TKCS', name: 'Thống kê cơ sở', shortName: 'Thống kê', kind: DepartmentKind.OTHER, role: 'STATISTICS', color: '#64748b', responsibilities: 'Số liệu thống kê, điều tra, tổng giá trị sản phẩm trên địa bàn', optional: true },
];

export interface OrgTemplate {
  key: string;
  label: string;
  note: string;
  departments: TemplateDepartment[];
}

export const ORG_TEMPLATES: Record<LocalityKind, OrgTemplate> = {
  PHUONG: {
    key: 'org-phuong-2026',
    label: 'UBND phường (Nghị định 150/2025, sửa đổi 2026)',
    note: 'Phường có Phòng Kinh tế, Hạ tầng và Đô thị thay cho Phòng Kinh tế.',
    departments: [
      OFFICE,
      { code: 'KTHTDT', name: 'Phòng Kinh tế, Hạ tầng và Đô thị', shortName: 'Kinh tế – Hạ tầng – Đô thị', kind: DepartmentKind.SPECIALIZED, role: 'ECONOMY', color: '#2563eb', responsibilities: 'Tài chính – ngân sách, kế hoạch – đầu tư công, công thương, xây dựng, quy hoạch, giao thông, đô thị, đất đai, tài nguyên – môi trường, cây xanh' },
      SOCIAL,
      CENTER,
      ...EXTERNAL_UNITS,
    ],
  },
  XA: {
    key: 'org-xa-2026',
    label: 'UBND xã (Nghị định 150/2025, sửa đổi 2026)',
    note: 'Xã có Phòng Kinh tế phụ trách cả nông nghiệp, tài nguyên – môi trường.',
    departments: [
      OFFICE,
      { code: 'KT', name: 'Phòng Kinh tế', shortName: 'Kinh tế', kind: DepartmentKind.SPECIALIZED, role: 'ECONOMY', color: '#2563eb', responsibilities: 'Nông nghiệp, thủy lợi, tài chính – ngân sách, kế hoạch – đầu tư công, công thương, xây dựng, giao thông, đất đai, tài nguyên – môi trường, chương trình nông thôn mới, OCOP' },
      SOCIAL,
      CENTER,
      ...EXTERNAL_UNITS,
    ],
  },
  DAC_KHU: {
    key: 'org-dac-khu-2026',
    label: 'UBND đặc khu',
    note: 'Đặc khu có thể có thêm phòng theo quyết định của tỉnh; hãy bổ sung sau khi tạo.',
    departments: [
      OFFICE,
      { code: 'KT', name: 'Phòng Kinh tế', shortName: 'Kinh tế', kind: DepartmentKind.SPECIALIZED, role: 'ECONOMY', color: '#2563eb', responsibilities: 'Kinh tế biển, thủy sản, du lịch, tài chính – ngân sách, đầu tư công, xây dựng, giao thông, đất đai, tài nguyên – môi trường' },
      SOCIAL,
      CENTER,
      ...EXTERNAL_UNITS,
    ],
  },
  TRUONG_HOC: {
    key: 'org-truong-hoc',
    label: 'Trường học',
    note: 'Văn thư trường tiếp nhận văn bản, hiệu trưởng phân về tổ; chỉ hiệu trưởng ký và phát hành văn bản ra ngoài.',
    departments: [
      { code: 'BGH', name: 'Ban Giám hiệu', shortName: 'Ban Giám hiệu', kind: DepartmentKind.LEADERSHIP, role: 'LEADERSHIP', color: '#0f766e', responsibilities: 'Lãnh đạo, quản lý chung, kế hoạch năm học, kiểm định chất lượng' },
      { code: 'VP', name: 'Văn phòng', shortName: 'Văn phòng', kind: DepartmentKind.OFFICE, role: 'OFFICE', color: '#0891b2', responsibilities: 'Văn thư, hành chính, kế toán, thiết bị, y tế học đường, chuyển đổi số' },
      { code: 'TTN', name: 'Tổ Khoa học tự nhiên', shortName: 'Tổ Tự nhiên', kind: DepartmentKind.SPECIALIZED, role: 'ACADEMIC', color: '#2563eb', responsibilities: 'Chuyên môn các môn tự nhiên, chất lượng học sinh' },
      { code: 'TXH', name: 'Tổ Khoa học xã hội', shortName: 'Tổ Xã hội', kind: DepartmentKind.SPECIALIZED, role: 'ACADEMIC', color: '#7c3aed', responsibilities: 'Chuyên môn các môn xã hội, hoạt động trải nghiệm' },
    ],
  },
  CO_QUAN_KHAC: {
    key: 'org-co-quan',
    label: 'Cơ quan, đơn vị khác',
    note: 'Cơ cấu tối thiểu; hãy đổi tên phòng cho đúng thực tế.',
    departments: [
      { code: 'LD', name: 'Lãnh đạo đơn vị', shortName: 'Lãnh đạo', kind: DepartmentKind.LEADERSHIP, role: 'LEADERSHIP', color: '#0f766e', responsibilities: 'Lãnh đạo, điều hành chung' },
      { code: 'VP', name: 'Văn phòng', shortName: 'Văn phòng', kind: DepartmentKind.OFFICE, role: 'OFFICE', color: '#0891b2', responsibilities: 'Văn thư, tổng hợp, hành chính' },
      { code: 'NV', name: 'Phòng Nghiệp vụ', shortName: 'Nghiệp vụ', kind: DepartmentKind.SPECIALIZED, role: 'ECONOMY', color: '#2563eb', responsibilities: 'Chuyên môn nghiệp vụ chính' },
    ],
  },
};

/** Thứ tự ưu tiên khi không tìm được đúng vai trò: chỉ tiêu vẫn có phòng chủ trì, người dùng đổi sau. */
export const ROLE_FALLBACK: OrgRole[] = ['OFFICE', 'ECONOMY', 'SOCIAL', 'CENTER', 'LEADERSHIP', 'ACADEMIC'];
