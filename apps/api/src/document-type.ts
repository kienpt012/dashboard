import { DocumentType } from '@prisma/client';

// Nhận dạng loại văn bản bằng luật, không cần model: số ký hiệu theo Nghị định 30/2020/NĐ-CP ("333/QĐ-UBND",
// "05-NQ/ĐU", "1234/UBND-VP") và tên loại in hoa ở đầu văn bản ("QUYẾT ĐỊNH", "KẾ HOẠCH"). Cán bộ chọn loại lúc tải lên
// thì giữ lựa chọn đó; chỉ văn bản để "Khác" mới được điền tự động.

export interface DocumentMeta {
  docType: DocumentType | null;
  /** Số ký hiệu như văn bản ghi, đã bỏ khoảng trắng thừa ("333/QĐ-UBND"). */
  docNumber: string | null;
  /** Ngày ban hành YYYY-MM-DD đọc từ dòng "…, ngày 15 tháng 01 năm 2026". */
  issuedDate: string | null;
  /** Căn cứ nhận dạng, ghi vào ghi chú của lượt đọc. */
  basis: string | null;
}

// Chữ viết tắt tên loại văn bản (Phụ lục III Nghị định 30/2020/NĐ-CP và văn bản quy phạm pháp luật).
const SYMBOL_TYPES: Record<string, DocumentType> = {
  'QĐ': DocumentType.QUYET_DINH,
  'NQ': DocumentType.NGHI_QUYET,
  'KH': DocumentType.KE_HOACH,
  'BC': DocumentType.BAO_CAO,
  'CT': DocumentType.CHI_THI,
  'CTR': DocumentType.CHUONG_TRINH,
  'TB': DocumentType.THONG_BAO,
  'NĐ': DocumentType.NGHI_DINH,
  'TT': DocumentType.THONG_TU,
  'TTLT': DocumentType.THONG_TU,
  'CV': DocumentType.CONG_VAN,
};
// Tên loại khác có chữ viết tắt riêng: không phải công văn dù không nằm trong danh sách loại của hệ thống.
const OTHER_SYMBOLS = new Set(['TTR', 'HD', 'PA', 'ĐA', 'DA', 'QC', 'QĐI', 'QCPH', 'BB', 'GM', 'GGT', 'GNP', 'HĐ', 'CĐ', 'KL', 'QYĐ', 'BBGN', 'DS']);

const TITLE_TYPES: [RegExp, DocumentType][] = [
  [/^QUYẾT ĐỊNH(?![\p{L}])/u, DocumentType.QUYET_DINH],
  [/^NGHỊ QUYẾT(?![\p{L}])/u, DocumentType.NGHI_QUYET],
  [/^NGHỊ ĐỊNH(?![\p{L}])/u, DocumentType.NGHI_DINH],
  [/^THÔNG TƯ(?![\p{L}])/u, DocumentType.THONG_TU],
  [/^CHỈ THỊ(?![\p{L}])/u, DocumentType.CHI_THI],
  [/^CHƯƠNG TRÌNH(?![\p{L}])/u, DocumentType.CHUONG_TRINH],
  [/^KẾ HOẠCH(?![\p{L}])/u, DocumentType.KE_HOACH],
  [/^BÁO CÁO(?![\p{L}])/u, DocumentType.BAO_CAO],
  [/^THÔNG BÁO(?![\p{L}])/u, DocumentType.THONG_BAO],
  [/^PHỤ LỤC(?![\p{L}])/u, DocumentType.PHU_LUC],
];

const UPPER = String.raw`[\p{Lu}Đ]`;
// "Số: 333/QĐ-UBND", "Số: 30/2020/NĐ-CP", "Số:      /KH-UBND" (dự thảo chưa có số).
const SLASH_SYMBOL = new RegExp(String.raw`Số\s*:?\s*(\d{1,5}[a-zA-Z]?)?\s*\/\s*((?:(?:19|20)\d{2}\s*\/\s*)?${UPPER}[\p{L}Đ]{0,5}(?:\s*-\s*${UPPER}[\p{L}Đ&.]{0,12}){0,3})`, 'u');
// Văn bản của Đảng: "Số 05-NQ/ĐU", "Số: 12-CTr/ĐU".
const DASH_SYMBOL = new RegExp(String.raw`Số\s*:?\s*(\d{1,5})\s*-\s*(${UPPER}[\p{L}Đ]{0,5})\s*\/\s*(${UPPER}[\p{L}Đ]{0,10})`, 'u');

function typeOfSymbol(symbol: string): DocumentType | 'other' | null {
  const key = symbol.normalize('NFC').toUpperCase();
  return SYMBOL_TYPES[key] ?? (OTHER_SYMBOLS.has(key) ? 'other' : null);
}

