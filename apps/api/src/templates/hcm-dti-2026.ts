import { FrameworkKind, IssuingLevel, LocalityKind, TargetDirection, TargetFrequency } from '@prisma/client';
import type { FormulaSpec } from '../formula';
import { datasetTemplates } from './datasets-catalog';
import type { OrgRole } from './org-templates';
import type { FrameworkTemplate, TemplateTarget } from './types';

// Bộ chỉ số đánh giá chuyển đổi số các phường, xã, đặc khu thuộc TP.HCM — kèm theo Quyết định 3336/QĐ-UBND
// ngày 05/6/2026 của Chủ tịch UBND Thành phố. 8 nhóm, tổng 100 điểm. Chỉ số có dữ liệu nguồn rõ ràng được TỰ TÍNH
// từ kho dữ liệu (theo hướng dẫn tính điểm từ dataset của đơn vị); các chỉ số còn lại do cán bộ chấm và đính kèm
// tài liệu kiểm chứng. Nhóm là chỉ tiêu cha tự cộng điểm các chỉ số con.

const GROUPS: [key: string, title: string, max: number][] = [
  ['1', 'Nhận thức số', 8],
  ['2', 'Thể chế số', 10],
  ['3', 'Hạ tầng số', 6],
  ['4', 'Nhân lực số', 10],
  ['5', 'An toàn thông tin mạng', 5],
  ['6', 'Hoạt động Chính quyền số', 45],
  ['7', 'Hoạt động Kinh tế số', 6],
  ['8', 'Hoạt động Xã hội số', 10],
];

const LEADERS = ['Bí thư', 'Chủ tịch'];

function criterion(
  key: string,
  title: string,
  max: number,
  scoringRule: string,
  options: { lead?: OrgRole; evidence?: string; formula?: FormulaSpec; parentKey?: string; sumChildren?: boolean; source?: string } = {},
): TemplateTarget {
  const group = key.split('.')[0];
  return {
    key,
    parentKey: options.parentKey ?? group,
    groupName: GROUPS.find(item => item[0] === group)?.[1],
    ordinal: key,
    standardCode: `CDS-${key}`,
    title,
    unit: 'điểm',
    targetValue: max,
    maxScore: max,
    targetText: `Tối đa ${String(max).replace('.', ',')} điểm`,
    scoringRule,
    evidenceRequirement: options.evidence,
    direction: TargetDirection.HIGHER_IS_BETTER,
    frequency: TargetFrequency.QUARTERLY,
    leadRole: options.lead ?? 'OFFICE',
    formula: options.formula,
    sumChildren: options.sumChildren,
    dataSourceSystem: options.source,
    reportDueDay: 20,
  };
}

const ratioScore = (num: FormulaSpec['value'], den: FormulaSpec['value'], score: FormulaSpec['score'], note: string): FormulaSpec => ({
  value: { op: 'ratio', num, den },
  score,
  note,
});

const meetings = (where?: [string, 'in' | 'eq', unknown][]) =>
  ({ agg: 'count' as const, dataset: 'cuoc_hop_cds', yearColumn: 'ngay_hop', ...(where ? { where: where as never } : {}) });

const thematicDocs = (signedByLeader: boolean) => ({
  agg: 'count' as const,
  dataset: 'van_ban_cds',
  yearColumn: 'ngay_ban_hanh',
  where: [
    ['nhom_van_ban', 'eq', 'Chỉ đạo chuyên đề chuyển đổi số'],
    ...(signedByLeader ? [['chuc_danh_nguoi_ky', 'in', ['Bí thư', 'Chủ tịch', 'Phó Bí thư', 'Phó Chủ tịch']], ['tinh_trang', 'eq', 'Đã ban hành']] : []),
  ] as never,
});

const tthc = (column: string) => ({ agg: 'sum' as const, dataset: 'ho_so_tthc_thang', column, yearColumn: 'thang' });

