import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { FrameworkKind, ProgressReviewStatus, Role, TargetDirection, type Target } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import type { Response } from 'express';
import type { Actor, ActorDepartment } from '../src/access';
import { ExportsController } from '../src/exports';
import type { PrismaService } from '../src/prisma.service';

const departmentA: ActorDepartment = { id: 'dept-a', code: 'VP', name: 'Văn phòng', isActive: true };
const departmentB: ActorDepartment = { id: 'dept-b', code: 'KT', name: 'Kinh tế', isActive: true };
const framework = { id: 'framework-a', code: 'CDS', name: 'Chuyển đổi số' };
const admin: Actor = {
  id: 'admin', username: 'admin', fullName: 'Quản trị viên', role: Role.ADMIN,
  isActive: true, departmentId: null,
};

type TargetFixture = Pick<Target,
  'id' | 'code' | 'title' | 'year' | 'isArchived' | 'frameworkId' | 'parentId' | 'kind'
  | 'departmentId' | 'targetValue' | 'currentValue' | 'weight' | 'direction' | 'dueDate'
  | 'lastReportedAt' | 'unit' | 'version'
> & { department: ActorDepartment };

function target(id: string, overrides: Partial<TargetFixture> = {}): TargetFixture {
  const department = overrides.department ?? departmentA;
  return {
    id, code: `CT-${id}`, title: `Chỉ tiêu ${id}`, year: 2026, isArchived: false,
    frameworkId: framework.id, parentId: null, kind: FrameworkKind.PLAN,
    departmentId: department.id, department, targetValue: 100, currentValue: 80,
    weight: 1, direction: TargetDirection.HIGHER_IS_BETTER,
    dueDate: new Date('2099-12-31T00:00:00Z'), lastReportedAt: new Date('2026-01-01T00:00:00Z'),
    unit: '%', version: 1, ...overrides,
  };
}

function history(targetRow: TargetFixture, reviewStatus: ProgressReviewStatus = ProgressReviewStatus.APPROVED) {
  return {
    targetId: targetRow.id, target: targetRow, createdAt: new Date('2026-01-01T00:00:00Z'),
    value: targetRow.currentValue, user: { id: 'reporter', fullName: 'Người báo cáo', username: 'reporter' },
    reviewStatus, reviewedBy: null, reviewedAt: null, note: '', reviewNote: '', baseVersion: 0,
  };
}

function fixture(targetRows: TargetFixture[], historyRows = targetRows.map(row => history(row))) {
  const calls: { target?: any; history?: any; framework?: any; department: any[]; audits: any[] } = {
    department: [], audits: [],
  };
  const prisma = {
    department: { findUnique: async (args: any) => {
      calls.department.push(args);
      return [departmentA, departmentB].find(row => row.id === args.where.id) ?? null;
    } },
    framework: { findUnique: async (args: any) => {
      calls.framework = args;
      return args.where.id === framework.id ? framework : null;
    } },
    systemSetting: { findUnique: async () => ({ riskThreshold: 70 }) },
    localityProfile: { findUnique: async () => null },
    target: { findMany: async (args: any) => {
      calls.target = args;
      const { where } = args;
      return targetRows.filter(row => row.year === where.year && row.isArchived === where.isArchived
        && (!where.departmentId || row.departmentId === where.departmentId)
        && (where.frameworkId === undefined || row.frameworkId === where.frameworkId));
    } },
    progressUpdate: { findMany: async (args: any) => {
      calls.history = args;
      return historyRows.filter(row => args.where.targetId.in.includes(row.targetId)
        && (!args.where.reviewStatus || args.where.reviewStatus === row.reviewStatus));
    } },
    user: { findMany: async () => [] },
    auditLog: { create: async (args: any) => { calls.audits.push(args.data); } },
  };
  const controller = new ExportsController(prisma as unknown as PrismaService);
  async function exportReport(actor = admin, departmentId?: string, frameworkId?: string) {
    const headers: Record<string, string> = {};
    let output: Buffer | undefined;
    const response = {
      setHeader: (name: string, value: string) => { headers[name] = value; },
      send: (value: Buffer) => { output = value; },
    } as unknown as Response;
    await controller.targets({ user: actor }, response, '2026', departmentId, frameworkId);
    assert.ok(output, 'Phải trả tệp Excel');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output as unknown as ExcelJS.Buffer);
    return { workbook, headers };
  }
  return { calls, exportReport };
}

function departmentSummary(workbook: ExcelJS.Workbook, name: string) {
  const sheet = workbook.getWorksheet('TONG_HOP')!;
  for (let index = 9; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    if (row.getCell(1).value === name) return row;
  }
  assert.fail(`Thiếu dòng tổng hợp ${name}`);
}

