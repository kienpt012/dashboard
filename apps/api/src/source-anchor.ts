import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { createHash } from 'node:crypto';
import { audit, canSuperviseDepartment, getActor, isGlobalRole, resolveDepartmentScope, type Actor } from './access';
import { JwtAuthGuard } from './common';
import { openPdf } from './document-processing';
import { loadLocality } from './locality';
import { PrismaService } from './prisma.service';
import { pdfPageSpans } from './source-layout';
import { candidatePages, locateText, textLayoutPage, type LayoutPage, type LayoutSpan, type SourceBox } from './source-locator';

// Định vị nguồn: chỉ tiêu nằm ở trang nào, dòng nào của văn bản giao — hệ thống tự tìm cho mọi văn bản (PDF có lớp
// chữ, PDF scan/ảnh qua OCR, DOCX/XLSX theo trang chữ), lưu lại để lần sau mở ngay, và cho người dùng chỉnh tay khi
// tự định vị sai. Đổi tên chỉ tiêu, đổi văn bản hay nâng cách định vị (LOCATOR_VERSION) thì tự định vị lại.

const LOCATOR_VERSION = 4;

const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

class ManualAnchorDto {
  @IsOptional() @IsString() documentId?: string;
  @IsInt() @Min(1) pageNumber!: number;
  @IsOptional() @IsArray() @ArrayMinSize(4) @ArrayMaxSize(4) @IsNumber({}, { each: true }) @Min(0, { each: true }) @Max(1, { each: true })
  box?: number[];
  @IsOptional() @Trim() @IsString() @MaxLength(1000) quote?: string;
}

class LocateDto {
  @Trim() @IsString() @MinLength(6, { message: 'Câu cần tìm quá ngắn' }) @MaxLength(1000) text!: string;
  @IsOptional() @IsInt() @Min(1) pageNumber?: number;
  @IsOptional() @Trim() @IsString() @MaxLength(200) scope?: string;
}

export type AnchorView = {
  pageNumber: number | null;
  box: SourceBox | null;
  matchBox: SourceBox | null;
  quote: string | null;
  score: number | null;
  manual: boolean;
  locatedAt: Date;
};

type Located = { pageNumber: number; box: SourceBox | null; matchBox: SourceBox | null; quote: string; score: number };

const asBox = (value: Prisma.JsonValue | null | undefined): SourceBox | null =>
  Array.isArray(value) && value.length === 4 && value.every(item => typeof item === 'number') ? (value as SourceBox) : null;

const asSpans = (value: Prisma.JsonValue | null | undefined): LayoutSpan[] | null => (Array.isArray(value) ? (value as unknown as LayoutSpan[]) : null);

function formatHint(targetText: string | null, targetValue: number) {
  if (targetText?.trim()) return targetText;
  return Number.isFinite(targetValue) && targetValue ? String(targetValue).replace('.', ',') : undefined;
}

