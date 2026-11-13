import { PrismaClient } from '@prisma/client';
import { docRef, DOC_REF_INCLUDE } from '../../src/doc-ref';

// Bổ sung tham chiếu cho bản công bố của bộ mẫu; không tạo bản ghi trùng.
const prisma = new PrismaClient();
async function main() {
  if (new URL(process.env.DATABASE_URL!).pathname !== '/ioc_wp_d') throw new Error('Chỉ chạy trên CSDL mẫu ioc_wp_d');
  const rows = await prisma.target.findMany({ where: { isPublic: true, publishedDocRef: null }, include: DOC_REF_INCLUDE });
  let count = 0;
  for (const target of rows) {
    // Chỉ bản mẫu còn khớp tiêu đề đã công bố. Bản nội bộ thay đổi phải công bố lại qua API.
    if (target.publishedTitle !== target.title) continue;
    const ref = docRef(target);
    if (!ref.docRef) continue;
    await prisma.target.update({ where: { id: target.id }, data: { publishedDocRef: ref.docRef, publishedOrdinal: ref.ordinal, publishedIssuingLevel: ref.issuingLevel } });
    count++;
  }
  console.log(`Đã bổ sung tham chiếu ${count} chỉ tiêu mẫu.`);
}
main().finally(() => prisma.$disconnect());
