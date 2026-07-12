import {
  PrismaClient,
  ProgressReviewStatus,
  Role,
  TargetDirection,
  TargetFrequency,
  TargetStatus,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const departments = [
    ['VP', 'Văn phòng HĐND & UBND', '#0f766e'],
    ['KTHTDT', 'Phòng Kinh tế, Hạ tầng & Đô thị', '#2563eb'],
    ['VHXH', 'Phòng Văn hóa - Xã hội', '#7c3aed'],
    ['TTCC', 'Trung tâm Phục vụ hành chính công', '#0891b2'],
    ['CAND', 'Công an phường', '#dc2626'],
    ['MTTQ', 'Ủy ban MTTQ Việt Nam phường', '#d97706'],
  ] as const;
  const departmentIds: Record<string, string> = {};
  for (const [code, name, color] of departments) {
    const department = await prisma.department.upsert({
      where: { code },
      update: { name, color, isActive: true },
      create: { code, name, color },
    });
    departmentIds[code] = department.id;
  }

  const adminPassword = await bcrypt.hash('Admin@123', 10);
  const demoPassword = await bcrypt.hash('Demo@1234', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {
      passwordHash: adminPassword,
      fullName: 'Quản trị hệ thống',
      role: Role.ADMIN,
      departmentId: departmentIds.VP,
      isActive: true,
    },
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      fullName: 'Quản trị hệ thống',
      email: 'admin@tanhung.gov.vn',
      role: Role.ADMIN,
      departmentId: departmentIds.VP,
    },
  });

  const demoUsers = [
    ['lan.anh', 'Nguyễn Lan Anh', 'lan.anh@tanhung.gov.vn', Role.MANAGER, 'KTHTDT'],
    ['staff.ktht', 'Trần Minh Khôi', 'staff.ktht@tanhung.gov.vn', Role.STAFF, 'KTHTDT'],
    ['viewer.ktht', 'Lê Hoài An', 'viewer.ktht@tanhung.gov.vn', Role.VIEWER, 'KTHTDT'],
    ['manager.vhxh', 'Phạm Thu Hương', 'manager.vhxh@tanhung.gov.vn', Role.MANAGER, 'VHXH'],
  ] as const;
  for (const [username, fullName, email, role, departmentCode] of demoUsers) {
    await prisma.user.upsert({
      where: { username },
      update: {
        passwordHash: demoPassword,
        fullName,
        role,
        departmentId: departmentIds[departmentCode],
        isActive: true,
      },
      create: {
        username,
        passwordHash: demoPassword,
        fullName,
        email,
        role,
        departmentId: departmentIds[departmentCode],
      },
    });
  }

  const targets = [
    ['CT-2026-001', 'Tỷ lệ giải quyết hồ sơ đúng hạn', '%', 98, 96.8, 'TTCC', '2026-12-31', TargetStatus.ON_TRACK, 1.3, TargetDirection.HIGHER_IS_BETTER],
    ['CT-2026-002', 'Tổng thu ngân sách nhà nước', 'tỷ đồng', 3453.9, 1977.7, 'KTHTDT', '2026-12-31', TargetStatus.AT_RISK, 1.5, TargetDirection.HIGHER_IS_BETTER],
    ['CT-2026-003', 'Tỷ lệ số hóa hồ sơ, kết quả TTHC', '%', 100, 91, 'TTCC', '2026-09-30', TargetStatus.ON_TRACK, 1.2, TargetDirection.HIGHER_IS_BETTER],
    ['CT-2026-004', 'Công trình đầu tư công hoàn thành', 'công trình', 17, 12, 'KTHTDT', '2026-12-15', TargetStatus.ON_TRACK, 1.4, TargetDirection.HIGHER_IS_BETTER],
    ['CT-2026-005', 'Khu phố đạt chuẩn văn minh đô thị', 'khu phố', 9, 6, 'VHXH', '2026-11-30', TargetStatus.AT_RISK, 1, TargetDirection.HIGHER_IS_BETTER],
    ['CT-2026-006', 'Tỷ lệ người dân tham gia BHYT', '%', 95, 95.2, 'VHXH', '2026-10-31', TargetStatus.COMPLETED, 1.1, TargetDirection.HIGHER_IS_BETTER],
    ['CT-2026-007', 'Giảm số vụ phạm pháp hình sự', 'vụ', 24, 30, 'CAND', '2026-12-31', TargetStatus.AT_RISK, 1.3, TargetDirection.LOWER_IS_BETTER],
    ['CT-2026-008', 'Cuộc giám sát và phản biện xã hội', 'cuộc', 12, 8, 'MTTQ', '2026-12-20', TargetStatus.ON_TRACK, 0.8, TargetDirection.HIGHER_IS_BETTER],
    ['CT-2026-009', 'Văn bản chỉ đạo được xử lý đúng hạn', '%', 100, 100, 'VP', '2026-06-30', TargetStatus.COMPLETED, 1.2, TargetDirection.HIGHER_IS_BETTER],
    ['CT-2026-010', 'Sáng kiến cải cách hành chính áp dụng', 'sáng kiến', 6, 2, 'VP', '2026-12-10', TargetStatus.AT_RISK, 0.9, TargetDirection.HIGHER_IS_BETTER],
  ] as const;

  const publicCodes = new Set([
    'CT-2026-001',
    'CT-2026-002',
    'CT-2026-003',
    'CT-2026-004',
    'CT-2026-006',
    'CT-2026-009',
  ]);

  for (let index = 0; index < targets.length; index += 1) {
    const [code, title, unit, targetValue, currentValue, departmentCode, dueDate, status, weight, direction] = targets[index];
    const isPublic = publicCodes.has(code);
    const lastReportedAt = currentValue > 0 ? new Date('2026-07-12T01:00:00.000Z') : null;
    const targetData = {
      title,
      unit,
      targetValue,
      currentValue,
      departmentId: departmentIds[departmentCode],
      dueDate: new Date(dueDate),
      year: 2026,
      status,
      weight,
      direction,
      frequency: TargetFrequency.YEARLY,
      isPublic,
      isHighlighted: isPublic,
      publicOrder: isPublic ? [...publicCodes].indexOf(code) + 1 : null,
      lastReportedAt,
      publishedValue: isPublic ? currentValue : null,
      publishedTargetValue: isPublic ? targetValue : null,
      publishedDirection: isPublic ? direction : null,
      publishedStatus: isPublic ? status : null,
      publishedAt: isPublic ? lastReportedAt : null,
      publishedBy: isPublic ? admin.id : null,
    };
    await prisma.target.upsert({
      where: { code },
      update: targetData,
      create: { code, ...targetData },
    });
  }

  const first = await prisma.target.findUnique({ where: { code: 'CT-2026-002' } });
  if (first && (await prisma.progressUpdate.count({ where: { targetId: first.id } })) === 0) {
    await prisma.progressUpdate.create({
      data: {
        targetId: first.id,
        userId: admin.id,
        value: 1977.7,
        note: 'Cập nhật lũy kế 6 tháng đầu năm',
        baseVersion: first.version,
        reviewStatus: ProgressReviewStatus.APPROVED,
        reviewedBy: admin.id,
        reviewedAt: new Date('2026-07-12T01:00:00.000Z'),
      },
    });
  }

  await prisma.systemSetting.upsert({
    where: { id: 'default' },
    update: { defaultYear: 2026, warningDays: 14, riskThreshold: 70, updatedBy: admin.id },
    create: { id: 'default', defaultYear: 2026, warningDays: 14, riskThreshold: 70, updatedBy: admin.id },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
