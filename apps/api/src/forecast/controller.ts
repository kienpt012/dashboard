import { Body, Controller, Get, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import * as ExcelJS from 'exceljs';
import { getActor } from '../access';
import { JwtAuthGuard, Roles, RolesGuard } from '../common';
import { RateLimitService } from '../rate-limit';
import { historyTemplate, readHistoryFile } from './history';
import { assertForecastAdmin, ForecastService } from './service';

export class ForecastQueryDto {
  @IsOptional() @IsString() @MaxLength(4) year?: string;
  @IsOptional() @IsString() @MaxLength(100) departmentId?: string;
  @IsOptional() @IsIn(['mine', 'all']) scope?: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH']) risk?: string;
  @IsOptional() @IsString() @MaxLength(100) frameworkId?: string;
}
export class HistoryUploadDto {
  @IsOptional() @IsIn(['true', 'false']) simulated?: string;
  @IsOptional() @IsString() @MaxLength(200) source?: string;
}
export class TrainForecastDto { @IsOptional() @IsIn(['retrain']) action?: string }
async function sendWorkbook(res: Response, workbook: ExcelJS.Workbook, name: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`); res.setHeader('Cache-Control', 'no-store');
  return res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
}

@Controller('forecast')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ForecastController {
  constructor(private readonly forecast: ForecastService, private readonly rate: RateLimitService) {}
  @Get() list(@Req() req: any, @Query() query: ForecastQueryDto) { return this.forecast.list(getActor(req), query); }
  @Get('model') @Roles('ADMIN', 'LEADER') model(@Req() req: any) { return this.forecast.model(getActor(req)); }
  @Get('targets/:id') target(@Req() req: any, @Param('id') id: string) { return this.forecast.target(getActor(req), id); }
  @Post('train') @Roles('ADMIN', 'LEADER') train(@Req() req: any, @Body() _dto: TrainForecastDto) {
    const actor = getActor(req); assertForecastAdmin(actor);
    this.rate.consume('forecast-train', actor.id, { limit: 3, windowMs: 10 * 60_000 });
    return this.forecast.train(actor);
  }
  @Get('history/template') @Roles('ADMIN', 'LEADER') template(@Req() req: any, @Res() res: Response) {
    assertForecastAdmin(getActor(req)); return sendWorkbook(res, historyTemplate(), 'mau-lich-su-du-bao.xlsx');
  }
  @Post('history') @Roles('ADMIN', 'LEADER')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 2 } }))
  async history(@Req() req: any, @UploadedFile() file: Express.Multer.File, @Body() dto: HistoryUploadDto) {
    const actor = getActor(req); assertForecastAdmin(actor);
    this.rate.consume('forecast-history', actor.id, { limit: 10, windowMs: 10 * 60_000 });
    const simulated = dto.simulated === 'true';
    return this.forecast.importHistory(actor, await readHistoryFile(file), simulated, dto.source?.trim() || (simulated ? 'Dữ liệu mô phỏng do người dùng nhập' : 'Dữ liệu lịch sử do đơn vị cung cấp'));
  }
  @Get('export') async export(@Req() req: any, @Query() query: ForecastQueryDto, @Res() res: Response) {
    const result = await this.forecast.list(getActor(req), query), workbook = new ExcelJS.Workbook(), sheet = workbook.addWorksheet('DU_BAO');
    sheet.addRow(['Tên chỉ tiêu', 'Văn bản giao', 'Phòng chủ trì', 'Mức giao', 'Thực hiện', 'Đơn vị', 'Xác suất không đạt', 'Nguy cơ', 'Dự báo cuối kỳ', 'Cận dưới 95%', 'Cận trên 95%', 'Yếu tố chính', 'Nguồn']);
    for (const item of result.items) sheet.addRow([item.title, item.documentNumber, item.departmentName, item.targetValue, item.currentValue, item.unit, item.probability, item.riskLabel, item.projectedValue, item.interval?.lower, item.interval?.upper, item.factors.join('; '), item.sourceLabel]);
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.columns.forEach((column, index) => { column.width = index === 0 || index >= 11 ? 50 : 22; }); sheet.getColumn(7).numFmt = '0.0%';
    return sendWorkbook(res, workbook, 'du-bao-chi-tieu.xlsx');
  }
}