test('R20: lịch sử và audit chỉ chứa đúng chỉ tiêu trong bộ hoặc ngoài bộ đã chọn', async () => {
  const selected = target('selected');
  const outside = target('outside', { frameworkId: null });
  const rows = [selected, outside, target('other', { frameworkId: 'framework-b' }),
    target('archived', { isArchived: true }), target('old-year', { year: 2025 })];
  for (const [frameworkId, expected] of [[framework.id, selected], ['none', outside]] as const) {
    const { calls, exportReport } = fixture(rows);
    const { workbook } = await exportReport(admin, undefined, frameworkId);
    assert.deepEqual(calls.target.where, { year: 2026, isArchived: false, frameworkId: frameworkId === 'none' ? null : frameworkId });
    assert.deepEqual(calls.history.where, { targetId: { in: [expected.id] } });
    assert.equal(workbook.getWorksheet('CHI_TIET')!.rowCount, 2);
    assert.equal(workbook.getWorksheet('CHI_TIET')!.getCell('B2').value, expected.code);
    assert.equal(workbook.getWorksheet('LICH_SU')!.rowCount, 2);
    assert.equal(workbook.getWorksheet('LICH_SU')!.getCell('C2').value, expected.code);
    assert.deepEqual(calls.audits[0].metadata, { year: 2026, frameworkId, targetCount: 1, historyCount: 1 });
  }
});

test('R20: STAFF và VIEWER chỉ xuất lịch sử đã duyệt trong bộ và phòng mình', async () => {
  const selected = target('selected');
  const anotherDepartment = target('other-department', { department: departmentB });
  for (const role of [Role.STAFF, Role.VIEWER]) {
    const { calls, exportReport } = fixture([selected, anotherDepartment], [
      history(selected), history(selected, ProgressReviewStatus.PENDING),
      history(selected, ProgressReviewStatus.REJECTED), history(anotherDepartment),
    ]);
    const actor = { ...admin, role, departmentId: departmentA.id, department: departmentA };
    const { workbook } = await exportReport(actor, undefined, framework.id);
    assert.deepEqual(calls.history.where, {
      targetId: { in: [selected.id] }, reviewStatus: ProgressReviewStatus.APPROVED,
    });
    assert.equal(workbook.getWorksheet('LICH_SU')!.rowCount, 2);
    assert.equal(calls.audits[0].metadata.historyCount, 1);
  }
});

test('R21: chỉ tiêu STAT không có mục tiêu, phần trăm, hoàn thành hoặc quá hạn', async () => {
  const { exportReport } = fixture([
    target('reported', { kind: FrameworkKind.STAT, targetValue: 0, currentValue: 42, dueDate: new Date('2000-01-01') }),
    target('unreported', { kind: FrameworkKind.STAT, targetValue: 0, currentValue: 0, lastReportedAt: null, dueDate: new Date('2000-01-01') }),
  ]);
  const { workbook } = await exportReport(admin, undefined, framework.id);
  const summary = workbook.getWorksheet('TONG_HOP')!;
  assert.equal(summary.getCell('B5').value, 2);
  assert.equal(summary.getCell('B6').value, null);
  const department = departmentSummary(workbook, departmentA.name);
  assert.deepEqual([2, 3, 4, 5].map(column => department.getCell(column).value), [2, 0, 0, null]);
  const details = workbook.getWorksheet('CHI_TIET')!;
  for (const row of [2, 3]) {
    assert.equal(details.getCell(`E${row}`).value, null);
    assert.equal(details.getCell(`J${row}`).value, null);
  }
  assert.equal(details.getCell('K2').value, 'Đã có số liệu');
  assert.equal(details.getCell('K3').value, 'Chưa có số liệu');
});

test('R21/R22: tổng hợp đếm lá, dùng trọng số cấp trên cùng và bỏ STAT trong bộ hỗn hợp', async () => {
  const rows = [
    target('root', { currentValue: 20, weight: 2 }),
    target('branch', { parentId: 'root', currentValue: 90, weight: 100 }),
    target('complete', { parentId: 'branch', currentValue: 100, weight: 100 }),
    target('risk', { parentId: 'branch', currentValue: 10, weight: 100 }),
    target('second-root', { currentValue: 80 }),
    target('stat', { kind: FrameworkKind.STAT, targetValue: 0, currentValue: 500, weight: 1000 }),
  ];
  const { exportReport } = fixture(rows);
  const { workbook } = await exportReport(admin, undefined, framework.id);
  const summary = workbook.getWorksheet('TONG_HOP')!;
  assert.equal(summary.getCell('B5').value, 4);
  assert.ok(Math.abs(Number(summary.getCell('B6').value) - 0.4) < 1e-12);
  const department = departmentSummary(workbook, departmentA.name);
  assert.deepEqual([2, 3, 4, 5].map(column => department.getCell(column).value), [4, 1, 1, 0.4]);
  assert.equal(workbook.getWorksheet('CHI_TIET')!.rowCount, rows.length + 1);
});

