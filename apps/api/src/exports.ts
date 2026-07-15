import { BadRequestException, Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ProgressReviewStatus, Role, TargetStatus } from '@prisma/client';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { audit, getActor, resolveDepartmentScope } from './access';
import { JwtAuthGuard } from './common';
import { evaluateTarget } from './metrics';
import { currentVietnamYear } from './planning-date';
import { PrismaService } from './prisma.service';

const STATUS_LABELS: Record<TargetStatus, string> = {
  NOT_STARTED: 'Chưa bắt đầu',
  ON_TRACK: 'Đúng tiến độ',
  AT_RISK: 'Có rủi ro',
  OVERDUE: 'Quá hạn',
  COMPLETED: 'Hoàn thành',
};

const REVIEW_LABELS: Record<ProgressReviewStatus, string> = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
};

function parseYear(raw?: string) {
  const year = raw ? Number(raw) : currentVietnamYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new BadRequestException('Năm báo cáo không hợp lệ');
  return year;
}

function filePart(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'bao-cao';
}

function sendWorkbook(res: Response, buffer: ExcelJS.Buffer, fileName: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(Buffer.from(buffer as ArrayBuffer));
}

function header(row: ExcelJS.Row, color = 'FF0F766E') {
  row.height = 28;
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF94A3B8' } } };
  });
}

function styleBody(sheet: ExcelJS.Worksheet, firstRow: number) {
  for (let index = firstRow; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    row.height = 22;
    row.eachCell(cell => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } };
    });
  }
}

