import { PrismaClient } from '@prisma/client';
import { docRef, DOC_REF_INCLUDE } from '../../src/doc-ref';
import { dataStatus } from './snapshot';

// Bổ sung văn bản giao cho các chỉ tiêu đã công bố của bộ mẫu (thẻ chỉ tiêu trên trang công khai); chạy lại không đổi gì thêm.
//   npx tsx apps/api/prisma/demo/extras-public-docref.ts
const prisma = new PrismaClient();
async function main() {
  const { state } = await dataStatus(prisma);
  if (state === 'real' || state === 'empty') throw new Error('Script này chỉ chạy trên bộ dữ liệu mẫu, không chạy trên dữ liệu thật của địa phương');
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
