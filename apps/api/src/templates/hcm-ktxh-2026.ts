import { FrameworkKind, IssuingLevel, LocalityKind, TargetDirection, TargetFrequency } from '@prisma/client';
import { datasetTemplates } from './datasets-catalog';
import type { FrameworkTemplate, TemplateTarget } from './types';

// Chỉ tiêu thực hiện kế hoạch phát triển KT-XH năm 2026 giao cấp xã — Quyết định 333/QĐ-UBND ngày 15/01/2026
// của UBND TP.HCM. Mẫu giữ tên, đơn vị tính, kỳ báo cáo, cơ quan phối hợp và mục tiêu CHUNG toàn thành phố; các
// chỉ tiêu có mức giao riêng từng phường/xã (thu ngân sách, số phòng học, lao động, tuyển quân…) để trống để địa
// phương nhập theo Phụ lục 2 của Quyết định. Hạn báo cáo: tháng/quý/6 tháng/9 tháng ngày 20; năm ngày 20/11.

const ECON = 'I. Chỉ tiêu kinh tế';
const SOC = 'II. Chỉ tiêu văn hóa – xã hội';
const ENV = 'III. Chỉ tiêu môi trường, đô thị';
const ADM = 'IV. Chỉ tiêu cải cách hành chính';
const DEF = 'V. Chỉ tiêu quốc phòng, an ninh';

const MONTHLY = TargetFrequency.MONTHLY; // "Tháng, quý, 6 tháng, năm"
const QUARTERLY = TargetFrequency.QUARTERLY; // "Quý, 6 tháng, năm"
const SEMI = TargetFrequency.SEMIANNUAL; // "6 tháng, năm"
const YEARLY = TargetFrequency.YEARLY; // "Năm"
const WARD_PLAN = 'Theo mức giao cho đơn vị tại Phụ lục 2 Quyết định 333/QĐ-UBND';

function row(
  ordinal: string,
  groupName: string,
  title: string,
  unit: string,
  frequency: TargetFrequency,
  plan: { value?: number; text: string; needsPlanValue?: boolean },
  extra: Partial<TemplateTarget> = {},
): TemplateTarget {
  return {
    key: ordinal,
    ordinal,
    groupName,
    title,
    unit,
    frequency,
    targetValue: plan.value ?? 0,
    targetText: plan.text,
    needsPlanValue: plan.needsPlanValue,
    direction: TargetDirection.HIGHER_IS_BETTER,
    leadRole: 'OFFICE',
    reportDueDay: 20,
    ...extra,
  };
}

