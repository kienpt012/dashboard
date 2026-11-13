import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { mergeMap } from 'rxjs';
import { docRef, DOC_REF_INCLUDE } from './doc-ref';
import { PrismaService } from './prisma.service';

/** Chỉ bổ sung tham chiếu cho chỉ tiêu đã được controller cho phép trả về.
 * Một truy vấn theo tập ID; không mở rộng danh sách hoặc trả nội dung văn bản.
 * Trang công khai dùng snapshot riêng, tuyệt đối không lấy tham chiếu nội bộ hiện tại.
 */
export async function attachDocRefs(prisma: Pick<PrismaService, 'target'>, data: unknown) {
  const nodes: { row: Record<string, any>; id: string }[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const row = value as Record<string, any>;
    const id = typeof row.targetId === 'string' ? row.targetId : typeof row.id === 'string' && ((typeof row.code === 'string' && ('title' in row || /^CT-|^VBCD-|^NQDU-/.test(row.code))) || ('title' in row && ['PLAN', 'SCORE', 'TASK', 'STAT'].includes(row.kind))) ? row.id : null;
    if (id) nodes.push({ row, id });
    Object.values(row).forEach(visit);
  };
  visit(data);
  if (!nodes.length) return data;
  const rows = await prisma.target.findMany({ where: { id: { in: [...new Set(nodes.map(node => node.id))] } }, select: { id: true, title: true, ordinal: true, issuingLevel: true, ...DOC_REF_INCLUDE } });
  const refs = new Map(rows.map(row => [row.id, docRef(row)]));
  for (const node of nodes) { const ref = refs.get(node.id); if (ref) Object.assign(node.row, ref); }
  for (const node of nodes) if (!node.row.title && node.row.code) node.row.title = rows.find(row => row.id === node.id)?.title;
  return data;
}

@Injectable()
export class DocRefInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest();
    if (!request.user || request.path?.startsWith('/api/public/')) return next.handle();
    return next.handle().pipe(mergeMap(data => attachDocRefs(this.prisma, data)));
  }
}
