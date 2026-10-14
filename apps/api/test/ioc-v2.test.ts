import assert from 'node:assert/strict';
import test from 'node:test';
import { DepartmentKind, FrameworkKind, Role, TargetFrequency, TargetStatus } from '@prisma/client';
import type { Actor } from '../src/access';
import { canDecideCandidate } from '../src/candidates';
import { validateFormula, type DatasetColumn } from '../src/formula';
import { departmentResolver, departmentRole, summarizeFramework } from '../src/frameworks';
import {
  dueReportPeriods,
  isValidPeriodKey,
  periodKeyFor,
  periodLabel,
  previousPeriodKey,
  reportDeadline,
} from '../src/periods';
import { BUILTIN_DATASETS, DATASET_CATALOG, FRAMEWORK_TEMPLATES, ORG_TEMPLATES } from '../src/templates';

function columnsMap(): Map<string, DatasetColumn[]> {
  const map = new Map<string, DatasetColumn[]>();
  for (const [code, dataset] of Object.entries(DATASET_CATALOG)) map.set(code, dataset.columns);
  for (const [code, dataset] of Object.entries(BUILTIN_DATASETS)) map.set(code, dataset.columns);
  return map;
}

test('mọi công thức trong thư viện bộ chỉ tiêu mẫu đều hợp lệ với cột của bảng dữ liệu', () => {
  const columns = columnsMap();
  for (const template of FRAMEWORK_TEMPLATES) {
    for (const target of template.targets) {
      if (!target.formula) continue;
      const result = validateFormula(target.formula, columns);
      assert.ok(result.ok, `${template.key}/${target.key}: ${result.ok ? '' : result.errors.join('; ')}`);
    }
  }
});

test('khóa chỉ tiêu trong mỗi mẫu là duy nhất và chỉ tiêu con trỏ tới chỉ tiêu cha có thật', () => {
  for (const template of FRAMEWORK_TEMPLATES) {
    const keys = template.targets.map(target => target.key);
    assert.equal(new Set(keys).size, keys.length, `${template.key} trùng khóa`);
    for (const target of template.targets) {
      if (target.parentKey) assert.ok(keys.includes(target.parentKey), `${template.key}/${target.key} trỏ tới cha không tồn tại`);
    }
    for (const dataset of template.datasets ?? []) {
      assert.ok(DATASET_CATALOG[dataset.code], `${template.key} dùng bảng ${dataset.code} chưa khai báo`);
    }
  }
});

test('bộ chỉ số chuyển đổi số cấp xã có đúng 8 nhóm, tổng 100 điểm, điểm con cộng đúng điểm cha', () => {
  const dti = FRAMEWORK_TEMPLATES.find(template => template.key === 'hcm-dti-xa-2026')!;
  const groups = dti.targets.filter(target => !target.parentKey);
  assert.equal(groups.length, 8);
  assert.equal(groups.reduce((sum, group) => sum + (group.maxScore ?? 0), 0), 100);
  for (const parent of dti.targets.filter(target => dti.targets.some(child => child.parentKey === target.key))) {
    const children = dti.targets.filter(child => child.parentKey === parent.key);
    const sum = children.reduce((total, child) => total + (child.maxScore ?? 0), 0);
    assert.equal(sum, parent.maxScore, `Nhóm ${parent.key}: tổng điểm con ${sum} khác điểm tối đa ${parent.maxScore}`);
  }
});

test('thư viện chỉ tiêu thống kê cấp xã TT 148/2026 có đủ 55 mã X0101…X0322 không trùng', () => {
  const tt148 = FRAMEWORK_TEMPLATES.find(template => template.key === 'tt148-cap-xa')!;
  assert.equal(tt148.kind, FrameworkKind.STAT);
  assert.equal(tt148.targets.length, 55);
  const codes = tt148.targets.map(target => target.standardCode!);
  assert.equal(new Set(codes).size, 55);
  assert.ok(codes.every(code => /^X0[123]\d{2}$/.test(code)));
  assert.equal(codes[0], 'X0101');
  assert.equal(codes[54], 'X0322');
});

test('mẫu KT-XH QĐ 333 có 30 chỉ tiêu chính, báo cáo ngày 20, chỉ tiêu cây xanh có hai chỉ tiêu con', () => {
  const ktxh = FRAMEWORK_TEMPLATES.find(template => template.key === 'hcm-ktxh-2026')!;
  const main = ktxh.targets.filter(target => !target.parentKey);
  assert.equal(main.length, 30);
  assert.ok(ktxh.targets.every(target => target.reportDueDay === 20));
  assert.deepEqual(ktxh.targets.filter(target => target.parentKey === '21').map(target => target.key), ['21.1', '21.2']);
});

test('mẫu cơ cấu tổ chức xã và phường khác nhau đúng ở phòng kinh tế', () => {
  assert.ok(ORG_TEMPLATES.PHUONG.departments.some(department => department.code === 'KTHTDT'));
  assert.ok(ORG_TEMPLATES.XA.departments.some(department => department.code === 'KT'));
  for (const template of Object.values(ORG_TEMPLATES)) {
    const codes = template.departments.map(department => department.code);
    assert.equal(new Set(codes).size, codes.length);
  }
});

