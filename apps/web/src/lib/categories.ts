// Lĩnh vực chuẩn của chỉ tiêu, cùng danh sách với STANDARD_CATEGORIES ở API (extraction-structure.ts).
export const STANDARD_CATEGORIES = [
  'Kinh tế',
  'Y tế',
  'Giáo dục',
  'Văn hoá - xã hội',
  'Đô thị - môi trường',
  'Hành chính công - chuyển đổi số',
  'An ninh - quốc phòng',
  'Xây dựng Đảng - chính quyền',
] as const;

export const CATEGORY_OPTIONS = STANDARD_CATEGORIES.map(value => ({ value, label: value }));
