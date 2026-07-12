import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportBatchStatus, ProgressReviewStatus, Role } from '@prisma/client';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { audit, assertDepartmentAccess, getActor, resolveDepartmentScope } from './access';
import { JwtAuthGuard, Roles, RolesGuard } from './common';
import { evaluateTarget } from './metrics';
import { PrismaService } from './prisma.service';

const TEMPLATE_VERSION = 'IOC_PROGRESS_V1';
const DATA_SHEET = 'CAP_NHAT';
const META_SHEET = 'META';
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const HEADERS = [
  'ID hệ thống',
  'Mã chỉ tiêu',
  'Tên chỉ tiêu',
  'Phòng ban',
  'Mục tiêu',
  'Giá trị hiện tại',
  'Đơn vị',
  'Phiên bản',
  'Giá trị mới',
  'Ghi chú',
] as const;

type RowError = { row: number; code: string; field?: string; message: string };
type PreviewChange = {
  row: number;
  targetId: string;
  code: string;
  departmentId: string;
  baseVersion: number;
  oldValue: number;
  newValue: number;
  note: string | null;
};

function safeFileName(value: string) {
  return value.replace(/[\r\n"\\/:*?<>|]+/g, '_').slice(0, 160) || 'du-lieu.xlsx';
}

function sendWorkbook(res: Response, buffer: ExcelJS.Buffer, fileName: string) {
  const safe = safeFileName(fileName);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`);
  res.setHeader('Cache-Control', 'no-store');
  return res.send(Buffer.from(buffer as ArrayBuffer));
}

function parseYear(raw?: string) {
  if (!raw) return new Date().getFullYear();
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 2000 || value > 2200) {
    throw new BadRequestException('Năm báo cáo không hợp lệ');
  }
  return value;
}

function primitiveText(cell: ExcelJS.Cell, field: string) {
  const value = cell.value as any;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    throw new Error(`${field} không được chứa công thức hoặc dữ liệu đặc biệt`);
  }
  return String(value).trim();
}

function optionalText(cell: ExcelJS.Cell, field: string) {
  const text = primitiveText(cell, field);
  return text || null;
}

function numberCell(cell: ExcelJS.Cell, field: string, allowBlank = false) {
  const value = cell.value as any;
  if (value === null || value === undefined || value === '') {
    if (allowBlank) return null;
    throw new Error(`${field} không được để trống`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${field} phải là ô kiểu số, không dùng công thức hoặc chuỗi định dạng`);
  }
  return value;
}

function near(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(1, Math.abs(a), Math.abs(b)) * 1e-10;
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 28;
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };
  });
}

function readMeta(workbook: ExcelJS.Workbook) {
  const sheet = workbook.getWorksheet(META_SHEET);
  if (!sheet) throw new BadRequestException('File không phải biểu mẫu cập nhật do hệ thống phát hành');
  const meta = new Map<string, string>();
  sheet.eachRow(row => {
    const key = String(row.getCell(1).value ?? '').trim();
    const value = String(row.getCell(2).value ?? '').trim();
    if (key) meta.set(key, value);
  });
  if (meta.get('schemaVersion') !== TEMPLATE_VERSION) {
    throw new BadRequestException('Biểu mẫu đã cũ hoặc không đúng phiên bản; vui lòng tải biểu mẫu mới');
  }
  return meta;
}

function validateWorkbookFile(file?: Express.Multer.File) {
  if (!file) throw new BadRequestException('Vui lòng chọn file Excel');
  if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
    throw new BadRequestException('Chỉ hỗ trợ file Excel định dạng .xlsx');
  }
  if (file.size > MAX_FILE_SIZE) throw new BadRequestException('File Excel vượt quá dung lượng 5MB');
  if (file.buffer.length < 4 || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
    throw new BadRequestException('Nội dung file không phải định dạng Excel .xlsx hợp lệ');
  }
  return file;
}