const targets: TemplateTarget[] = [
  ...GROUPS.map(([key, title, max]): TemplateTarget => ({
    key,
    groupName: title,
    ordinal: key,
    standardCode: `CDS-${key}`,
    title,
    unit: 'điểm',
    targetValue: max,
    maxScore: max,
    targetText: `Tối đa ${max} điểm`,
    scoringRule: 'Tổng điểm các chỉ số thành phần',
    direction: TargetDirection.HIGHER_IS_BETTER,
    frequency: TargetFrequency.QUARTERLY,
    leadRole: 'OFFICE',
    sumChildren: true,
    reportDueDay: 20,
  })),
  criterion('1.1', 'Người đứng đầu xã, phường, đặc khu là Trưởng Ban Chỉ đạo về phát triển khoa học, công nghệ, đổi mới sáng tạo, chuyển đổi số và Đề án 06', 2,
    'Trưởng Ban là Bí thư/Chủ tịch: điểm tối đa. Chưa có Ban Chỉ đạo hoặc Trưởng Ban không phải Bí thư/Chủ tịch: 0 điểm.',
    { evidence: 'Quyết định thành lập/kiện toàn Ban Chỉ đạo' }),
  criterion('1.2', 'Bí thư/Chủ tịch xã, phường, đặc khu chủ trì các cuộc họp về chuyển đổi số', 2,
    'Tỷ lệ = số cuộc họp CĐS do Bí thư/Chủ tịch chủ trì ÷ tổng số cuộc họp CĐS; điểm = tỷ lệ × điểm tối đa.',
    {
      evidence: 'Thông báo kết luận/biên bản từng cuộc họp',
      source: 'Bảng dữ liệu "Cuộc họp về chuyển đổi số"',
      formula: ratioScore(meetings([['chuc_danh_chu_tri', 'in', LEADERS]]), meetings(), { type: 'linear', max: 2 }, 'Tự tính từ bảng cuộc họp chuyển đổi số'),
    }),
  criterion('1.3', 'Văn bản chỉ đạo chuyên đề về chuyển đổi số do người đứng đầu (hoặc cấp phó được giao nhiệm vụ về chuyển đổi số) ký', 2,
    'Tỷ lệ = số văn bản chỉ đạo chuyên đề CĐS do người đứng đầu (hoặc cấp phó được giao) ký ÷ tổng số văn bản chỉ đạo chuyên đề CĐS theo yêu cầu của Thành phố; điểm = tỷ lệ × điểm tối đa.',
    {
      evidence: 'Các văn bản chỉ đạo chuyên đề đã ban hành',
      source: 'Bảng dữ liệu "Văn bản chỉ đạo về chuyển đổi số"',
      formula: ratioScore(thematicDocs(true), thematicDocs(false), { type: 'linear', max: 2 }, 'Mẫu số là số văn bản chuyên đề đã ghi nhận; nếu Thành phố yêu cầu số lượng cụ thể, hãy ghi đủ các văn bản cần ban hành ở trạng thái Dự thảo'),
    }),
  criterion('1.4', 'Cổng/Trang thông tin điện tử có chuyên mục riêng về chuyển đổi số', 2,
    'Đã có chuyên mục: từ 52 tin bài/năm trở lên được điểm tối đa; từ 20 đến 51: 1/2 điểm tối đa; dưới 20: 1/4 điểm tối đa. Chưa có chuyên mục: 0 điểm.',
    {
      evidence: 'Đường dẫn chuyên mục, danh sách tin bài trong năm',
      source: 'Bảng dữ liệu "Tin, bài về chuyển đổi số"',
      formula: {
        value: { agg: 'count', dataset: 'tin_bai_cds', yearColumn: 'ngay_dang', where: [['kenh_dang_tai', 'eq', 'Cổng/Trang thông tin điện tử']] },
        score: { type: 'steps', steps: [{ gte: 52, score: 2 }, { gte: 20, score: 1 }, { gte: 1, score: 0.5 }], otherwise: 0 },
        note: 'Đếm tin bài đăng trên Cổng/Trang trong năm; chưa có tin bài nào được coi như chưa có chuyên mục',
      },
    }),
  criterion('2.1', 'Triển khai Kế hoạch của Thành ủy và UBND Thành phố thực hiện Nghị quyết 57-NQ/TW về đột phá phát triển khoa học, công nghệ, đổi mới sáng tạo và chuyển đổi số', 1,
    'Đã ban hành kế hoạch năm: điểm tối đa; chưa ban hành: 0 điểm.', { evidence: 'Kế hoạch năm của đơn vị' }),
  criterion('2.2', 'Triển khai Kế hoạch về chuyển đổi số', 1, 'Đã ban hành kế hoạch năm: điểm tối đa; chưa ban hành: 0 điểm.', { evidence: 'Kế hoạch chuyển đổi số năm' }),
  criterion('2.3', 'Thực hiện báo cáo định kỳ hằng quý về chuyển đổi số và phát triển đô thị thông minh trên Hệ thống DTI', 2,
    'Mỗi quý: đúng hạn 0,5 điểm; trễ hạn 0,25 điểm; không thực hiện 0 điểm.',
    {
      evidence: 'Xác nhận nộp báo cáo trên Hệ thống DTI',
      source: 'Bảng dữ liệu "Báo cáo định kỳ quý về chuyển đổi số"',
      formula: {
        value: {
          op: 'ratio',
          num: {
            op: 'add',
            args: [
              { op: 'mul', args: [{ agg: 'count', dataset: 'bao_cao_dti_quy', where: [['trang_thai', 'eq', 'Đúng hạn']], yearColumn: 'han_nop' }, 0.5] },
              { op: 'mul', args: [{ agg: 'count', dataset: 'bao_cao_dti_quy', where: [['trang_thai', 'eq', 'Trễ hạn']], yearColumn: 'han_nop' }, 0.25] },
            ],
          },
          den: 2,
        },
        score: { type: 'linear', max: 2 },
        note: '0,5 điểm mỗi quý đúng hạn, 0,25 điểm mỗi quý trễ hạn, tối đa 2 điểm',
      },
    }),
  criterion('2.4', 'Triển khai Nghị quyết của HĐND Thành phố quy định mức thu lệ phí đối với dịch vụ công cung cấp trực tuyến', 1, 'Đã ban hành: điểm tối đa; chưa ban hành: 0 điểm.', { evidence: 'Văn bản triển khai', lead: 'CENTER' }),
  criterion('2.5', 'Triển khai văn bản về phát triển dữ liệu số', 2, 'Đã ban hành: điểm tối đa; chưa ban hành: 0 điểm.', { evidence: 'Văn bản triển khai phát triển dữ liệu số' }),
  criterion('2.6', 'Triển khai Kế hoạch phong trào Bình dân học vụ số', 2, 'Đã ban hành: 1/2 điểm tối đa; đã hoàn thành các nhiệm vụ được giao: thêm 1/2 điểm tối đa.', { evidence: 'Kế hoạch và báo cáo kết quả thực hiện', lead: 'SOCIAL' }),
  criterion('2.7', 'Có sáng kiến khuyến khích người dân, doanh nghiệp/hộ kinh doanh sử dụng dịch vụ công trực tuyến', 1, 'Đã ban hành: điểm tối đa; chưa ban hành: 0 điểm.', { evidence: 'Văn bản ban hành sáng kiến', lead: 'CENTER' }),
  criterion('3.1', 'Tỷ lệ công chức, viên chức được trang bị máy tính', 1, 'Tỷ lệ = tổng số máy tính ÷ tổng số CCVC. 100%: điểm tối đa; từ 90% đến dưới 100%: tỷ lệ × điểm tối đa; dưới 90%: 0 điểm.', { evidence: 'Danh sách thiết bị và danh sách CCVC' }),
  criterion('3.2', 'Tỷ lệ máy tính kết nối Internet (trừ máy tính xử lý tài liệu mật)', 1, '100%: điểm tối đa; từ 90% đến dưới 100%: tỷ lệ × điểm tối đa; dưới 90%: 0 điểm.', { evidence: 'Danh sách thiết bị' }),
  criterion('3.3', 'Mức độ ứng dụng trí tuệ nhân tạo (AI) trong nền tảng số', 4, 'Có ứng dụng AI phục vụ CCVC: 1/2 điểm tối đa. Có ứng dụng AI phục vụ người dân, doanh nghiệp: mỗi ứng dụng 1/4 điểm tối đa, tối đa 2 ứng dụng.', { evidence: 'Mô tả ứng dụng AI đang triển khai (vd IOC này: AI đọc văn bản trích xuất chỉ tiêu phục vụ CCVC)' }),
  criterion('4.1', 'Tỷ lệ ấp, khu phố có Tổ công nghệ số cộng đồng được ban hành quyết định thành lập/kiện toàn', 2, 'Số khu phố có Tổ CNS ÷ tổng số khu phố; đạt 100%: điểm tối đa; dưới 100%: tỷ lệ × điểm tối đa.', { evidence: 'Quyết định thành lập/kiện toàn Tổ CNS', lead: 'SOCIAL' }),
  criterion('4.2', 'Có bộ phận/đầu mối thực hiện nhiệm vụ về chuyển đổi số', 2, 'Có: điểm tối đa; không có: 0 điểm.', { evidence: 'Quyết định phân công' }),
  criterion('4.3', 'Công chức, viên chức chuyên trách về chuyển đổi số', 1, 'Có CCVC chuyên trách bố trí tại UBND cấp xã: điểm tối đa; không có: 0 điểm.', { evidence: 'Quyết định phân công' }),
  criterion('4.4', 'Công chức, viên chức chuyên trách/kiêm nhiệm về an toàn thông tin mạng', 1, 'Có: điểm tối đa; không có: 0 điểm.', { evidence: 'Quyết định phân công' }),
  criterion('4.5', 'Tỷ lệ công chức, viên chức được bồi dưỡng, tập huấn về chuyển đổi số', 2,
    'Tỷ lệ = số CCVC được bồi dưỡng, tập huấn (trực tiếp và trực tuyến) ÷ tổng số CCVC; đạt 100%: điểm tối đa; dưới 100%: tỷ lệ × điểm tối đa.',
    {
      evidence: 'Danh sách học viên, chứng nhận hoàn thành',
      source: 'Bảng dữ liệu "Công chức, viên chức được tập huấn chuyển đổi số"',
      formula: ratioScore(
        { agg: 'count', dataset: 'tap_huan_ccvc', where: [['da_tap_huan', 'isTrue']] },
        { agg: 'count', dataset: 'tap_huan_ccvc' },
        { type: 'capped', max: 2 },
        'Tự tính từ danh sách CCVC và tình trạng tập huấn',
      ),
    }),
  criterion('4.6', 'Số lượng người dân được phổ cập kỹ năng số', 2, 'Tổng điểm hai chỉ số thành phần 4.6.1 và 4.6.2.', { sumChildren: true, lead: 'SOCIAL' }),
  criterion('4.6.1', 'Triển khai các hoạt động phổ cập kỹ năng số cho người dân', 1, 'Có tổ chức (Nền tảng Bình dân học vụ số, "Cà phê sáng", "Gia đình số", "Đại sứ số"…): điểm tối đa; không triển khai: 0 điểm.', { parentKey: '4.6', lead: 'SOCIAL', evidence: 'Kế hoạch, hình ảnh, danh sách tham gia' }),
  criterion('4.6.2', 'Tỷ lệ người dân được phổ cập kỹ năng số', 1, 'Tỷ lệ = số người dân được phổ cập ÷ dân số trưởng thành; điểm = tỷ lệ × điểm tối đa.', { parentKey: '4.6', lead: 'SOCIAL', evidence: 'Báo cáo số người được phổ cập' }),
  criterion('5.1', 'Số lượng hệ thống thông tin được xác định và phê duyệt cấp độ an toàn', 1, 'Tỷ lệ = số HTTT đã được phê duyệt cấp độ ÷ tổng số HTTT; điểm = tỷ lệ × điểm tối đa.', { evidence: 'Quyết định phê duyệt cấp độ' }),
  criterion('5.2', 'Số lượng hệ thống thông tin triển khai đầy đủ phương án bảo vệ theo hồ sơ đề xuất cấp độ đã được phê duyệt', 1, 'Tỷ lệ = số HTTT đã triển khai đủ phương án ÷ tổng số HTTT đã được phê duyệt; điểm = tỷ lệ × điểm tối đa.', { evidence: 'Báo cáo triển khai phương án bảo vệ' }),
  criterion('5.3', 'Cổng/Trang thông tin điện tử được cấp chứng nhận tín nhiệm mạng', 1, 'Đã được cấp: điểm tối đa; chưa được cấp: 0 điểm.', { evidence: 'Giấy chứng nhận tín nhiệm mạng' }),
  criterion('5.4', 'Người đứng đầu UBND cấp xã thường xuyên đôn đốc, chỉ đạo, điều hành về công tác an toàn thông tin', 2, 'Đã triển khai: điểm tối đa; chưa triển khai: 0 điểm.',
    {
      evidence: 'Biên bản họp hoặc văn bản chỉ đạo về an toàn thông tin',
      source: 'Bảng dữ liệu "Cuộc họp về chuyển đổi số" và "Văn bản chỉ đạo về chuyển đổi số"',
      formula: {
        value: {
          op: 'add',
          args: [
            { agg: 'count', dataset: 'cuoc_hop_cds', where: [['chu_de_chinh', 'eq', 'An toàn thông tin'], ['co_bien_ban', 'isTrue']], yearColumn: 'ngay_hop' },
            { agg: 'count', dataset: 'van_ban_cds', where: [['nhom_van_ban', 'eq', 'An toàn thông tin'], ['tinh_trang', 'eq', 'Đã ban hành']], yearColumn: 'ngay_ban_hanh' },
          ],
        },
        score: { type: 'binary', max: 2 },
        note: 'Đủ điểm khi có ít nhất một cuộc họp có biên bản hoặc một văn bản đã ban hành về an toàn thông tin trong năm',
      },
    }),
  criterion('6.1', 'Cổng/Trang thông tin điện tử đáp ứng yêu cầu chức năng, tính năng kỹ thuật theo quy định', 2, 'Gắn nhãn đã kết nối Hệ thống EMC: 1/2 điểm tối đa; có đường dẫn trên trang chủ đến Cổng/Trang UBND Thành phố: 1/2 điểm tối đa.', { evidence: 'Ảnh chụp trang chủ' }),
  criterion('6.2', 'Tỷ lệ thủ tục hành chính liên quan đến doanh nghiệp được thực hiện trực tuyến, thông suốt, liền mạch', 3, 'Đạt 100%: điểm tối đa; dưới 100%: 0 điểm.', { lead: 'CENTER', evidence: 'Danh mục TTHC liên quan doanh nghiệp và mức độ DVCTT' }),
  criterion('6.3', 'Tỷ lệ hồ sơ nộp trực tuyến', 5,
    'Tỷ lệ = (hồ sơ nộp trực tuyến một phần + toàn trình) ÷ tổng hồ sơ giải quyết TTHC trong năm; từ 75% trở lên: điểm tối đa; dưới 75%: tỷ lệ × điểm tối đa.',
    { lead: 'CENTER', source: 'Bảng "Số liệu hồ sơ thủ tục hành chính theo tháng"', evidence: 'Báo cáo thống kê của Hệ thống thông tin giải quyết TTHC',
      formula: ratioScore(tthc('nop_truc_tuyen'), tthc('tong_ho_so'), { type: 'threshold', min: 0.75, max: 5 }, 'Tự tính từ số liệu hồ sơ TTHC theo tháng') }),
  criterion('6.4', 'Tỷ lệ hồ sơ trực tuyến toàn trình', 5,
    'Tỷ lệ = hồ sơ trực tuyến toàn trình ÷ tổng hồ sơ giải quyết TTHC trong năm; từ 80% trở lên: điểm tối đa; dưới 80%: tỷ lệ × điểm tối đa.',
    { lead: 'CENTER', source: 'Bảng "Số liệu hồ sơ thủ tục hành chính theo tháng"', evidence: 'Báo cáo thống kê của Hệ thống thông tin giải quyết TTHC',
      formula: ratioScore(tthc('truc_tuyen_toan_trinh'), tthc('tong_ho_so'), { type: 'threshold', min: 0.8, max: 5 }, 'Tự tính từ số liệu hồ sơ TTHC theo tháng') }),
  criterion('6.5', 'Mức độ hài lòng của người dân, doanh nghiệp khi sử dụng dịch vụ công trực tuyến trên Bản đồ thực thi thể chế quốc gia', 3, 'Tỷ lệ = số đánh giá hài lòng ÷ tổng số người dân, doanh nghiệp tham gia đánh giá; từ 95% trở lên: điểm tối đa; dưới 95%: tỷ lệ × điểm tối đa.', { lead: 'CENTER', evidence: 'Ảnh chụp kết quả đánh giá trên Bản đồ thực thi thể chế' }),
  criterion('6.6', 'Tỷ lệ hồ sơ, thủ tục hành chính có cấp kết quả giải quyết bản điện tử', 5,
    'Tỷ lệ = hồ sơ được cấp kết quả điện tử ÷ hồ sơ đã giải quyết; điểm = tỷ lệ × điểm tối đa.',
    { lead: 'CENTER', source: 'Bảng "Số liệu hồ sơ thủ tục hành chính theo tháng"',
      formula: ratioScore(tthc('co_ket_qua_dien_tu'), tthc('tong_ho_so'), { type: 'linear', max: 5 }, 'Tự tính từ số liệu hồ sơ TTHC theo tháng') }),
  criterion('6.7', 'Tỷ lệ hồ sơ thủ tục hành chính được tiếp nhận và số hóa hồ sơ', 5,
    'Tỷ lệ = hồ sơ tiếp nhận đã số hóa ÷ tổng hồ sơ tiếp nhận; điểm = tỷ lệ × điểm tối đa.',
    { lead: 'CENTER', source: 'Bảng "Số liệu hồ sơ thủ tục hành chính theo tháng"',
      formula: ratioScore(tthc('da_so_hoa'), tthc('tong_ho_so'), { type: 'linear', max: 5 }, 'Tự tính từ số liệu hồ sơ TTHC theo tháng') }),
  criterion('6.8', 'Tỷ lệ thủ tục hành chính có phát sinh giao dịch thanh toán trực tuyến', 4, 'Tỷ lệ = số TTHC có phát sinh thanh toán trực tuyến ÷ tổng số TTHC đang triển khai thanh toán trực tuyến; điểm = tỷ lệ × điểm tối đa.', { lead: 'CENTER', evidence: 'Thống kê giao dịch thanh toán trực tuyến theo TTHC' }),
  criterion('6.9', 'Tỷ lệ hồ sơ thanh toán trực tuyến', 4,
    'Tỷ lệ = số hồ sơ có phát sinh thanh toán trực tuyến ÷ tổng hồ sơ đã giải quyết của các TTHC đang triển khai thanh toán trực tuyến; điểm = tỷ lệ × điểm tối đa.',
    { lead: 'CENTER', source: 'Bảng "Số liệu hồ sơ thủ tục hành chính theo tháng"', evidence: 'Thống kê giao dịch thanh toán',
      formula: ratioScore(tthc('thanh_toan_truc_tuyen'), tthc('tong_ho_so'), { type: 'linear', max: 4 }, 'Gần đúng: mẫu số là tổng hồ sơ giải quyết; nếu chỉ một số TTHC triển khai thanh toán, hãy nhập riêng số hồ sơ của các TTHC đó') }),
  criterion('6.10', 'Sử dụng Nền tảng tích hợp, chia sẻ Kho dữ liệu dùng chung', 2, 'Có sử dụng: điểm tối đa; chưa sử dụng: 0 điểm.', { evidence: 'Ảnh chụp tài khoản và lượt khai thác' }),
  criterion('6.11', 'Sử dụng Hệ thống tiếp nhận, xử lý phản ánh kiến nghị người dân qua tổng đài 1022', 4, 'Có sử dụng hệ thống 1022: 2 điểm. Số tin giải quyết đúng hẹn ÷ tổng số tin tiếp nhận trong năm: 100% được 2 điểm; từ 90% đến dưới 100%: tỷ lệ × 2 điểm; dưới 90%: 0 điểm. Không có phản ánh: điểm tối đa.', { evidence: 'Thống kê trên Hệ thống 1022' }),
  criterion('6.12', 'Tỷ lệ hồ sơ công việc tại cấp xã được xử lý trên môi trường mạng (trừ hồ sơ có nội dung mật)', 3, 'Đạt 100%: điểm tối đa; dưới 100%: 0 điểm.', { evidence: 'Thống kê trên phần mềm quản lý văn bản và hồ sơ công việc' }),
  criterion('7.1', 'Tổ chức triển khai kế hoạch hành động phát triển kinh tế số và xã hội số trong ngành, lĩnh vực, địa phương', 3, 'Đã ban hành kế hoạch hoặc tổ chức triển khai: điểm tối đa; chưa: 0 điểm.', { lead: 'ECONOMY', evidence: 'Kế hoạch hành động' }),
  criterion('7.2', 'Tuyên truyền, hướng dẫn, khuyến khích người dân sử dụng dịch vụ số (DVCTT, y tế số, giáo dục số, mạng xã hội, mua bán trực tuyến, thanh toán điện tử, tài nguyên số)', 3, 'Tuyên truyền đầy đủ 7 nội dung: điểm tối đa; chưa đầy đủ: số nội dung ÷ 7 × điểm tối đa; chưa tuyên truyền: 0 điểm.', { lead: 'SOCIAL', evidence: 'Kế hoạch, hình ảnh, báo cáo tuyên truyền theo từng nội dung' }),
  criterion('8.1', 'Tỷ lệ người dân từ 14 tuổi trở lên có danh tính điện tử (VNeID) sử dụng được cho giao dịch điện tử', 2, 'Tỷ lệ = dân số từ 14 tuổi có tài khoản định danh mức 2 ÷ dân số trung bình từ 14 tuổi; điểm = tỷ lệ × điểm tối đa.', { lead: 'POLICE', evidence: 'Số liệu từ Công an cấp xã' }),
  criterion('8.2', 'Số lượng dân số trưởng thành có chữ ký số hoặc chữ ký điện tử cá nhân', 5, 'Tỷ lệ = số người có chữ ký số/chữ ký điện tử ÷ dân số trưởng thành; từ 30% trở lên: điểm tối đa; dưới 30%: tỷ lệ × điểm tối đa.', { lead: 'SOCIAL', evidence: 'Số liệu từ nhà cung cấp dịch vụ chữ ký số' }),
  criterion('8.3', 'Tỷ lệ người dân biết kỹ năng về công nghệ thông tin và truyền thông', 3, 'Tổng điểm hai chỉ số thành phần 8.3.1 và 8.3.2.', { sumChildren: true, lead: 'SOCIAL' }),
  criterion('8.3.1', 'Triển khai các hoạt động phát huy hiệu quả Tổ công nghệ số cộng đồng ("đi từng ngõ, gõ từng nhà")', 2, 'Có triển khai: điểm tối đa; không triển khai: 0 điểm.', { parentKey: '8.3', lead: 'SOCIAL', evidence: 'Báo cáo hoạt động Tổ CNS' }),
  criterion('8.3.2', 'Tỷ lệ người dân được tuyên truyền, hướng dẫn sử dụng dịch vụ, tiện ích số của Thành phố', 1, 'Tỷ lệ = số người được tuyên truyền, hướng dẫn ÷ dân số trung bình; từ 70% trở lên: điểm tối đa; dưới 70%: tỷ lệ × điểm tối đa.', { parentKey: '8.3', lead: 'SOCIAL', evidence: 'Báo cáo số người được hướng dẫn' }),
];