@Controller('exports')
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(private prisma: PrismaService) {}

  @Get('targets.xlsx')
  async targets(
    @Req() req: any,
    @Res() res: Response,
    @Query('year') yearRaw?: string,
    @Query('departmentId') requestedDepartmentId?: string,
  ) {
    const actor = getActor(req);
    const year = parseYear(yearRaw);
    const departmentId = resolveDepartmentScope(actor, requestedDepartmentId);
    const setting = await this.prisma.systemSetting.findUnique({ where: { id: 'default' } });
    const riskThreshold = setting?.riskThreshold ?? 70;
    const targets = await this.prisma.target.findMany({
      where: { year, isArchived: false, ...(departmentId ? { departmentId } : {}) },
      include: { department: true },
      orderBy: [{ department: { name: 'asc' } }, { code: 'asc' }],
    });
    const evaluations = new Map(targets.map(target => [target.id, evaluateTarget({
      targetValue: target.targetValue,
      currentValue: target.currentValue,
      direction: target.direction,
      dueDate: target.dueDate,
      riskThreshold,
      hasReport: Boolean(target.lastReportedAt),
    })]));
    const weightedTotal = targets.reduce((sum, target) => sum + target.weight, 0);
    const weightedProgress = targets.reduce(
      (sum, target) => sum + (evaluations.get(target.id)!.progress / 100) * target.weight,
      0,
    );
    const history = await this.prisma.progressUpdate.findMany({
      where: {
        target: { year, isArchived: false, ...(departmentId ? { departmentId } : {}) },
        ...(actor.role === Role.STAFF || actor.role === Role.VIEWER
          ? { reviewStatus: ProgressReviewStatus.APPROVED }
          : {}),
      },
      include: { target: { include: { department: true } }, user: { select: { id: true, fullName: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const reviewerIds = [...new Set(history.map(item => item.reviewedBy).filter((id): id is string => Boolean(id)))];
    const reviewers = reviewerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, fullName: true } })
      : [];
    const reviewerMap = new Map(reviewers.map(user => [user.id, user.fullName]));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IOC Lái Thiêu';
    workbook.created = new Date();
    workbook.modified = new Date();

    const summary = workbook.addWorksheet('TONG_HOP', { views: [{ state: 'frozen', ySplit: 8 }] });
    summary.columns = [{ width: 34 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }];
    summary.mergeCells('A1:E1');
    summary.getCell('A1').value = `BÁO CÁO CHỈ TIÊU NĂM ${year}`;
    summary.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF0F4C45' } };
    summary.getCell('A1').alignment = { horizontal: 'center' };
    summary.addRow(['Phạm vi', departmentId ? targets[0]?.department.name ?? 'Phòng ban' : 'Toàn hệ thống']);
    summary.addRow(['Người xuất', `${actor.fullName} (@${actor.username})`]);
    summary.addRow(['Thời điểm xuất', new Date()]);
    summary.addRow(['Tổng chỉ tiêu', targets.length]);
    summary.addRow(['Tiến độ theo trọng số', weightedTotal ? Math.round((weightedProgress / weightedTotal) * 100) / 100 : 0]);
    summary.getCell('B4').numFmt = 'dd/mm/yyyy hh:mm';
    summary.getCell('B6').numFmt = '0%';
    summary.addRow([]);
    summary.addRow(['Phòng ban', 'Tổng chỉ tiêu', 'Hoàn thành', 'Cần tập trung', 'Tiến độ theo trọng số']);
    header(summary.getRow(8));
    const departments = new Map<string, { name: string; total: number; completed: number; risk: number; progress: number; weight: number }>();
    for (const target of targets) {
      const evaluation = evaluations.get(target.id)!;
      const item = departments.get(target.departmentId) ?? { name: target.department.name, total: 0, completed: 0, risk: 0, progress: 0, weight: 0 };
      item.total++;
      item.completed += evaluation.status === TargetStatus.COMPLETED ? 1 : 0;
      item.risk += evaluation.status === TargetStatus.AT_RISK || evaluation.status === TargetStatus.OVERDUE ? 1 : 0;
      item.progress += evaluation.progress * target.weight;
      item.weight += target.weight;
      departments.set(target.departmentId, item);
    }
    for (const item of [...departments.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'))) {
      const row = summary.addRow([item.name, item.total, item.completed, item.risk, item.weight ? item.progress / item.weight / 100 : 0]);
      row.getCell(5).numFmt = '0%';
    }
    styleBody(summary, 9);

    const details = workbook.addWorksheet('CHI_TIET', { views: [{ state: 'frozen', ySplit: 1 }] });
    details.columns = [
      { header: 'STT', width: 8 },
      { header: 'Mã chỉ tiêu', width: 18 },
      { header: 'Tên chỉ tiêu', width: 44 },
      { header: 'Phòng ban', width: 34 },
      { header: 'Mục tiêu', width: 15 },
      { header: 'Thực hiện', width: 15 },
      { header: 'Đơn vị', width: 14 },
      { header: 'Trọng số', width: 12 },
      { header: 'Chiều đánh giá', width: 20 },
      { header: 'Tiến độ', width: 13 },
      { header: 'Trạng thái', width: 18 },
      { header: 'Hạn hoàn thành', width: 18 },
      { header: 'Cập nhật gần nhất', width: 20 },
      { header: 'Phiên bản', width: 12 },
    ];
    header(details.getRow(1));
    targets.forEach((target, index) => {
      const evaluation = evaluations.get(target.id)!;
      const row = details.addRow([
        index + 1,
        target.code,
        target.title,
        target.department.name,
        target.targetValue,
        target.currentValue,
        target.unit,
        target.weight,
        target.direction === 'LOWER_IS_BETTER' ? 'Càng thấp càng tốt' : 'Càng cao càng tốt',
        evaluation.progress / 100,
        STATUS_LABELS[evaluation.status],
        target.dueDate,
        target.lastReportedAt,
        target.version,
      ]);
      row.getCell(5).numFmt = '#,##0.########';
      row.getCell(6).numFmt = '#,##0.########';
      row.getCell(8).numFmt = '0.0#';
      row.getCell(10).numFmt = '0%';
      row.getCell(12).numFmt = 'dd/mm/yyyy';
      row.getCell(13).numFmt = 'dd/mm/yyyy hh:mm';
    });
    details.autoFilter = { from: 'A1', to: 'N1' };
    styleBody(details, 2);

    const log = workbook.addWorksheet('LICH_SU', { views: [{ state: 'frozen', ySplit: 1 }] });
    log.columns = [
      { header: 'STT', width: 8 },
      { header: 'Thời gian', width: 20 },
      { header: 'Mã chỉ tiêu', width: 18 },
      { header: 'Tên chỉ tiêu', width: 40 },
      { header: 'Phòng ban', width: 32 },
      { header: 'Giá trị báo cáo', width: 18 },
      { header: 'Đơn vị', width: 14 },
      { header: 'Người báo cáo', width: 28 },
      { header: 'Trạng thái duyệt', width: 18 },
      { header: 'Người duyệt', width: 28 },
      { header: 'Thời gian duyệt', width: 20 },
      { header: 'Ghi chú', width: 42 },
      { header: 'Ghi chú duyệt', width: 42 },
      { header: 'Phiên bản gốc', width: 15 },
    ];
    header(log.getRow(1), 'FF1D4ED8');
    history.forEach((item, index) => {
      const row = log.addRow([
        index + 1,
        item.createdAt,
        item.target.code,
        item.target.title,
        item.target.department.name,
        item.value,
        item.target.unit,
        `${item.user.fullName} (@${item.user.username})`,
        REVIEW_LABELS[item.reviewStatus],
        item.reviewedBy ? reviewerMap.get(item.reviewedBy) ?? item.reviewedBy : '',
        item.reviewedAt,
        item.note,
        item.reviewNote,
        item.baseVersion,
      ]);
      row.getCell(2).numFmt = 'dd/mm/yyyy hh:mm';
      row.getCell(6).numFmt = '#,##0.########';
      row.getCell(11).numFmt = 'dd/mm/yyyy hh:mm';
    });
    log.autoFilter = { from: 'A1', to: 'N1' };
    styleBody(log, 2);

    await audit(this.prisma, actor, {
      action: 'EXPORT_TARGET_REPORT',
      entityType: 'REPORT_EXPORT',
      departmentId: departmentId ?? null,
      metadata: { year, targetCount: targets.length, historyCount: history.length },
    });
    const scope = departmentId ? targets[0]?.department.code ?? 'phong-ban' : 'toan-phuong';
    return sendWorkbook(res, await workbook.xlsx.writeBuffer(), `Bao_cao_chi_tieu_${filePart(scope)}_${year}.xlsx`);
  }
}