@Controller('imports')
@UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  async list(@Req() req: any, @Query('departmentId') requestedDepartmentId?: string) {
    const actor = getActor(req);
    const departmentId = resolveDepartmentScope(actor, requestedDepartmentId);
    return this.prisma.importBatch.findMany({
      where: departmentId ? { departmentId } : undefined,
      include: { department: { select: { id: true, code: true, name: true } } },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get('template')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  async template(
    @Req() req: any,
    @Res() res: Response,
    @Query('year') yearRaw?: string,
    @Query('departmentId') requestedDepartmentId?: string,
  ) {
    const actor = getActor(req);
    const year = parseYear(yearRaw);
    const departmentId = resolveDepartmentScope(actor, requestedDepartmentId);
    const targets = await this.prisma.target.findMany({
      where: { year, ...(departmentId ? { departmentId } : {}), department: { isActive: true } },
      include: { department: true },
      orderBy: [{ department: { name: 'asc' } }, { code: 'asc' }],
    });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IOC Tân Hưng';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet(DATA_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: HEADERS[0], key: 'id', width: 24, hidden: true },
      { header: HEADERS[1], key: 'code', width: 18 },
      { header: HEADERS[2], key: 'title', width: 44 },
      { header: HEADERS[3], key: 'department', width: 34 },
      { header: HEADERS[4], key: 'target', width: 15 },
      { header: HEADERS[5], key: 'current', width: 18 },
      { header: HEADERS[6], key: 'unit', width: 14 },
      { header: HEADERS[7], key: 'version', width: 12, hidden: true },
      { header: HEADERS[8], key: 'newValue', width: 18 },
      { header: HEADERS[9], key: 'note', width: 42 },
    ];
    styleHeader(sheet.getRow(1));
    for (const target of targets) {
      const row = sheet.addRow({
        id: target.id,
        code: target.code,
        title: target.title,
        department: target.department.name,
        target: target.targetValue,
        current: target.currentValue,
        unit: target.unit,
        version: target.version,
        newValue: null,
        note: null,
      });
      row.height = 24;
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        cell.alignment = { vertical: 'middle', wrapText: column === 3 || column === 4 || column === 10 };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } } };
        cell.protection = { locked: column !== 9 && column !== 10 };
      });
      for (const column of [9, 10]) {
        row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } };
      }
      row.getCell(9).dataValidation = {
        type: 'decimal',
        operator: 'greaterThanOrEqual',
        allowBlank: true,
        formulae: [0],
        showErrorMessage: true,
        errorTitle: 'Giá trị không hợp lệ',
        error: 'Vui lòng nhập một giá trị số không âm.',
      };
      row.getCell(5).numFmt = '#,##0.########';
      row.getCell(6).numFmt = '#,##0.########';
      row.getCell(9).numFmt = '#,##0.########';
    }
    sheet.autoFilter = { from: 'B1', to: 'J1' };
    await sheet.protect('ioc-tan-hung', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      insertRows: false,
      deleteRows: false,
    });

    const meta = workbook.addWorksheet(META_SHEET, { state: 'veryHidden' });
    meta.addRows([
      ['schemaVersion', TEMPLATE_VERSION],
      ['departmentId', departmentId ?? 'ALL'],
      ['year', year],
      ['generatedAt', new Date().toISOString()],
      ['generatedBy', actor.username],
    ]);
    await audit(this.prisma, actor, {
      action: 'EXPORT_PROGRESS_TEMPLATE',
      entityType: 'IMPORT_TEMPLATE',
      departmentId: departmentId ?? null,
      metadata: { year, targetCount: targets.length },
    });
    const scopeName = departmentId ? targets[0]?.department.code ?? 'phong-ban' : 'toan-phuong';
    return sendWorkbook(res, await workbook.xlsx.writeBuffer(), `Phieu_cap_nhat_${scopeName}_${year}.xlsx`);
  }

  @Post('targets/preview')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE, files: 1 } }))
  async preview(@UploadedFile() uploaded: Express.Multer.File, @Req() req: any) {
    const file = validateWorkbookFile(uploaded);
    const actor = getActor(req);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer as any);
    } catch {
      throw new BadRequestException('Không thể đọc file .xlsx; file có thể bị hỏng hoặc sai định dạng');
    }
    const meta = readMeta(workbook);
    const metaDepartmentId = meta.get('departmentId');
    const requestedDepartmentId = metaDepartmentId && metaDepartmentId !== 'ALL' ? metaDepartmentId : undefined;
    const departmentId = resolveDepartmentScope(actor, requestedDepartmentId);
    const metaYear = Number(meta.get('year'));
    if (!Number.isInteger(metaYear)) throw new BadRequestException('Năm báo cáo trong biểu mẫu không hợp lệ');

    const sheet = workbook.getWorksheet(DATA_SHEET);
    if (!sheet) throw new BadRequestException(`Không tìm thấy trang dữ liệu ${DATA_SHEET}`);
    const actualHeaders = HEADERS.map((_, index) => String(sheet.getRow(1).getCell(index + 1).value ?? '').trim());
    if (actualHeaders.some((header, index) => header !== HEADERS[index])) {
      throw new BadRequestException('Cấu trúc cột đã bị thay đổi; vui lòng dùng biểu mẫu mới tải từ hệ thống');
    }
    if (sheet.actualRowCount - 1 > MAX_ROWS) throw new BadRequestException(`File vượt quá giới hạn ${MAX_ROWS} dòng`);

    const rawRows: Array<{
      row: number;
      targetId: string;
      code: string;
      title: string;
      department: string;
      targetValue: number | null;
      currentValue: number | null;
      unit: string;
      baseVersion: number | null;
      newValue: number | null;
      note: string | null;
      errors: RowError[];
    }> = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const errors: RowError[] = [];
      const read = <T>(field: string, reader: () => T, fallback: T): T => {
        try { return reader(); }
        catch (error: any) {
          errors.push({ row: rowNumber, code: 'INVALID_CELL', field, message: error.message });
          return fallback;
        }
      };
      const targetId = read('ID hệ thống', () => primitiveText(row.getCell(1), 'ID hệ thống'), '');
      const code = read('Mã chỉ tiêu', () => primitiveText(row.getCell(2), 'Mã chỉ tiêu'), '');
      const title = read('Tên chỉ tiêu', () => primitiveText(row.getCell(3), 'Tên chỉ tiêu'), '');
      const department = read('Phòng ban', () => primitiveText(row.getCell(4), 'Phòng ban'), '');
      const targetValue = read<number | null>('Mục tiêu', () => numberCell(row.getCell(5), 'Mục tiêu'), null);
      const currentValue = read<number | null>('Giá trị hiện tại', () => numberCell(row.getCell(6), 'Giá trị hiện tại'), null);
      const unit = read('Đơn vị', () => primitiveText(row.getCell(7), 'Đơn vị'), '');
      const baseVersion = read<number | null>('Phiên bản', () => numberCell(row.getCell(8), 'Phiên bản'), null);
      const newValue = read<number | null>('Giá trị mới', () => numberCell(row.getCell(9), 'Giá trị mới', true), null);
      const note = read<string | null>('Ghi chú', () => optionalText(row.getCell(10), 'Ghi chú'), null);
      if (!targetId && !code && newValue === null && !note) return;
      rawRows.push({ row: rowNumber, targetId, code, title, department, targetValue, currentValue, unit, baseVersion, newValue, note, errors });
    });

    const ids = [...new Set(rawRows.map(row => row.targetId).filter(Boolean))];
    const targets = await this.prisma.target.findMany({ where: { id: { in: ids } }, include: { department: true } });
    const targetMap = new Map(targets.map(target => [target.id, target]));
    const firstOccurrence = new Map<string, number>();
    const errors: RowError[] = [];
    const changes: PreviewChange[] = [];
    let unchangedRows = 0;

    for (const row of rawRows) {
      errors.push(...row.errors);
      if (!row.targetId) {
        errors.push({ row: row.row, code: 'MISSING_TARGET_ID', field: 'ID hệ thống', message: 'Thiếu định danh chỉ tiêu của hệ thống' });
        continue;
      }
      const duplicateAt = firstOccurrence.get(row.targetId);
      if (duplicateAt) {
        errors.push({ row: row.row, code: 'DUPLICATE_ROW', field: 'ID hệ thống', message: `Chỉ tiêu đã xuất hiện tại dòng ${duplicateAt}` });
        continue;
      }
      firstOccurrence.set(row.targetId, row.row);
      const target = targetMap.get(row.targetId);
      if (!target) {
        errors.push({ row: row.row, code: 'UNKNOWN_TARGET', field: 'ID hệ thống', message: 'Không tìm thấy chỉ tiêu trong hệ thống' });
        continue;
      }
      try {
        assertDepartmentAccess(actor, target.departmentId);
      } catch {
        errors.push({ row: row.row, code: 'OUT_OF_SCOPE', field: 'Phòng ban', message: 'Chỉ tiêu không thuộc phạm vi phòng ban được phép báo cáo' });
        continue;
      }
      if (departmentId && target.departmentId !== departmentId) {
        errors.push({ row: row.row, code: 'OUT_OF_SCOPE', field: 'Phòng ban', message: 'Chỉ tiêu không thuộc biểu mẫu phòng ban này' });
      }
      if (target.year !== metaYear) {
        errors.push({ row: row.row, code: 'WRONG_YEAR', message: 'Chỉ tiêu không thuộc năm báo cáo của biểu mẫu' });
      }
      if (row.code !== target.code) {
        errors.push({ row: row.row, code: 'CODE_MISMATCH', field: 'Mã chỉ tiêu', message: 'Mã chỉ tiêu đã bị thay đổi' });
      }
      if (row.newValue === null) {
        if (row.note) errors.push({ row: row.row, code: 'VALUE_REQUIRED', field: 'Giá trị mới', message: 'Có ghi chú nhưng chưa nhập giá trị mới' });
        else unchangedRows++;
        continue;
      }
      if (row.title !== target.title || row.department !== target.department.name || row.unit !== target.unit || row.targetValue === null || !near(row.targetValue, target.targetValue) || row.currentValue === null || !near(row.currentValue, target.currentValue)) {
        errors.push({ row: row.row, code: 'LOCKED_DATA_CHANGED', message: 'Thông tin khóa hoặc giá trị hiện tại trong biểu mẫu đã bị thay đổi' });
      }
      if (!Number.isInteger(row.baseVersion) || row.baseVersion !== target.version) {
        errors.push({ row: row.row, code: 'STALE_VERSION', field: 'Phiên bản', message: `Dữ liệu đã thay đổi (file: ${row.baseVersion ?? 'không có'}, hệ thống: ${target.version}); hãy tải biểu mẫu mới` });
      }
      if (row.newValue < 0) {
        errors.push({ row: row.row, code: 'INVALID_VALUE', field: 'Giá trị mới', message: 'Giá trị mới không được âm' });
      }
      if (!errors.some(error => error.row === row.row)) {
        if (near(row.newValue, target.currentValue) && !row.note) unchangedRows++;
        else changes.push({
          row: row.row,
          targetId: target.id,
          code: target.code,
          departmentId: target.departmentId,
          baseVersion: target.version,
          oldValue: target.currentValue,
          newValue: row.newValue,
          note: row.note,
        });
      }
    }

    const errorRows = new Set(errors.map(error => error.row)).size;
    const batch = await this.prisma.$transaction(async tx => {
      const created = await tx.importBatch.create({
        data: {
          fileName: safeFileName(file.originalname),
          totalRows: rawRows.length,
          successRows: changes.length,
          errorRows,
          errors: errors as any,
          changes: changes as any,
          createdBy: actor.username,
          departmentId: departmentId ?? null,
          status: ImportBatchStatus.PREVIEWED,
        },
        include: { department: { select: { id: true, code: true, name: true } } },
      });
      await audit(tx, actor, {
        action: 'PREVIEW_EXCEL_IMPORT',
        entityType: 'IMPORT_BATCH',
        entityId: created.id,
        departmentId: departmentId ?? null,
        metadata: { totalRows: rawRows.length, changedRows: changes.length, unchangedRows, errorRows },
      });
      return created;
    });
    return {
      ...batch,
      summary: { totalRows: rawRows.length, changedRows: changes.length, unchangedRows, errorRows },
      canApply: errorRows === 0 && changes.length > 0,
    };
  }

  @Post(':id/apply')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'STAFF')
  async apply(@Param('id') id: string, @Req() req: any) {
    const actor = getActor(req);
    const existing = await this.prisma.importBatch.findUnique({ where: { id } });
    if (!existing) throw new BadRequestException('Không tìm thấy lần import');
    if (existing.departmentId) assertDepartmentAccess(actor, existing.departmentId);
    else if (actor.role !== Role.ADMIN) throw new ConflictException('Chỉ quản trị viên được áp dụng file nhiều phòng ban');
    if (actor.role !== Role.ADMIN && existing.createdBy !== actor.username) {
      throw new ForbiddenException('Bạn chỉ được áp dụng file do chính mình thực hiện xem trước');
    }
    if (existing.status === ImportBatchStatus.APPLIED) return { ...existing, idempotent: true };
    if (existing.status !== ImportBatchStatus.PREVIEWED) throw new ConflictException('Lần import không còn ở trạng thái chờ áp dụng');
    if (existing.errorRows > 0) throw new ConflictException('File còn lỗi; vui lòng sửa và thực hiện xem trước lại');
    const changes = Array.isArray(existing.changes) ? existing.changes as unknown as PreviewChange[] : [];
    if (!changes.length) throw new ConflictException('Không có thay đổi hợp lệ để áp dụng');

    try {
      return await this.prisma.$transaction(async tx => {
        const claim = await tx.importBatch.updateMany({
          where: { id, status: ImportBatchStatus.PREVIEWED },
          data: { status: ImportBatchStatus.FAILED },
        });
        if (claim.count !== 1) {
          const current = await tx.importBatch.findUnique({ where: { id } });
          if (current?.status === ImportBatchStatus.APPLIED) return { ...current, idempotent: true };
          throw new ConflictException('Lần import đang được xử lý hoặc không còn hợp lệ');
        }

        const targets = await tx.target.findMany({ where: { id: { in: changes.map(change => change.targetId) } } });
        const targetMap = new Map(targets.map(target => [target.id, target]));
        const conflicts: RowError[] = [];
        for (const change of changes) {
          const target = targetMap.get(change.targetId);
          if (!target || target.code !== change.code || target.departmentId !== change.departmentId) {
            conflicts.push({ row: change.row, code: 'TARGET_CHANGED', message: 'Chỉ tiêu không còn khớp với dữ liệu đã xem trước' });
            continue;
          }
          try { assertDepartmentAccess(actor, target.departmentId); }
          catch { conflicts.push({ row: change.row, code: 'OUT_OF_SCOPE', message: 'Chỉ tiêu nằm ngoài phạm vi được phép' }); }
          if (target.version !== change.baseVersion || !near(target.currentValue, change.oldValue)) {
            conflicts.push({ row: change.row, code: 'STALE_VERSION', message: `Dữ liệu ${target.code} đã được người khác cập nhật; hãy tải biểu mẫu mới` });
          }
        }
        if (conflicts.length) throw new ConflictException({ message: 'Dữ liệu đã thay đổi sau bước xem trước', errors: conflicts });

        const approved = actor.role === Role.ADMIN;
        if (!approved) {
          const pending = await tx.progressUpdate.findMany({
            where: {
              userId: actor.id,
              targetId: { in: changes.map(change => change.targetId) },
              reviewStatus: ProgressReviewStatus.PENDING,
            },
            include: { target: { select: { code: true } } },
          });
          if (pending.length) {
            throw new ConflictException(`Bạn đã có báo cáo đang chờ duyệt cho: ${pending.map(item => item.target.code).join(', ')}`);
          }
        }
        const appliedAt = new Date();
        const setting = approved ? await tx.systemSetting.findUnique({ where: { id: 'default' } }) : null;
        for (const change of changes) {
          const target = targetMap.get(change.targetId)!;
          await tx.progressUpdate.create({
            data: {
              targetId: target.id,
              userId: actor.id,
              value: change.newValue,
              note: change.note,
              reviewStatus: approved ? ProgressReviewStatus.APPROVED : ProgressReviewStatus.PENDING,
              baseVersion: change.baseVersion,
              reviewedBy: approved ? actor.id : null,
              reviewedAt: approved ? appliedAt : null,
            },
          });
          if (approved) {
            const evaluation = evaluateTarget({
              targetValue: target.targetValue,
              currentValue: change.newValue,
              direction: target.direction,
              dueDate: target.dueDate,
              riskThreshold: setting?.riskThreshold ?? 70,
              now: appliedAt,
              hasReport: true,
            });
            const updated = await tx.target.updateMany({
              where: { id: target.id, version: change.baseVersion },
              data: {
                currentValue: change.newValue,
                status: evaluation.status,
                lastReportedAt: appliedAt,
                version: { increment: 1 },
              },
            });
            if (updated.count !== 1) throw new ConflictException(`Chỉ tiêu ${target.code} vừa được cập nhật bởi người khác`);
          }
        }
        const batch = await tx.importBatch.update({
          where: { id },
          data: { status: ImportBatchStatus.APPLIED, appliedAt },
          include: { department: { select: { id: true, code: true, name: true } } },
        });
        await audit(tx, actor, {
          action: approved ? 'APPLY_EXCEL_IMPORT' : 'SUBMIT_EXCEL_IMPORT_FOR_REVIEW',
          entityType: 'IMPORT_BATCH',
          entityId: id,
          departmentId: batch.departmentId,
          metadata: { changedRows: changes.length, reviewStatus: approved ? 'APPROVED' : 'PENDING' },
        });
        return { ...batch, reviewStatus: approved ? ProgressReviewStatus.APPROVED : ProgressReviewStatus.PENDING, idempotent: false };
      }, { isolationLevel: 'Serializable' });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException('Một hoặc nhiều chỉ tiêu đã có báo cáo đang chờ duyệt');
      }
      if (error?.code === 'P2034') {
        const latest = await this.prisma.importBatch.findUnique({ where: { id } });
        if (latest?.status === ImportBatchStatus.APPLIED) return { ...latest, idempotent: true };
        throw new ConflictException('Có cập nhật đồng thời; vui lòng thử lại');
      }
      throw error;
    }
  }
}
