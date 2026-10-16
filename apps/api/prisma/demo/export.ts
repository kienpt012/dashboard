import { PrismaClient } from '@prisma/client';
import { exportSnapshot } from './snapshot';

// Xuất cơ sở dữ liệu demo hiện tại thành bộ dữ liệu mẫu chính thức (prisma/demo/du-lieu-mau.json.gz).
//   DATABASE_URL=postgresql://.../ioc_v2_final npx tsx prisma/demo/export.ts [phiên-bản]
// Phiên bản mặc định là ngày xuất (YYYY-MM-DD). Đổi phiên bản thì máy đang dùng bộ mẫu cũ sẽ được đề nghị thay khi
// chạy start-ioc. Chỉ xuất cơ sở dữ liệu mô phỏng — repo công khai.

async function main() {
  const prisma = new PrismaClient();
  try {
    const version = process.argv[2] || new Date().toISOString().slice(0, 10);
    const snapshot = await exportSnapshot(prisma, version);
    const counts = Object.entries(snapshot.tables)
      .filter(([, rows]) => rows.length)
      .map(([table, rows]) => `${table} ${rows.length}`)
      .join(', ');
    console.log(`Đã xuất bộ dữ liệu mẫu ${version}: ${counts}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