test('R22: tiến độ phòng lấy nút gốc trong phòng khi chỉ tiêu cha thuộc phòng khác', async () => {
  const rows = [
    target('root-a', { currentValue: 20 }),
    target('branch-b', { parentId: 'root-a', currentValue: 80, department: departmentB }),
    target('leaf-b', { parentId: 'branch-b', currentValue: 20, department: departmentB }),
    target('root-b', { currentValue: 40, department: departmentB }),
  ];
  const { exportReport } = fixture(rows);
  const all = await exportReport(admin, undefined, framework.id);
  assert.equal(all.workbook.getWorksheet('TONG_HOP')!.getCell('B5').value, 2);
  assert.ok(Math.abs(Number(all.workbook.getWorksheet('TONG_HOP')!.getCell('B6').value) - 0.3) < 1e-12);
  const summaryB = departmentSummary(all.workbook, departmentB.name);
  assert.deepEqual([2, 3, 4, 5].map(column => summaryB.getCell(column).value), [2, 0, 2, 0.6]);
  const scoped = await exportReport(admin, departmentB.id, framework.id);
  assert.equal(scoped.workbook.getWorksheet('TONG_HOP')!.getCell('B5').value, 2);
  assert.ok(Math.abs(Number(scoped.workbook.getWorksheet('TONG_HOP')!.getCell('B6').value) - 0.6) < 1e-12);
});

test('R24: bộ rỗng vẫn có tên bộ, tên phòng và mã phòng trong tên tệp', async () => {
  const { calls, exportReport } = fixture([]);
  const actor = { ...admin, role: Role.MANAGER, departmentId: departmentA.id, department: departmentA };
  const { workbook, headers } = await exportReport(actor, undefined, framework.id);
  assert.deepEqual(calls.framework.select, { code: true, name: true });
  assert.equal(calls.department.length, 0, 'Dùng phòng ban trong hồ sơ đã xác thực');
  const summary = workbook.getWorksheet('TONG_HOP')!;
  assert.equal(summary.getCell('A1').value, 'BÁO CÁO CHUYỂN ĐỔI SỐ NĂM 2026');
  assert.equal(summary.getCell('B2').value, departmentA.name);
  assert.equal(summary.getCell('B5').value, 0);
  assert.equal(summary.getCell('B6').value, null);
  assert.equal(workbook.getWorksheet('CHI_TIET')!.rowCount, 1);
  assert.equal(workbook.getWorksheet('LICH_SU')!.rowCount, 1);
  assert.match(headers['Content-Disposition'], /Bao_cao_chi_tieu_CDS_VP_2026\.xlsx/);
});

test('R24: phạm vi phòng được tra độc lập; ngoài bộ và toàn hệ thống có nhãn đúng', async () => {
  const { calls, exportReport } = fixture([]);
  const scoped = await exportReport(admin, departmentB.id, 'none');
  assert.deepEqual(calls.department, [{ where: { id: departmentB.id }, select: { name: true, code: true } }]);
  assert.equal(scoped.workbook.getWorksheet('TONG_HOP')!.getCell('A1').value, 'BÁO CÁO CHỈ TIÊU NGOÀI BỘ NĂM 2026');
  assert.equal(scoped.workbook.getWorksheet('TONG_HOP')!.getCell('B2').value, departmentB.name);
  assert.match(scoped.headers['Content-Disposition'], /Bao_cao_chi_tieu_ngoai-bo_KT_2026\.xlsx/);
  const all = await exportReport();
  assert.equal(all.workbook.getWorksheet('TONG_HOP')!.getCell('A1').value, 'BÁO CÁO CHỈ TIÊU NĂM 2026');
  assert.equal(all.workbook.getWorksheet('TONG_HOP')!.getCell('B2').value, 'Toàn hệ thống');
  assert.match(all.headers['Content-Disposition'], /Bao_cao_chi_tieu_toan-phuong_2026\.xlsx/);
});

test('R24: phòng hoặc bộ không tồn tại trả 404 trước khi xuất và ghi audit', async () => {
  for (const [departmentId, frameworkId, message] of [
    ['missing', framework.id, 'Không tìm thấy phòng ban'],
    [undefined, 'missing', 'Không tìm thấy bộ chỉ tiêu'],
  ]) {
    const { calls, exportReport } = fixture([]);
    await assert.rejects(exportReport(admin, departmentId, frameworkId), error => {
      assert.ok(error instanceof NotFoundException);
      assert.equal(error.getStatus(), 404);
      assert.equal(error.message, message);
      return true;
    });
    assert.equal(calls.target, undefined);
    assert.equal(calls.audits.length, 0);
  }
});