export const HCM_DTI_2026_TEMPLATE: FrameworkTemplate = {
  key: 'hcm-dti-xa-2026',
  codeFor: year => `HCM-CDS-${year}`,
  nameFor: year => `Chỉ số chuyển đổi số cấp xã năm ${year} (QĐ 3336/QĐ-UBND)`,
  kind: FrameworkKind.SCORE,
  issuingLevel: IssuingLevel.PROVINCE,
  legalBasis: 'Quyết định 3336/QĐ-UBND ngày 05/6/2026 của Chủ tịch UBND Thành phố Hồ Chí Minh',
  description: 'Bộ chỉ số đánh giá chuyển đổi số các phường, xã, đặc khu: 8 nhóm, 100 điểm. Các chỉ số 1.2, 1.3, 1.4, 2.3, 4.5, 5.4, 6.3, 6.4, 6.6, 6.7, 6.9 tự tính từ kho dữ liệu; các chỉ số khác cán bộ chấm kèm tài liệu kiểm chứng.',
  maxScore: 100,
  scope: { localityKinds: [LocalityKind.XA, LocalityKind.PHUONG, LocalityKind.DAC_KHU], province: 'Thành phố Hồ Chí Minh' },
  effectiveYear: 2026,
  datasets: datasetTemplates(['cuoc_hop_cds', 'van_ban_cds', 'tin_bai_cds', 'bao_cao_dti_quy', 'tap_huan_ccvc', 'ho_so_tthc_thang']),
  targets,
};