@Injectable()
export class SourceLocatorService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bố cục các trang cần dùng. Văn bản PDF đọc từ trước khi có tính năng này chưa lưu bố cục: tính lại từ tệp gốc
   * (chỉ những trang cần) rồi lưu. Trang OCR cũ không tính lại được nhanh (phải OCR lại) — trả về trang không có khung.
   */
  async layoutPages(documentId: string, pageNumbers: number[]): Promise<{ pages: LayoutPage[]; texts: Map<number, string> }> {
    const rows = await this.prisma.documentPage.findMany({
      where: { documentId, pageNumber: { in: pageNumbers } },
      select: { pageNumber: true, text: true, layout: true, ocrUsed: true },
    });
    const spans = new Map<number, LayoutSpan[]>();
    for (const row of rows) {
      const layout = asSpans(row.layout);
      if (layout) spans.set(row.pageNumber, layout);
    }
    const missing = rows.filter(row => !spans.has(row.pageNumber) && !row.ocrUsed && row.text.trim()).map(row => row.pageNumber);
    if (missing.length) {
      const document = await this.prisma.sourceDocument.findUnique({ where: { id: documentId }, select: { mimeType: true, data: true } });
      if (document?.mimeType === 'application/pdf') {
        const pdf = await openPdf(document.data);
        for (const pageNumber of missing) {
          if (pageNumber > pdf.numPages) continue;
          const layout = await pdfPageSpans(await pdf.getPage(pageNumber));
          spans.set(pageNumber, layout);
          await this.prisma.documentPage.updateMany({ where: { documentId, pageNumber }, data: { layout: layout as unknown as Prisma.InputJsonValue } });
        }
      }
    }
    return {
      pages: rows.filter(row => spans.get(row.pageNumber)?.length).map(row => ({ pageNumber: row.pageNumber, spans: spans.get(row.pageNumber)! })),
      texts: new Map(rows.map(row => [row.pageNumber, row.text])),
    };
  }

  /**
   * Tìm một câu trong văn bản. Văn bản chia phần theo đơn vị (phụ lục giao cho mọi xã, phường) thì chỉ tìm trong phần
   * của đơn vị mình; không thấy trong phần đó thì tìm trên toàn văn bản. Trang có bố cục trả về khung để tô sáng; trang
   * chỉ có chữ trả về trang và câu khớp.
   */
  async locate(documentId: string, query: string, options: { scope?: string; hintPages?: number[]; rowHint?: string } = {}): Promise<Located | null> {
    const pages = await this.prisma.documentPage.findMany({
      where: { documentId },
      select: { pageNumber: true, text: true },
      orderBy: { pageNumber: 'asc' },
    });
    if (!pages.length) return null;
    const scopes = options.scope ? [options.scope, undefined] : [undefined];
    for (const scope of scopes) {
      const pick = candidatePages(pages, query, { scope, hintPages: options.hintPages });
      if (!pick.pages.length) {
        if (pick.scoped || options.hintPages?.length) continue;
        return null;
      }
      const { pages: laidOut, texts } = await this.layoutPages(documentId, pick.pages);
      const found = locateText(laidOut, query, { hintPages: pick.pages, rowHint: options.rowHint });
      if (found) return found;
      // Trang chưa có bố cục (DOCX, XLSX, ảnh cũ): vẫn cho biết trang và câu khớp.
      const plain = pick.pages.filter(pageNumber => !laidOut.some(page => page.pageNumber === pageNumber));
      if (plain.length) {
        const byText = locateText(plain.map(pageNumber => textLayoutPage(pageNumber, texts.get(pageNumber) ?? '')), query, { hintPages: plain, rowHint: options.rowHint });
        if (byText) return { ...byText, box: null, matchBox: null };
      }
      if (!pick.scoped) break;
    }
    // Trang gợi ý (ví dụ trang AI ghi nhận khi trích xuất) có thể lệch: tìm lại trên toàn văn bản.
    if (options.hintPages?.length) return this.locate(documentId, query, { ...options, hintPages: undefined });
    return null;
  }

  private async scopeTerm() {
    const locality = await loadLocality(this.prisma);
    return locality.configured ? locality.shortName?.trim() || locality.name : undefined;
  }

  private async loadTarget(actor: Actor, id: string) {
    const departmentId = resolveDepartmentScope(actor);
    const target = await this.prisma.target.findFirst({
      where: { id, ...(departmentId ? { OR: [{ departmentId }, { coordinators: { some: { departmentId } } }] } : {}) },
      select: {
        id: true,
        title: true,
        targetText: true,
        targetValue: true,
        departmentId: true,
        assigneeId: true,
        sourceDocumentId: true,
        framework: { select: { sourceDocumentId: true } },
        parent: { select: { sourceDocumentId: true, framework: { select: { sourceDocumentId: true } } } },
        sourceCandidate: { select: { documentId: true, pageNumber: true, sourceQuote: true } },
        sourceAnchor: true,
      },
    });
    if (!target) throw new NotFoundException('Không tìm thấy chỉ tiêu');
    return target;
  }

  private view(anchor: { pageNumber: number | null; box: Prisma.JsonValue; matchBox: Prisma.JsonValue; quote: string | null; score: number | null; manual: boolean; updatedAt: Date }): AnchorView {
    return {
      pageNumber: anchor.pageNumber,
      box: asBox(anchor.box),
      matchBox: asBox(anchor.matchBox),
      quote: anchor.quote,
      score: anchor.score,
      manual: anchor.manual,
      locatedAt: anchor.updatedAt,
    };
  }

  /** Văn bản nguồn của chỉ tiêu và vị trí chỉ tiêu trong văn bản đó (tự định vị khi chưa có hoặc đã cũ). */
  async targetSource(actor: Actor, id: string) {
    const target = await this.loadTarget(actor, id);
    const candidate = target.sourceCandidate;
    const documentId =
      target.sourceAnchor?.manual ? target.sourceAnchor.documentId
      : target.sourceDocumentId ?? candidate?.documentId ?? target.framework?.sourceDocumentId ?? target.parent?.sourceDocumentId ?? target.parent?.framework?.sourceDocumentId ?? null;
    if (!documentId) return { status: 'no-document' as const, document: null, anchor: null };
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id: documentId },
      select: { id: true, code: true, title: true, docNumber: true, mimeType: true, pageCount: true, status: true, sha256: true, issuedBy: true, issuedDate: true },
    });
    if (!document) return { status: 'no-document' as const, document: null, anchor: null };
    const { sha256, ...documentView } = document;
    if (target.sourceAnchor?.manual && target.sourceAnchor.documentId === document.id) {
      return { status: 'located' as const, document: documentView, anchor: this.view(target.sourceAnchor) };
    }
    if (document.status !== DocumentStatus.PROCESSED) return { status: 'processing' as const, document: documentView, anchor: null };

    const scope = await this.scopeTerm();
    const rowHint = formatHint(target.targetText, target.targetValue);
    const queries = [...new Set([candidate?.documentId === document.id ? candidate.sourceQuote : '', target.title].map(text => text?.trim()).filter(Boolean) as string[])];
    const queryKey = createHash('sha256')
      .update(JSON.stringify([LOCATOR_VERSION, document.id, sha256, queries, scope ?? '', rowHint ?? '']))
      .digest('hex')
      .slice(0, 32);
    if (target.sourceAnchor && target.sourceAnchor.documentId === document.id && target.sourceAnchor.queryKey === queryKey) {
      const anchor = this.view(target.sourceAnchor);
      return { status: anchor.pageNumber ? ('located' as const) : ('not-found' as const), document: documentView, anchor: anchor.pageNumber ? anchor : null };
    }

    let found: Located | null = null;
    for (const query of queries) {
      const hintPages = candidate?.documentId === document.id && candidate.pageNumber ? [candidate.pageNumber] : undefined;
      found = await this.locate(document.id, query, { scope, hintPages, rowHint });
      if (found) break;
    }
    const data = {
      documentId: document.id,
      pageNumber: found?.pageNumber ?? null,
      box: found?.box ?? Prisma.DbNull,
      matchBox: found?.matchBox ?? Prisma.DbNull,
      quote: found?.quote ?? null,
      score: found?.score ?? null,
      manual: false,
      queryKey,
      updatedById: null,
    };
    const saved = await this.prisma.sourceAnchor.upsert({ where: { targetId: target.id }, create: { targetId: target.id, ...data }, update: data });
    return found
      ? { status: 'located' as const, document: documentView, anchor: this.view(saved) }
      : { status: 'not-found' as const, document: documentView, anchor: null };
  }

  /** Người dùng chỉ đúng chỗ khi hệ thống định vị sai hoặc không tìm thấy. */
  async setManual(actor: Actor, id: string, dto: ManualAnchorDto) {
    const target = await this.loadTarget(actor, id);
    const allowed = isGlobalRole(actor.role) || canSuperviseDepartment(actor, target.departmentId) || target.assigneeId === actor.id;
    if (!allowed) throw new ForbiddenException('Bạn không có quyền chỉnh vị trí nguồn của chỉ tiêu này');
    const documentId = dto.documentId ?? target.sourceAnchor?.documentId ?? target.sourceDocumentId;
    if (!documentId) throw new BadRequestException('Vui lòng chọn văn bản nguồn');
    const document = await this.prisma.sourceDocument.findUnique({ where: { id: documentId }, select: { id: true, pageCount: true } });
    if (!document) throw new BadRequestException('Văn bản nguồn không tồn tại');
    if (document.pageCount && dto.pageNumber > document.pageCount) throw new BadRequestException(`Văn bản chỉ có ${document.pageCount} trang`);
    const box = dto.box ? ([...dto.box] as SourceBox) : null;
    if (box && (box[2] <= box[0] || box[3] <= box[1])) throw new BadRequestException('Khung vị trí không hợp lệ');
    const data = {
      documentId: document.id,
      pageNumber: dto.pageNumber,
      box: box ?? Prisma.DbNull,
      matchBox: box ?? Prisma.DbNull,
      quote: dto.quote || null,
      score: null,
      manual: true,
      queryKey: 'manual',
      updatedById: actor.id,
    };
    return this.prisma.$transaction(async tx => {
      const saved = await tx.sourceAnchor.upsert({ where: { targetId: target.id }, create: { targetId: target.id, ...data }, update: data });
      if (target.sourceDocumentId !== document.id) await tx.target.update({ where: { id: target.id }, data: { sourceDocumentId: document.id } });
      await audit(tx, actor, {
        action: 'TARGET_SOURCE_ANCHORED',
        entityType: 'Target',
        entityId: target.id,
        departmentId: target.departmentId,
        metadata: { documentId: document.id, pageNumber: dto.pageNumber },
      });
      return this.view(saved);
    });
  }

  /** Bỏ vị trí chỉnh tay: lần xem sau hệ thống tự định vị lại. */
  async clearManual(actor: Actor, id: string) {
    const target = await this.loadTarget(actor, id);
    const allowed = isGlobalRole(actor.role) || canSuperviseDepartment(actor, target.departmentId) || target.assigneeId === actor.id;
    if (!allowed) throw new ForbiddenException('Bạn không có quyền chỉnh vị trí nguồn của chỉ tiêu này');
    await this.prisma.sourceAnchor.deleteMany({ where: { targetId: target.id } });
    return { ok: true };
  }
}

