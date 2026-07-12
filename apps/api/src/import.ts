import { BadRequestException, Controller, Get, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TargetFrequency, TargetStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from './prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from './common';

@Controller('imports') @UseGuards(JwtAuthGuard)
export class ImportController {
  constructor(private prisma: PrismaService) {}
  @Get() list() { return this.prisma.importBatch.findMany({ take: 20, orderBy: { createdAt: 'desc' } }); }
  @Post('targets') @UseGuards(RolesGuard) @Roles('ADMIN', 'MANAGER') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async targets(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) throw new BadRequestException('Vui lòng chọn file Excel');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('File Excel không có trang dữ liệu');
    const headers = (sheet.getRow(1).values as any[]).slice(1).map(v => String(v || '').trim());
    const rows: any[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const item: any = {};
      headers.forEach((header, index) => { item[header] = row.getCell(index + 1).value ?? ''; });
      if (Object.values(item).some(value => value !== '')) rows.push(item);
    });
    const departments = await this.prisma.department.findMany();
    const errors: { row: number; message: string }[] = []; let success = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const code = String(r['Mã chỉ tiêu'] || r.code || '').trim();
        const title = String(r['Tên chỉ tiêu'] || r.title || '').trim();
        const depCode = String(r['Mã phòng ban'] || r.departmentCode || '').trim();
        const dep = departments.find(d => d.code.toLowerCase() === depCode.toLowerCase());
        if (!code || !title || !dep) throw new Error('Thiếu mã, tên chỉ tiêu hoặc mã phòng ban không hợp lệ');
        const targetValue = Number(r['Chỉ tiêu'] || r.targetValue); const currentValue = Number(r['Thực hiện'] || r.currentValue || 0);
        const year = Number(r['Năm'] || r.year || new Date().getFullYear()); const dueDate = new Date(r['Hạn hoàn thành'] || r.dueDate || `${year}-12-31`);
        if (!Number.isFinite(targetValue) || Number.isNaN(+dueDate)) throw new Error('Giá trị chỉ tiêu hoặc hạn hoàn thành không hợp lệ');
        const status = currentValue >= targetValue ? TargetStatus.COMPLETED : TargetStatus.NOT_STARTED;
        await this.prisma.target.upsert({ where: { code }, update: { title, targetValue, currentValue, status, departmentId: dep.id }, create: { code, title, unit: String(r['Đơn vị'] || r.unit || '%'), targetValue, currentValue, status, year, dueDate, departmentId: dep.id, weight: Number(r['Trọng số'] || r.weight || 1), frequency: TargetFrequency.YEARLY } });
        success++;
      } catch (e: any) { errors.push({ row: i + 2, message: e.message }); }
    }
    const batch = await this.prisma.importBatch.create({ data: { fileName: file.originalname, totalRows: rows.length, successRows: success, errorRows: errors.length, errors, createdBy: req.user.username } });
    return batch;
  }
}