test('mã kỳ báo cáo theo giờ Việt Nam: tháng, quý, 6 tháng, năm', () => {
  // 31/03/2026 18:00 UTC là 01/04/2026 01:00 giờ Việt Nam → đã sang tháng 4, quý II.
  const date = new Date('2026-03-31T18:00:00Z');
  assert.equal(periodKeyFor(TargetFrequency.MONTHLY, date), '2026-M04');
  assert.equal(periodKeyFor(TargetFrequency.QUARTERLY, date), '2026-Q2');
  assert.equal(periodKeyFor(TargetFrequency.SEMIANNUAL, date), '2026-H1');
  assert.equal(periodKeyFor(TargetFrequency.YEARLY, date), '2026');
  assert.equal(periodLabel('2026-Q3'), 'Quý III/2026');
  assert.equal(periodLabel('2026-M09'), 'Tháng 9/2026');
  assert.equal(previousPeriodKey('2026-M01'), '2025-M12');
  assert.ok(isValidPeriodKey('2026-H2'));
  assert.ok(!isValidPeriodKey('2026-M13'));
});

test('hạn báo cáo là ngày 20 của tháng cuối kỳ theo giờ Việt Nam, kỳ quá hạn được nhận diện', () => {
  assert.equal(reportDeadline('2026-M09', 20)!.toISOString(), '2026-09-20T16:59:59.999Z');
  assert.equal(reportDeadline('2026-Q1', 20)!.toISOString(), '2026-03-20T16:59:59.999Z');
  assert.equal(reportDeadline('2026-M02', 31)!.toISOString(), '2026-02-28T16:59:59.999Z');
  const periods = dueReportPeriods(TargetFrequency.QUARTERLY, 2026, 20, new Date('2026-10-14T03:00:00Z'));
  assert.deepEqual(periods.map(period => [period.key, period.overdue]), [
    ['2026-Q1', true], ['2026-Q2', true], ['2026-Q3', true], ['2026-Q4', false],
  ]);
});

test('phòng chủ trì được ánh xạ theo vai trò, thiếu vai trò thì giao văn phòng', () => {
  const departments = [
    { id: 'vp', code: 'VP', name: 'Văn phòng HĐND và UBND', kind: DepartmentKind.OFFICE, responsibilities: null, isActive: true, sortOrder: 10 },
    { id: 'kt', code: 'PKT', name: 'Phòng Kinh tế', kind: DepartmentKind.SPECIALIZED, responsibilities: null, isActive: true, sortOrder: 20 },
    { id: 'vh', code: 'P3', name: 'Phòng Văn hóa – Xã hội', kind: DepartmentKind.SPECIALIZED, responsibilities: null, isActive: true, sortOrder: 30 },
  ] as any[];
  assert.equal(departmentRole(departments[1]), 'ECONOMY');
  const resolver = departmentResolver(departments);
  assert.equal(resolver.resolve('ECONOMY')!.id, 'kt');
  assert.equal(resolver.resolve('SOCIAL')!.id, 'vh');
  assert.equal(resolver.resolve('POLICE')!.id, 'vp');
  assert.equal(resolver.exact('POLICE'), null);
});

test('tổng hợp bộ chấm điểm cộng điểm các nhóm đã có số liệu', () => {
  const summary = summarizeFramework({ id: 'f', kind: FrameworkKind.SCORE, maxScore: 100 }, [
    { id: 'g1', parentId: null, kind: FrameworkKind.SCORE, status: TargetStatus.ON_TRACK, progress: 75, weight: 1, currentValue: 6, maxScore: 8, hasReport: true, directiveCount: 1, evaluationCount: 0 },
    { id: 'g2', parentId: null, kind: FrameworkKind.SCORE, status: TargetStatus.NOT_STARTED, progress: 0, weight: 1, currentValue: 0, maxScore: 10, hasReport: false, directiveCount: 0, evaluationCount: 0 },
    { id: 'c1', parentId: 'g1', kind: FrameworkKind.SCORE, status: TargetStatus.COMPLETED, progress: 100, weight: 1, currentValue: 2, maxScore: 2, hasReport: true, directiveCount: 0, evaluationCount: 1 },
  ]);
  assert.equal(summary.score, 6);
  assert.equal(summary.maxScore, 100);
  assert.equal(summary.total, 2);
});

function actor(role: Role, departmentId: string | null, id = `${role}-1`): Actor {
  return { id, username: id, fullName: id, role, isActive: true, departmentId, department: departmentId ? { id: departmentId, code: 'X', name: 'X', isActive: true } : null };
}

test('quyền duyệt đề xuất: lãnh đạo UBND duyệt được; trưởng phòng chỉ duyệt đề xuất của phòng mình và không tự duyệt đề xuất của chính mình', () => {
  const proposal = { responsibleDepartmentId: 'kt', proposedById: 'STAFF-1' };
  assert.ok(canDecideCandidate(actor(Role.LEADER, null), proposal));
  assert.ok(canDecideCandidate(actor(Role.MANAGER, 'kt'), proposal));
  assert.ok(!canDecideCandidate(actor(Role.MANAGER, 'vh'), proposal));
  assert.ok(!canDecideCandidate(actor(Role.STAFF, 'kt'), proposal));
  assert.ok(!canDecideCandidate(actor(Role.CLERK, null), proposal));
  assert.ok(!canDecideCandidate(actor(Role.MANAGER, 'kt', 'M-1'), { responsibleDepartmentId: 'kt', proposedById: 'M-1' }));
});