@Controller()
@UseGuards(JwtAuthGuard)
export class SourceAnchorController {
  constructor(
    private readonly locator: SourceLocatorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('targets/:id/source')
  source(@Req() req: any, @Param('id') id: string) {
    return this.locator.targetSource(getActor(req), id);
  }

  @Put('targets/:id/source')
  setManual(@Req() req: any, @Param('id') id: string, @Body() dto: ManualAnchorDto) {
    return this.locator.setManual(getActor(req), id, dto);
  }

  @Delete('targets/:id/source')
  clearManual(@Req() req: any, @Param('id') id: string) {
    return this.locator.clearManual(getActor(req), id);
  }

  /** Bố cục chữ một trang (khung từng dòng) — giao diện dùng để người dùng chọn dòng khi chỉnh vị trí nguồn. */
  @Get('documents/:id/pages/:page/layout')
  async layout(@Req() req: any, @Param('id') id: string, @Param('page', ParseIntPipe) pageNumber: number) {
    getActor(req);
    const exists = await this.prisma.documentPage.findUnique({ where: { documentId_pageNumber: { documentId: id, pageNumber } }, select: { ocrUsed: true } });
    if (!exists) throw new NotFoundException('Không có trang này trong văn bản');
    const { pages } = await this.locator.layoutPages(id, [pageNumber]);
    return { pageNumber, ocrUsed: exists.ocrUsed, spans: pages[0]?.spans ?? [] };
  }

  /** Tìm một câu bất kỳ trong văn bản (đề xuất trích xuất, trích dẫn) — trả về trang và khung để tô sáng. */
  @Post('documents/:id/locate')
  async locate(@Req() req: any, @Param('id') id: string, @Body() dto: LocateDto, @Query('scope') scopeQuery?: string) {
    getActor(req);
    const document = await this.prisma.sourceDocument.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!document) throw new NotFoundException('Không tìm thấy tài liệu');
    if (document.status !== DocumentStatus.PROCESSED) return { location: null };
    const location = await this.locator.locate(id, dto.text, { hintPages: dto.pageNumber ? [dto.pageNumber] : undefined, scope: dto.scope ?? scopeQuery });
    return { location };
  }
}