export const HCM_KTXH_2026_TEMPLATE: FrameworkTemplate = {
  key: 'hcm-ktxh-2026',
  codeFor: year => `HCM-KTXH-${year}`,
  nameFor: year => `Chỉ tiêu KT-XH năm ${year} Thành phố giao (QĐ 333/QĐ-UBND)`,
  kind: FrameworkKind.PLAN,
  issuingLevel: IssuingLevel.PROVINCE,
  legalBasis: 'Quyết định 333/QĐ-UBND ngày 15/01/2026 của UBND Thành phố Hồ Chí Minh',
  description: '30 chỉ tiêu chủ yếu thực hiện kế hoạch phát triển kinh tế – xã hội năm 2026 Thành phố giao UBND cấp xã. Báo cáo tháng chậm nhất ngày 20 hằng tháng; báo cáo năm chậm nhất ngày 20/11.',
  scope: { localityKinds: [LocalityKind.XA, LocalityKind.PHUONG, LocalityKind.DAC_KHU], province: 'Thành phố Hồ Chí Minh' },
  effectiveYear: 2026,
  datasets: datasetTemplates(['ho_so_tthc_thang']),
  targets: [
    row('1', ECON, 'Tốc độ tăng tổng giá trị sản phẩm trên địa bàn', '%', YEARLY, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'ECONOMY', coordinateRoles: ['STATISTICS'] }),
    row('2', ECON, 'Tổng thu ngân sách nhà nước so với dự toán được giao', '%', MONTHLY, { value: 100, text: '100% dự toán được giao' }, {
      leadRole: 'ECONOMY',
      dataSourceSystem: 'Báo cáo thu ngân sách (Kho bạc Nhà nước khu vực, Thuế cơ sở)',
      collectionGuide: 'Lấy số thu lũy kế đến kỳ báo cáo trên báo cáo thu ngân sách của Kho bạc; tỷ lệ = số thu ÷ dự toán được giao × 100. Chụp màn hình báo cáo làm minh chứng.',
    }),
    row('3', ECON, 'Tỷ lệ giải ngân vốn đầu tư công', '%', MONTHLY, { value: 95, text: '≥95%' }, { leadRole: 'ECONOMY' }),
    row('4', SOC, 'Tỷ lệ dân số tham gia bảo hiểm y tế', '%', MONTHLY, { value: 95, text: '≥95%' }, { leadRole: 'SOCIAL', coordinateRoles: ['SOCIAL_INSURANCE'], dataSourceAgency: 'Bảo hiểm xã hội cơ sở' }),
    row('5', SOC, 'Tỷ lệ lực lượng lao động trong độ tuổi tham gia bảo hiểm xã hội', '%', MONTHLY, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL', coordinateRoles: ['SOCIAL_INSURANCE'], dataSourceAgency: 'Bảo hiểm xã hội cơ sở' }),
    row('6', SOC, 'Tỷ lệ trường Mầm non đạt chuẩn Quốc gia', '%', SEMI, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL' }),
    row('7', SOC, 'Tỷ lệ trường Tiểu học đạt chuẩn Quốc gia', '%', SEMI, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL' }),
    row('8', SOC, 'Tỷ lệ trường Trung học cơ sở đạt chuẩn Quốc gia', '%', SEMI, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL' }),
    row('9', SOC, 'Bảo đảm tối thiểu số phòng học/10.000 dân trong độ tuổi đi học (từ 3 đến 18 tuổi)', 'phòng học', SEMI, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL' }),
    row('10', SOC, 'Tỉ lệ hoàn thành cấp Trung học cơ sở', '%', YEARLY, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL' }),
    row('11', SOC, 'Giảm tỷ lệ hộ nghèo theo chuẩn nghèo đa chiều', '%', YEARLY, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL', description: 'Mục tiêu là mức giảm tỷ lệ hộ nghèo (điểm phần trăm) trong năm.' }),
    row('12', SOC, 'Tỷ lệ khu phố văn hóa', '%', YEARLY, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL', coordinateRoles: ['FRONT'] }),
    row('13', SOC, 'Tỷ lệ gia đình văn hóa', '%', YEARLY, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL', coordinateRoles: ['FRONT'] }),
    row('14', SOC, 'Tỷ lệ trẻ em dưới 01 tuổi được tiêm chủng đầy đủ các loại vắc xin quy định', '%', QUARTERLY, { value: 95, text: '≥95%' }, { leadRole: 'SOCIAL', dataSourceAgency: 'Trạm y tế' }),
    row('15', SOC, 'Số lao động trên địa bàn được giới thiệu việc làm', 'lao động', QUARTERLY, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'SOCIAL' }),
    row('16', SOC, 'Xây dựng 01 mô hình du lịch phù hợp với điều kiện của địa phương hoặc phối hợp tổ chức 01 chương trình du lịch gắn kết các điểm đến, di tích trên địa bàn', 'mô hình', YEARLY, { value: 1, text: '01 mô hình hoặc 01 chương trình du lịch' }, { leadRole: 'SOCIAL' }),
    row('17', ENV, 'Tỷ lệ dân số được sử dụng nước sạch', '%', QUARTERLY, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'ECONOMY' }),
    row('18', ENV, 'Tỷ lệ thu gom chất thải rắn sinh hoạt', '%', SEMI, { value: 100, text: 'Phấn đấu 100%' }, { leadRole: 'ECONOMY' }),
    row('19', ENV, 'Tỷ lệ chất thải y tế được xử lý đạt quy chuẩn', '%', QUARTERLY, { value: 100, text: 'Duy trì 100%' }, { leadRole: 'SOCIAL' }),
    row('20', ENV, 'Tỷ lệ xử lý nước thải công nghiệp', '%', YEARLY, { value: 100, text: 'Duy trì 100%' }, { leadRole: 'ECONOMY' }),
    row('21', ENV, 'Phát triển cây xanh tập trung khu vực đô thị', '%', QUARTERLY, { value: 100, text: 'Theo hai chỉ tiêu thành phần' }, {
      leadRole: 'ECONOMY',
      description: 'Chỉ tiêu tổng hợp: tiến độ bằng trung bình tiến độ của hai chỉ tiêu thành phần.',
      sumChildren: true,
    }),
    row('21.1', ENV, 'Số lượng cây xanh bóng mát thêm mới', 'cây', QUARTERLY, { text: WARD_PLAN, needsPlanValue: true }, {
      parentKey: '21',
      leadRole: 'ECONOMY',
      evidenceRequirement: 'Kế hoạch trồng cây (Tết trồng cây, ngày 19/5…), biên bản nghiệm thu hoặc báo cáo kết quả có số cây và vị trí',
    }),
    row('21.2', ENV, 'Diện tích công viên thêm mới', 'ha', QUARTERLY, { text: 'Hoàn thành chuẩn bị đầu tư để đến năm 2030 phát triển 02 ha công viên', needsPlanValue: true }, { parentKey: '21', leadRole: 'ECONOMY' }),
    row('22', ADM, 'Tỷ lệ giải quyết hồ sơ hành chính đúng hạn trên các lĩnh vực', '%', MONTHLY, { text: WARD_PLAN, needsPlanValue: true }, {
      leadRole: 'CENTER',
      dataSourceSystem: 'Hệ thống thông tin giải quyết thủ tục hành chính',
      formula: {
        value: {
          op: 'percent',
          num: { agg: 'sum', dataset: 'ho_so_tthc_thang', column: 'dung_han', yearColumn: 'thang' },
          den: { agg: 'sum', dataset: 'ho_so_tthc_thang', column: 'tong_ho_so', yearColumn: 'thang' },
        },
        unit: '%',
        note: 'Tự tính từ bảng số liệu hồ sơ thủ tục hành chính theo tháng',
      },
    }),
    row('23', ADM, 'Tỷ lệ cán bộ, công chức lãnh đạo quản lý và cán bộ, công chức, viên chức đăng ký và sử dụng chữ ký số cá nhân của Ban Cơ yếu Chính phủ', '%', QUARTERLY, { value: 100, text: '100%' }, { leadRole: 'OFFICE' }),
    row('24', DEF, 'Hoàn thành chỉ tiêu tuyển chọn gọi công dân nhập ngũ và tham gia Công an nhân dân, đảm bảo chất lượng theo quy định', 'người', YEARLY, { text: WARD_PLAN, needsPlanValue: true }, { leadRole: 'MILITARY', coordinateRoles: ['POLICE'] }),
    row('25', DEF, 'Kéo giảm tổng số vụ tội phạm về trật tự xã hội so với năm trước', '%', MONTHLY, { value: 10, text: 'Giảm 10% số vụ so với năm 2025' }, { leadRole: 'POLICE', description: 'Giá trị báo cáo là mức giảm (%) so với cùng kỳ năm trước.' }),
    row('26', DEF, 'Tỷ lệ khám phá án tội phạm về trật tự xã hội', '%', MONTHLY, { value: 80, text: '>80%' }, { leadRole: 'POLICE' }),
    row('27', DEF, 'Kéo giảm tai nạn giao thông trên cả ba tiêu chí (số vụ, số người chết, số người bị thương); không để xảy ra tai nạn giao thông đặc biệt nghiêm trọng', '%', MONTHLY, { value: 5, text: 'Kéo giảm 5% trên cả 03 tiêu chí so với năm 2025' }, { leadRole: 'POLICE' }),
    row('28', DEF, 'Không để xảy ra cháy nổ gây thiệt hại nghiêm trọng', 'vụ', MONTHLY, { value: 0, text: 'Không để xảy ra cháy nổ gây thiệt hại nghiêm trọng' }, { leadRole: 'POLICE', direction: TargetDirection.LOWER_IS_BETTER }),
    row('29', DEF, 'Địa phương không phức tạp về ma túy', 'khu phố', YEARLY, { text: 'Địa phương không phức tạp về ma túy', needsPlanValue: true }, { leadRole: 'POLICE', description: 'Báo cáo số khu phố/ấp không có ma túy.' }),
    row('30', DEF, 'Tỷ lệ xử lý phản ánh, kiến nghị đúng hạn', '%', MONTHLY, { value: 50, text: '≥50%' }, {
      leadRole: 'OFFICE',
      dataSourceSystem: 'Phân hệ tiếp nhận phản ánh của IOC (tự động); bổ sung số liệu tổng đài 1022 nếu có',
      formula: {
        value: {
          op: 'percent',
          num: { agg: 'count', dataset: 'feedback', where: [['da_ket_thuc', 'isTrue'], ['dung_han', 'isTrue']], yearColumn: 'ngay_tiep_nhan' },
          den: { agg: 'count', dataset: 'feedback', where: [['da_ket_thuc', 'isTrue']], yearColumn: 'ngay_tiep_nhan' },
        },
        unit: '%',
        note: 'Tự tính từ phản ánh tiếp nhận trên hệ thống: số đã kết thúc đúng hạn ÷ số đã kết thúc',
      },
    }),
  ],
};
