import {
  CandidateOrigin,
  CandidateStatus,
  DirectiveKind,
  EvaluationResult,
  EvidenceKind,
  ExplanationStatus,
  ExtractionMethod,
  FrameworkKind,
  LocalityKind,
  Prisma,
  PrismaClient,
  ProgressReviewStatus,
  Role,
  TargetDirection,
  TargetFrequency,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type { Actor } from '../src/access';
import { recomputeTargets, rollupParents } from '../src/datasets';
import { applyFrameworkTemplate } from '../src/frameworks';
import { evaluateTarget } from '../src/metrics';
import { findFrameworkTemplate, ORG_TEMPLATES } from '../src/templates';
import { periodKeyFor } from '../src/periods';

// Dữ liệu mẫu IOC bản 2: một phường ví dụ được dựng bằng ĐÚNG trình thiết lập và thư viện bộ chỉ tiêu mẫu mà một
// địa phương thật sẽ dùng. Kế hoạch KT-XH lấy theo mức giao công khai tại QĐ 333/QĐ-UBND; mọi số liệu THỰC HIỆN là
// giả lập để minh họa. Seed chỉ tạo dữ liệu còn thiếu, không ghi đè dữ liệu đang vận hành.

const prisma = new PrismaClient();
const YEAR = 2026;

function seedPassword(name: 'DEMO_ADMIN_PASSWORD' | 'DEMO_USER_PASSWORD', fallback: string) {
  const configured = process.env[name]?.trim();
  const value = configured || fallback;
  const isWeak =
    !configured
    || configured === fallback
    || configured.startsWith('replace-with-')
    || value.length < 12
    || !/[a-z]/.test(value)
    || !/[A-Z]/.test(value)
    || !/\d/.test(value)
    || !/[^A-Za-z0-9]/.test(value);
  if (process.env.NODE_ENV === 'production' && isWeak) {
    throw new Error(`${name} must be explicitly set to a strong, non-default password in production.`);
  }
  return value;
}

/** Ngày giờ Việt Nam → UTC. */
function vn(date: string, hour = 9) {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+07:00`);
}

function asActor(user: { id: string; username: string; fullName: string; role: Role; departmentId: string | null }): Actor {
  return { ...user, isActive: true, department: null };
}

// Mức giao QĐ 333 (Phụ lục 2) cho phường mẫu và mã chỉ tiêu theo hệ thống mã CT của đơn vị.
const KTXH_PLAN: Record<string, { value: number; text?: string; code: string }> = {
  '1': { value: 11, text: '11%', code: 'CT2' },
  '2': { value: 100, text: '100% dự toán (1.133 tỷ đồng)', code: 'CT3' },
  '3': { value: 95, code: 'CT39' },
  '4': { value: 95, code: 'CT4' },
  '5': { value: 59.5, text: '59,5%', code: 'CT41' },
  '6': { value: 9, text: '9%', code: 'CT42' },
  '7': { value: 60, text: '60%', code: 'CT6' },
  '8': { value: 85, text: '85%', code: 'CT7' },
  '9': { value: 189, text: '189 phòng học', code: 'CT8' },
  '10': { value: 99, text: '99%', code: 'CT9' },
  '11': { value: 0.17, text: 'Giảm 0,17%', code: 'CT10' },
  '12': { value: 95, text: '95%', code: 'CT11' },
  '13': { value: 93, text: '93%', code: 'CT12' },
  '14': { value: 95, code: 'CT13' },
  '15': { value: 2500, text: '2.500 lao động', code: 'CT14' },
  '16': { value: 1, code: 'CT16' },
  '17': { value: 99.75, text: '99,75%', code: 'CT18' },
  '18': { value: 100, code: 'CT19' },
  '19': { value: 100, code: 'CT20' },
  '20': { value: 100, code: 'CT21' },
  '21': { value: 100, code: 'CT22' },
  '21.1': { value: 200, text: '200 cây', code: 'CT23' },
  '21.2': { value: 2, text: 'Chuẩn bị đầu tư để đến 2030 có 02 ha công viên', code: 'CT24' },
  '22': { value: 96.88, text: '96,88%', code: 'CT44' },
  '23': { value: 100, code: 'CT45' },
  '24': { value: 65, text: '65 người', code: 'CT25' },
  '25': { value: 10, code: 'CT26' },
  '26': { value: 80, code: 'CT27' },
  '27': { value: 5, code: 'CT28' },
  '28': { value: 0, code: 'CT33' },
  '29': { value: 30, text: 'Ít nhất 30% khu phố không ma túy', code: 'CT34' },
  '30': { value: 50, code: 'CT36' },
};

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED?.toLowerCase() !== 'true') {
    throw new Error('Không chạy dữ liệu mẫu trong production. Chỉ đặt ALLOW_DEMO_SEED=true khi đã xác nhận đây là môi trường demo.');
  }

  // 1. Hồ sơ địa phương mẫu — địa phương thật thay bằng trình thiết lập.
  const hasProfile = await prisma.localityProfile.findUnique({ where: { id: 'default' } });
  if (!hasProfile) {
    await prisma.localityProfile.create({
      data: {
        id: 'default',
        kind: LocalityKind.PHUONG,
        name: 'Phường Lái Thiêu',
        agencyName: 'UBND Phường Lái Thiêu',
        shortName: 'Lái Thiêu',
        provinceName: 'Thành phố Hồ Chí Minh',
        emailDomain: 'laithieu.gov.vn',
        primaryColor: '#1d4ed8',
        setupCompletedAt: new Date(),
        appliedTemplates: ['org-phuong-2026', 'hcm-ktxh-2026', 'hcm-dti-xa-2026', 'tt148-cap-xa'],
      },
    });
  }
  const domain = (await prisma.localityProfile.findUniqueOrThrow({ where: { id: 'default' } })).emailDomain ?? 'example.gov.vn';

  // 2. Cơ cấu tổ chức theo mẫu phường (Nghị định 150/2025, sửa đổi 2026) + đơn vị phối hợp.
  const departmentIds: Record<string, string> = {};
  const template = ORG_TEMPLATES.PHUONG.departments.filter(department => !department.optional || ['CAND', 'MTTQ', 'QS', 'BHXH'].includes(department.code));
  for (const [index, department] of template.entries()) {
    const saved = await prisma.department.upsert({
      where: { code: department.code },
      update: {},
      create: {
        code: department.code, name: department.name, shortName: department.shortName, kind: department.kind,
        color: department.color, responsibilities: department.responsibilities, sortOrder: (index + 1) * 10,
      },
    });
    // Phòng có từ bản 1 (chưa có loại, lĩnh vực) được bổ sung thông tin còn thiếu, không đổi tên đang dùng.
    if (!saved.responsibilities) {
      await prisma.department.update({
        where: { id: saved.id },
        data: { kind: department.kind, shortName: saved.shortName ?? department.shortName, responsibilities: department.responsibilities, sortOrder: (index + 1) * 10 },
      });
    }
    departmentIds[department.code] = saved.id;
  }

  // 3. Tài khoản theo đúng vai trò nghiệp vụ trong buổi khảo sát.
  const adminPassword = await bcrypt.hash(seedPassword('DEMO_ADMIN_PASSWORD', 'Admin@12345'), 10);
  const demoPassword = await bcrypt.hash(seedPassword('DEMO_USER_PASSWORD', 'Demo@12345'), 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash: adminPassword, fullName: 'Quản trị hệ thống', position: 'Quản trị hệ thống', email: `admin@${domain}`, role: Role.ADMIN, departmentId: null },
  });
  const people = [
    ['chu.tich', 'Võ Thành Đạt', 'Chủ tịch UBND phường', Role.LEADER, null],
    ['pho.chu.tich', 'Huỳnh Thị Mai', 'Phó Chủ tịch UBND phường', Role.LEADER, null],
    ['van.thu', 'Đặng Ngọc Hân', 'Văn thư', Role.CLERK, 'VP'],
    ['chanh.vp', 'Bùi Quốc Bảo', 'Chánh Văn phòng HĐND và UBND', Role.MANAGER, 'VP'],
    ['lan.anh', 'Nguyễn Lan Anh', 'Trưởng phòng Kinh tế, Hạ tầng và Đô thị', Role.MANAGER, 'KTHTDT'],
    ['staff.ktht', 'Trần Minh Khôi', 'Chuyên viên', Role.STAFF, 'KTHTDT'],
    ['thao.ktht', 'Phạm Thanh Thảo', 'Chuyên viên', Role.STAFF, 'KTHTDT'],
    ['manager.vhxh', 'Phạm Thu Hương', 'Trưởng phòng Văn hóa – Xã hội', Role.MANAGER, 'VHXH'],
    ['staff.vhxh', 'Lý Hoàng Nam', 'Chuyên viên', Role.STAFF, 'VHXH'],
    ['manager.ttcc', 'Đỗ Thị Thu', 'Giám đốc Trung tâm Phục vụ hành chính công', Role.MANAGER, 'TTCC'],
    ['staff.ttcc', 'Ngô Gia Huy', 'Chuyên viên', Role.STAFF, 'TTCC'],
    ['viewer.ktht', 'Lê Hoài An', 'Cán bộ theo dõi', Role.VIEWER, 'KTHTDT'],
  ] as const;
  const users: Record<string, Awaited<ReturnType<typeof prisma.user.upsert>>> = { admin };
  for (const [username, fullName, position, role, departmentCode] of people) {
    users[username] = await prisma.user.upsert({
      where: { username },
      update: {},
      create: {
        username, passwordHash: demoPassword, fullName, position, email: `${username}@${domain}`, role,
        departmentId: departmentCode ? departmentIds[departmentCode] : null,
      },
    });
  }

  await prisma.systemSetting.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default', defaultYear: YEAR, warningDays: 14, riskThreshold: 70, feedbackFirstResponseDays: 2, feedbackResolutionDays: 10,
      reportAutoApproveDays: 7, proposalAutoApproveDays: 3, explanationDueDays: 3, assignmentStallDays: 3, maxTransfers: 1, wallboardRotateSeconds: 20,
      updatedBy: admin.username,
    },
  });

  // 4. Nạp ba bộ chỉ tiêu từ thư viện mẫu, đúng như trình thiết lập.
  const adminActor = asActor(admin);
  const results = [];
  for (const key of ['hcm-ktxh-2026', 'hcm-dti-xa-2026', 'tt148-cap-xa']) {
    results.push(await applyFrameworkTemplate(prisma as any, adminActor, findFrameworkTemplate(key)!, YEAR));
  }
  if (results.every(result => result.alreadyExisted)) {
    console.log('Dữ liệu mẫu IOC bản 2 đã có sẵn — không tạo lại.');
    return;
  }
  const [ktxh, dti, tt148] = results;
  const frameworkTargets = async (frameworkId: string) => prisma.target.findMany({ where: { frameworkId }, orderBy: { sortOrder: 'asc' } });
  const ktxhTargets = await frameworkTargets(ktxh.frameworkId);
  const byOrdinal = (ordinal: string) => ktxhTargets.find(target => target.ordinal === ordinal)!;

  // Kế hoạch được giao cho phường mẫu + mã chỉ tiêu nội bộ; chỉ tiêu tạo từ đầu năm để thấy chỉ tiêu bị treo.
  for (const target of ktxhTargets) {
    const plan = KTXH_PLAN[target.ordinal ?? ''];
    if (!plan) continue;
    await prisma.target.update({
      where: { id: target.id },
      data: {
        targetValue: plan.value,
        ...(plan.text ? { targetText: plan.text } : {}),
        standardCode: plan.code,
        createdAt: vn('2026-01-20'),
        ...(target.ordinal === '28' ? { direction: TargetDirection.LOWER_IS_BETTER } : {}),
      },
    });
  }

  // 5. Giao chuyên viên phụ trách (trưởng phòng giao từng chỉ tiêu cho từng người).
  const assign = async (ordinal: string, username: string) => {
    const target = byOrdinal(ordinal);
    await prisma.target.update({ where: { id: target.id }, data: { assigneeId: users[username].id, assignedAt: vn('2026-01-25'), assignedById: users['lan.anh'].id } });
    await prisma.workEvent.create({
      data: { targetId: target.id, action: 'ASSIGNED', actorId: users['lan.anh'].id, actorName: users['lan.anh'].fullName, departmentId: target.departmentId, responsibleUserId: users[username].id, note: `Giao ${users[username].fullName} phụ trách`, createdAt: vn('2026-01-25') },
    });
  };
  for (const ordinal of ['2', '3', '17', '18', '20', '21.1']) await assign(ordinal, ordinal === '3' || ordinal === '20' ? 'thao.ktht' : 'staff.ktht');
  for (const ordinal of ['4', '5', '6', '7', '12', '13', '14']) await assign(ordinal, 'staff.vhxh');

  // 6. Báo cáo thực hiện theo kỳ (số giả lập), có nguồn số liệu và minh chứng.
  const report = async (ordinal: string, username: string, entries: [period: string, value: number, valueText: string | null, date: string][], dataSource: string) => {
    let target = await prisma.target.findUniqueOrThrow({ where: { id: byOrdinal(ordinal).id } });
    const reviewer = users['lan.anh'].departmentId === target.departmentId ? users['lan.anh'] : users['manager.vhxh'];
    for (const [periodKey, value, valueText, date] of entries) {
      const update = await prisma.progressUpdate.create({
        data: {
          targetId: target.id, userId: users[username].id, value, valueText, periodKey, dataSource, note: `Báo cáo ${periodKey}`,
          baseVersion: target.version, reviewStatus: ProgressReviewStatus.APPROVED, reviewedBy: reviewer.id, reviewedAt: vn(date, 15), createdAt: vn(date),
        },
      });
      const metric = evaluateTarget({ targetValue: target.targetValue, currentValue: value, direction: target.direction, dueDate: target.dueDate, hasReport: true, kind: target.kind, now: vn(date, 15) });
      target = await prisma.target.update({ where: { id: target.id }, data: { currentValue: value, status: metric.status, lastReportedAt: vn(date, 15), version: { increment: 1 } } });
      await prisma.workEvent.createMany({
        data: [
          { targetId: target.id, action: 'REPORT_SUBMITTED', actorId: users[username].id, actorName: users[username].fullName, departmentId: target.departmentId, note: `${periodKey}: ${valueText ?? value} ${target.unit}`, createdAt: vn(date) },
          { targetId: target.id, action: 'REPORT_APPROVED', actorId: reviewer.id, actorName: reviewer.fullName, departmentId: target.departmentId, note: `${periodKey}: ${valueText ?? value} ${target.unit}`, createdAt: vn(date, 15), metadata: { progressUpdateId: update.id } },
        ],
      });
    }
    return target;
  };
  const budget = await report('2', 'staff.ktht', [
    ['2026-M06', 46, '46% (521 tỷ đồng)', '2026-06-19'],
    ['2026-M07', 54, '54% (612 tỷ đồng)', '2026-07-18'],
    ['2026-M08', 63, '63% (714 tỷ đồng)', '2026-08-20'],
    ['2026-M09', 72, '72% (816 tỷ đồng)', '2026-09-19'],
  ], 'Báo cáo thu ngân sách tháng của Kho bạc Nhà nước khu vực');
  await prisma.target.update({
    where: { id: budget.id },
    data: {
      dataSourceSystem: 'Báo cáo thu ngân sách tháng — hệ thống Kho bạc Nhà nước khu vực',
      dataSourceAgency: 'Kho bạc Nhà nước khu vực; Thuế cơ sở',
      collectionGuide: 'Ngày 15 hằng tháng, liên hệ bộ phận kế toán – Kho bạc lấy báo cáo thu lũy kế; chép số thu lũy kế và tỷ lệ so với dự toán 1.133 tỷ đồng. Chụp màn hình báo cáo làm minh chứng.',
    },
  });
  await report('3', 'thao.ktht', [['2026-M08', 28, '28%', '2026-08-20'], ['2026-M09', 35, '35%', '2026-09-19']], 'Báo cáo giải ngân vốn đầu tư công (hệ thống quản lý đầu tư công)');
  await report('17', 'staff.ktht', [['2026-Q2', 98.6, '98,6%', '2026-06-19'], ['2026-Q3', 99.1, '99,1%', '2026-09-18']], 'Báo cáo cấp nước của đơn vị cấp nước trên địa bàn');
  await report('21.1', 'staff.ktht', [['2026-Q1', 120, '120 cây (Tết trồng cây)', '2026-03-19'], ['2026-Q2', 185, '185 cây', '2026-06-19'], ['2026-Q3', 230, '230 cây', '2026-09-18']], 'Biên bản nghiệm thu trồng cây');
  await report('4', 'staff.vhxh', [['2026-M08', 88, '88%', '2026-08-20'], ['2026-M09', 90.5, '90,5%', '2026-09-19']], 'Số liệu Bảo hiểm xã hội cơ sở');
  await report('12', 'staff.vhxh', [['2026', 96, '96%', '2026-09-30']], 'Kết quả bình xét khu phố văn hóa');

  // Phần 1 — văn bản chỉ đạo điều hành (nhiều văn bản cho một chỉ tiêu).
  const directive = async (ordinal: string, kind: DirectiveKind, docNumber: string, title: string, issuedDate: string, issuer: string) => {
    await prisma.targetDirective.create({
      data: { targetId: byOrdinal(ordinal).id, kind, docNumber, title, issuedDate: vn(issuedDate), issuer, createdById: users['van.thu'].id, createdByName: users['van.thu'].fullName },
    });
  };
  await directive('2', DirectiveKind.QUYET_DINH, '333/QĐ-UBND', 'Giao chỉ tiêu kế hoạch phát triển KT-XH năm 2026', '2026-01-15', 'UBND Thành phố');
  await directive('2', DirectiveKind.KE_HOACH, '18/KH-UBND', 'Kế hoạch thu ngân sách nhà nước năm 2026 trên địa bàn phường', '2026-02-05', 'UBND phường');
  await directive('2', DirectiveKind.THONG_BAO_KET_LUAN, '96/TB-UBND', 'Kết luận giao ban tháng 9: tập trung chống thất thu thuế phi nông nghiệp', '2026-09-08', 'UBND phường');
  await directive('21.1', DirectiveKind.KE_HOACH, '07/KH-UBND', 'Kế hoạch tổ chức "Tết trồng cây đời đời nhớ ơn Bác Hồ" năm 2026', '2026-01-28', 'UBND phường');
  await directive('3', DirectiveKind.QUYET_DINH, '333/QĐ-UBND', 'Giao chỉ tiêu kế hoạch phát triển KT-XH năm 2026', '2026-01-15', 'UBND Thành phố');
  await prisma.evidence.create({
    data: {
      targetId: byOrdinal('21.1').id, kind: EvidenceKind.LINK, title: 'Tin bài Tết trồng cây 2026 trên trang thông tin phường', url: 'https://example.gov.vn/tet-trong-cay-2026',
      note: 'Trồng 120 cây sao, dầu tại công viên và trường học', createdById: users['staff.ktht'].id, createdByName: users['staff.ktht'].fullName, capturedAt: vn('2026-02-20'),
    },
  });

  // Phần 3 — đánh giá: quý II thu ngân sách chưa đạt tiến độ kèm giải trình và biện pháp.
  await prisma.targetEvaluation.create({
    data: {
      targetId: budget.id, periodKey: '2026-Q2', result: EvaluationResult.PARTIAL, score: null,
      note: 'Thu 6 tháng đạt 46% dự toán, thấp hơn tiến độ 50% do thu tiền sử dụng đất chưa phát sinh.',
      correctiveAction: 'Thông báo kết luận 96/TB-UBND: rà soát nợ đọng thuế phi nông nghiệp, đôn đốc thu tiền sử dụng đất quý IV.',
      evaluatedById: users['chu.tich'].id, evaluatedByName: users['chu.tich'].fullName, evaluatedByRole: Role.LEADER, evaluatedAt: vn('2026-07-10'),
    },
  });

  // Yêu cầu giải trình: giải ngân đầu tư công chỉ 35%.
  const disbursement = byOrdinal('3');
  await prisma.explanationRequest.create({
    data: {
      targetId: disbursement.id, requestedById: users['chu.tich'].id, status: ExplanationStatus.OPEN,
      message: 'Giải ngân vốn đầu tư công mới đạt 35%, đề nghị Phòng Kinh tế, Hạ tầng và Đô thị giải trình nguyên nhân và lộ trình đạt 95%.',
      dueAt: vn('2026-10-17', 17), createdAt: vn('2026-10-14', 8),
    },
  });
  await prisma.workEvent.create({
    data: { targetId: disbursement.id, action: 'EXPLANATION_REQUESTED', actorId: users['chu.tich'].id, actorName: users['chu.tich'].fullName, departmentId: disbursement.departmentId, responsibleUserId: users['lan.anh'].id, note: 'Yêu cầu giải trình tiến độ giải ngân', createdAt: vn('2026-10-14', 8) },
  });

  // Báo cáo chờ duyệt đã 10 ngày: bộ giám sát sẽ tự thông qua và ghi trách nhiệm trưởng phòng (GV-03).
  const vaccination = byOrdinal('14');
  await prisma.progressUpdate.create({
    data: {
      targetId: vaccination.id, userId: users['staff.vhxh'].id, value: 92, valueText: '92%', periodKey: '2026-Q3', dataSource: 'Báo cáo tiêm chủng mở rộng của Trạm y tế',
      note: 'Số liệu quý III', baseVersion: vaccination.version, reviewStatus: ProgressReviewStatus.PENDING, createdAt: vn('2026-10-04'),
    },
  });
  await prisma.workEvent.create({
    data: { targetId: vaccination.id, action: 'REPORT_SUBMITTED', actorId: users['staff.vhxh'].id, actorName: users['staff.vhxh'].fullName, departmentId: vaccination.departmentId, responsibleUserId: users['manager.vhxh'].id, note: '2026-Q3: 92% — chờ duyệt', createdAt: vn('2026-10-04') },
  });

  // Việc bị "đá" qua lại: chuyển 1 lần rồi bị trả về trưởng phòng 2 lần (GV-09).
  const labour = byOrdinal('15');
  await prisma.target.update({ where: { id: labour.id }, data: { bounceCount: 3, transferCount: 1, assigneeId: null } });
  await prisma.workEvent.createMany({
    data: [
      { targetId: labour.id, action: 'ASSIGNED', actorId: users['manager.vhxh'].id, actorName: users['manager.vhxh'].fullName, departmentId: labour.departmentId, note: 'Giao Lý Hoàng Nam phụ trách', createdAt: vn('2026-02-02') },
      { targetId: labour.id, action: 'RETURNED', actorId: users['staff.vhxh'].id, actorName: users['staff.vhxh'].fullName, departmentId: labour.departmentId, note: 'Trả lại trưởng phòng. Lý do: số liệu do Trung tâm dịch vụ việc làm quản lý, không phải việc của tôi', createdAt: vn('2026-02-10') },
      { targetId: labour.id, action: 'ESCALATED', actorId: null, actorName: 'Hệ thống IOC', departmentId: labour.departmentId, note: 'Chỉ tiêu đã bị chuyển/trả 3 lần — báo lãnh đạo UBND', createdAt: vn('2026-03-01') },
    ],
  });

  // 7. Đề xuất chỉ tiêu do cán bộ phát hiện (GV-05…GV-07).
  const docNow = new Date();
  await prisma.indicatorCandidate.create({
    data: {
      origin: CandidateOrigin.HUMAN, status: CandidateStatus.SUBMITTED, extractionMethod: ExtractionMethod.RULE_BASED, confidence: 1, humanEdited: true,
      name: 'Tỷ lệ hộ kinh doanh trên địa bàn thanh toán không dùng tiền mặt', unit: '%', targetValue: 80, targetYear: YEAR, frequency: TargetFrequency.QUARTERLY,
      deadline: new Date(Date.UTC(YEAR, 11, 31, 16, 59, 59, 999)), direction: TargetDirection.HIGHER_IS_BETTER, targetKind: FrameworkKind.PLAN,
      responsibleDepartmentId: departmentIds.KTHTDT, frameworkId: ktxh.frameworkId,
      legalBasis: 'Thông báo kết luận giao ban tháng 9/2026', sourceQuote: 'Phấn đấu đến cuối năm 80% hộ kinh doanh thanh toán không dùng tiền mặt',
      proposedById: users['staff.ktht'].id, submittedById: users['staff.ktht'].id, submittedAt: new Date(docNow.getTime() - 2 * 86_400_000),
      autoApproveAt: new Date(docNow.getTime() + 20 * 60 * 60 * 1000),
    },
  });
  await prisma.indicatorCandidate.create({
    data: {
      origin: CandidateOrigin.HUMAN, status: CandidateStatus.REJECTED, extractionMethod: ExtractionMethod.RULE_BASED, confidence: 1, humanEdited: true,
      name: 'Số buổi sinh hoạt câu lạc bộ dưỡng sinh', unit: 'buổi', targetValue: 24, targetYear: YEAR, frequency: TargetFrequency.QUARTERLY,
      deadline: new Date(Date.UTC(YEAR, 11, 31, 16, 59, 59, 999)), responsibleDepartmentId: departmentIds.VHXH, targetKind: FrameworkKind.PLAN,
      proposedById: users['staff.vhxh'].id, submittedById: users['staff.vhxh'].id, submittedAt: vn('2026-09-02'),
      reviewNote: 'Không phải chỉ tiêu cấp trên giao; theo dõi trong kế hoạch hoạt động của Hội Người cao tuổi.', reviewedById: users['manager.vhxh'].id, reviewedAt: vn('2026-09-03'),
    },
  });

  // 8. Kho dữ liệu: chỉ số tự tính cập nhật ngay khi có dữ liệu.
  const datasetId = async (code: string) => (await prisma.dataset.findUniqueOrThrow({ where: { code } })).id;
  const rows = async (code: string, data: Record<string, unknown>[], username: string) => {
    const id = await datasetId(code);
    await prisma.datasetRow.createMany({ data: data.map(row => ({ datasetId: id, data: row as Prisma.InputJsonValue, createdById: users[username].id })) });
    await prisma.dataset.update({ where: { id }, data: { lastDataAt: new Date() } });
  };
  const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09'];
  await rows('ho_so_tthc_thang', months.map((month, index) => {
    const total = 520 + index * 9;
    return {
      thang: `${YEAR}-${month}-01`, tong_ho_so: total,
      nop_truc_tuyen: Math.round(total * (0.71 + index * 0.012)), truc_tuyen_toan_trinh: Math.round(total * (0.58 + index * 0.014)),
      dung_han: Math.round(total * 0.972), co_ket_qua_dien_tu: Math.round(total * (0.9 + index * 0.006)),
      da_so_hoa: Math.round(total * 0.95), thanh_toan_truc_tuyen: Math.round(total * (0.42 + index * 0.01)),
    };
  }), 'staff.ttcc');
  await rows('cuoc_hop_cds', [
    { ten_cuoc_hop: 'Họp Ban Chỉ đạo chuyển đổi số quý I', ngay_hop: `${YEAR}-03-12`, chu_de_chinh: 'Chuyển đổi số', chuc_danh_chu_tri: 'Bí thư', co_bien_ban: true },
    { ten_cuoc_hop: 'Triển khai Đề án 06 và dữ liệu dân cư', ngay_hop: `${YEAR}-04-08`, chu_de_chinh: 'Đề án 06', chuc_danh_chu_tri: 'Chủ tịch', co_bien_ban: true },
    { ten_cuoc_hop: 'Rà soát an toàn thông tin hệ thống', ngay_hop: `${YEAR}-05-20`, chu_de_chinh: 'An toàn thông tin', chuc_danh_chu_tri: 'Phó Chủ tịch', co_bien_ban: true },
    { ten_cuoc_hop: 'Họp Ban Chỉ đạo chuyển đổi số quý II', ngay_hop: `${YEAR}-06-25`, chu_de_chinh: 'Chuyển đổi số', chuc_danh_chu_tri: 'Chủ tịch', co_bien_ban: true },
    { ten_cuoc_hop: 'Bình dân học vụ số tại khu phố', ngay_hop: `${YEAR}-08-14`, chu_de_chinh: 'Chuyển đổi số', chuc_danh_chu_tri: 'Phó Chủ tịch', co_bien_ban: false },
    { ten_cuoc_hop: 'Họp Ban Chỉ đạo chuyển đổi số quý III', ngay_hop: `${YEAR}-09-24`, chu_de_chinh: 'Chuyển đổi số', chuc_danh_chu_tri: 'Bí thư', co_bien_ban: true },
  ], 'van.thu');
  await rows('van_ban_cds', [
    { so_ky_hieu: '12/KH-UBND', ngay_ban_hanh: `${YEAR}-01-30`, nhom_van_ban: 'Kế hoạch thực hiện Nghị quyết 57', chuc_danh_nguoi_ky: 'Chủ tịch', tinh_trang: 'Đã ban hành' },
    { so_ky_hieu: '15/KH-UBND', ngay_ban_hanh: `${YEAR}-02-10`, nhom_van_ban: 'Kế hoạch chuyển đổi số năm', chuc_danh_nguoi_ky: 'Chủ tịch', tinh_trang: 'Đã ban hành' },
    { so_ky_hieu: '210/UBND', ngay_ban_hanh: `${YEAR}-03-18`, nhom_van_ban: 'Chỉ đạo chuyên đề chuyển đổi số', chuc_danh_nguoi_ky: 'Chủ tịch', tinh_trang: 'Đã ban hành' },
    { so_ky_hieu: '388/UBND', ngay_ban_hanh: `${YEAR}-05-06`, nhom_van_ban: 'Chỉ đạo chuyên đề chuyển đổi số', chuc_danh_nguoi_ky: 'Phó Chủ tịch', tinh_trang: 'Đã ban hành' },
    { so_ky_hieu: '402/UBND', ngay_ban_hanh: `${YEAR}-05-21`, nhom_van_ban: 'An toàn thông tin', chuc_danh_nguoi_ky: 'Phó Chủ tịch', tinh_trang: 'Đã ban hành' },
    { so_ky_hieu: 'Dự thảo', ngay_ban_hanh: `${YEAR}-10-01`, nhom_van_ban: 'Chỉ đạo chuyên đề chuyển đổi số', chuc_danh_nguoi_ky: 'Khác', tinh_trang: 'Dự thảo' },
  ], 'van.thu');
  await rows('tin_bai_cds', Array.from({ length: 34 }, (_value, index) => ({
    tieu_de: `Tin chuyển đổi số số ${index + 1}`,
    ngay_dang: `${YEAR}-${String(Math.min(9, 1 + Math.floor(index / 4))).padStart(2, '0')}-${String(3 + (index % 4) * 6).padStart(2, '0')}`,
    kenh_dang_tai: index % 6 === 5 ? 'Mạng xã hội' : 'Cổng/Trang thông tin điện tử',
    url_bai_viet: `https://example.gov.vn/chuyen-doi-so/${index + 1}`,
  })), 'van.thu');
  await rows('bao_cao_dti_quy', [
    { quy: 'Quý I', han_nop: `${YEAR}-03-25`, ngay_nop: `${YEAR}-03-24`, trang_thai: 'Đúng hạn' },
    { quy: 'Quý II', han_nop: `${YEAR}-06-25`, ngay_nop: `${YEAR}-06-23`, trang_thai: 'Đúng hạn' },
    { quy: 'Quý III', han_nop: `${YEAR}-09-25`, ngay_nop: `${YEAR}-09-29`, trang_thai: 'Trễ hạn' },
  ], 'van.thu');
  await rows('tap_huan_ccvc', Array.from({ length: 24 }, (_value, index) => ({
    ho_ten: `Công chức ${String(index + 1).padStart(2, '0')}`,
    chuc_vu: index < 4 ? 'Lãnh đạo' : 'Công chức',
    da_tap_huan: index % 5 !== 4,
    ma_lop: index % 5 !== 4 ? `CDS-${YEAR}-0${1 + (index % 3)}` : null,
  })), 'van.thu');

  // Chỉ số CĐS chấm thủ công (kèm kiểm chứng) — một phần còn để trống để thấy chỉ số thiếu.
  const dtiTargets = await frameworkTargets(dti.frameworkId);
  const scored: Record<string, number> = { '1.1': 2, '2.1': 1, '2.2': 1, '2.4': 1, '3.1': 1, '3.2': 1, '3.3': 2, '4.2': 2, '4.3': 1, '4.4': 1, '5.3': 1, '6.1': 2, '6.10': 2, '7.1': 3, '4.6.1': 1 };
  for (const target of dtiTargets) {
    const value = scored[target.ordinal ?? ''];
    if (value === undefined) continue;
    await prisma.progressUpdate.create({
      data: {
        targetId: target.id, userId: users['van.thu'].id, value, periodKey: periodKeyFor(target.frequency, vn('2026-09-20')), dataSource: 'Tự chấm kèm tài liệu kiểm chứng',
        baseVersion: target.version, reviewStatus: ProgressReviewStatus.APPROVED, reviewedBy: users['chu.tich'].id, reviewedAt: vn('2026-09-22'),
      },
    });
    await prisma.target.update({ where: { id: target.id }, data: { currentValue: value, lastReportedAt: vn('2026-09-22'), version: { increment: 1 } } });
  }

  // Một số chỉ tiêu thống kê TT 148 đã cập nhật (số giả lập).
  const statTargets = await frameworkTargets(tt148.frameworkId);
  const stats: Record<string, number> = { X0102: 61850, X0103: 17420, X0106: 812, X0107: 236, X0210: 1132600, X0303: 14, X0308: 9 };
  for (const target of statTargets) {
    const value = stats[target.standardCode ?? ''];
    if (value === undefined) continue;
    await prisma.progressUpdate.create({
      data: {
        targetId: target.id, userId: users['chanh.vp'].id, value, periodKey: periodKeyFor(target.frequency, vn('2026-09-20')), dataSource: target.dataSourceSystem,
        baseVersion: target.version, reviewStatus: ProgressReviewStatus.APPROVED, reviewedBy: users['chu.tich'].id, reviewedAt: vn('2026-09-25'),
      },
    });
    await prisma.target.update({ where: { id: target.id }, data: { currentValue: value, lastReportedAt: vn('2026-09-25'), version: { increment: 1 } } });
  }

  // 9. Tính lại toàn bộ chỉ số tự tính và tổng hợp nhóm.
  const all = await prisma.target.findMany({ where: { frameworkId: { in: results.map(result => result.frameworkId) } }, select: { id: true, valueSource: true } });
  const vanThu = asActor(users['van.thu']);
  await recomputeTargets(prisma as any, vanThu, { targetIds: all.filter(target => target.valueSource === 'COMPUTED').map(target => target.id) });
  await rollupParents(prisma as any, all.filter(target => target.valueSource === 'CHILDREN').map(target => target.id), vanThu);

  console.log('Đã tạo dữ liệu mẫu IOC bản 2:', results.map(result => `${result.code} (${result.createdTargets} chỉ tiêu)`).join(', '));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