function lastDayValid(year: number, month: number, day: number) {
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Đọc loại, số ký hiệu và ngày ban hành từ phần đầu văn bản (trang 1). */
export function detectDocumentMeta(firstPageText: string | null | undefined): DocumentMeta {
  const text = (firstPageText ?? '').normalize('NFC').slice(0, 4000);
  const meta: DocumentMeta = { docType: null, docNumber: null, issuedDate: null, basis: null };
  if (!text.trim()) return meta;

  let symbolType: DocumentType | 'other' | null = null;
  const dash = DASH_SYMBOL.exec(text);
  const slash = SLASH_SYMBOL.exec(text);
  if (dash) {
    meta.docNumber = `${dash[1]}-${dash[2]}/${dash[3]}`;
    symbolType = typeOfSymbol(dash[2]);
  } else if (slash) {
    const symbol = slash[2].replace(/\s+/g, '');
    meta.docNumber = slash[1] ? `${slash[1]}/${symbol}` : null;
    const parts = symbol.replace(/^(?:19|20)\d{2}\//u, '').split('-');
    symbolType = typeOfSymbol(parts[0]);
    // Công văn không có chữ viết tắt tên loại: ký hiệu là tên cơ quan rồi tên đơn vị soạn thảo ("UBND-VP").
    if (symbolType === null && parts.length >= 2) symbolType = DocumentType.CONG_VAN;
  }

  let titleType: DocumentType | null = null;
  for (const line of text.split('\n').slice(0, 60)) {
    const single = line.replace(/\s+/g, ' ').trim();
    if (single.length < 6) continue;
    const found = TITLE_TYPES.find(([pattern]) => pattern.test(single));
    if (found) {
      titleType = found[1];
      break;
    }
  }

  if (symbolType && symbolType !== 'other' && symbolType !== DocumentType.CONG_VAN) {
    meta.docType = symbolType;
    meta.basis = `số ký hiệu ${meta.docNumber ?? slash?.[2] ?? ''}`.trim();
  } else if (titleType) {
    meta.docType = titleType;
    meta.basis = 'tên loại in hoa ở đầu văn bản';
  } else if (symbolType === DocumentType.CONG_VAN || /(?:^|\n)\s*(?:V\/v|Về việc)\s/u.test(text) || /Kính gửi\s*:/u.test(text)) {
    // Công văn không ghi tên loại: nhận theo ký hiệu, trích yếu "V/v" hoặc dòng "Kính gửi".
    if (symbolType !== 'other') {
      meta.docType = DocumentType.CONG_VAN;
      meta.basis = symbolType === DocumentType.CONG_VAN ? `số ký hiệu ${meta.docNumber ?? ''}`.trim() : 'trích yếu "V/v" hoặc dòng "Kính gửi"';
    }
  }

  const issued = /ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+((?:19|20)\d{2})/iu.exec(text);
  if (issued) {
    const [day, month, year] = [Number(issued[1]), Number(issued[2]), Number(issued[3])];
    if (lastDayValid(year, month, day)) meta.issuedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return meta;
}

/** Bóc nhiệm vụ từ văn xuôi: không, chỉ ở phần nhiệm vụ/tổ chức thực hiện, hay ở mọi phần không phải phần chỉ tiêu. */
export type TaskMode = 'none' | 'sections' | 'all';

export interface DocumentProfile {
  /** Nhãn dùng trong ghi chú của lượt trích xuất. */
  label: string;
  tasks: TaskMode;
  /** Văn bản kể kết quả đã thực hiện: con số trong câu văn thường là số thực hiện, không phải mức giao. */
  reportsResults: boolean;
}

// Hồ sơ xử lý theo loại văn bản. Chỉ tiêu được bóc ở mọi loại (bảng bằng code, văn xuôi bằng Qwen); hồ sơ quyết định
// có bóc thêm nhiệm vụ hay không. Thêm loại mới chỉ cần thêm một dòng ở đây.
const PROFILES: Record<DocumentType, DocumentProfile> = {
  QUYET_DINH: { label: 'Quyết định', tasks: 'none', reportsResults: false },
  NGHI_QUYET: { label: 'Nghị quyết', tasks: 'none', reportsResults: false },
  NGHI_DINH: { label: 'Nghị định', tasks: 'none', reportsResults: false },
  THONG_TU: { label: 'Thông tư', tasks: 'none', reportsResults: false },
  KE_HOACH: { label: 'Kế hoạch', tasks: 'sections', reportsResults: false },
  CHUONG_TRINH: { label: 'Chương trình', tasks: 'sections', reportsResults: false },
  CONG_VAN: { label: 'Công văn', tasks: 'all', reportsResults: false },
  CHI_THI: { label: 'Chỉ thị', tasks: 'all', reportsResults: false },
  THONG_BAO: { label: 'Thông báo', tasks: 'all', reportsResults: false },
  BAO_CAO: { label: 'Báo cáo', tasks: 'none', reportsResults: true },
  PHU_LUC: { label: 'Phụ lục', tasks: 'none', reportsResults: false },
  KHAC: { label: 'Khác', tasks: 'none', reportsResults: false },
};

export function documentProfile(docType: DocumentType | null | undefined): DocumentProfile {
  return PROFILES[docType ?? DocumentType.KHAC] ?? PROFILES.KHAC;
}
