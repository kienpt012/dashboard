import { PrismaClient } from '@prisma/client';
import { dataStatus, readSnapshot } from './snapshot';

// In một dòng cho start-ioc: "<trạng thái> <phiên bản đang có> <phiên bản bộ mẫu mới nhất>"
// trạng thái: empty | demo | demo-used | demo-old | real (xem dataStatus trong snapshot.ts).

async function main() {
  const prisma = new PrismaClient();
  try {
    const status = await dataStatus(prisma);
    console.log(`IOC_DATA ${status.state} ${status.version ?? '-'} ${readSnapshot().version}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
