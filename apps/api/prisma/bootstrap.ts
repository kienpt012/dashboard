import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Khởi tạo một địa phương thật (không có dữ liệu mẫu): chỉ tạo tài khoản quản trị đầu tiên khi CSDL chưa có quản trị
// viên nào đang hoạt động. Mọi thứ còn lại (hồ sơ địa phương, phòng ban, bộ chỉ tiêu) làm qua /admin/thiet-lap.
// Chạy lại an toàn: đã có quản trị viên thì không làm gì.

const prisma = new PrismaClient();

function strongPassword(value: string) {
  return value.length >= 12 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);
}

async function main() {
  const existing = await prisma.user.count({ where: { role: Role.ADMIN, isActive: true } });
  if (existing > 0) {
    console.log('Đã có tài khoản quản trị đang hoạt động — bỏ qua.');
    return;
  }
  const username = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const fullName = (process.env.ADMIN_FULL_NAME || 'Quản trị hệ thống').trim();
  const password = process.env.ADMIN_PASSWORD?.trim() || process.env.DEMO_ADMIN_PASSWORD?.trim() || '';
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw new Error('ADMIN_USERNAME chỉ gồm chữ thường, số, dấu chấm, gạch dưới, gạch ngang (3–50 ký tự).');
  if (!strongPassword(password) || password.startsWith('replace-with-')) {
    throw new Error('Đặt ADMIN_PASSWORD (hoặc DEMO_ADMIN_PASSWORD) mạnh: ≥12 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.');
  }
  const taken = await prisma.user.findUnique({ where: { username } });
  if (taken) throw new Error(`Tên đăng nhập "${username}" đã được dùng bởi một tài khoản không phải quản trị đang hoạt động.`);
  await prisma.$transaction(async tx => {
    const user = await tx.user.create({
      data: { username, fullName, position: 'Quản trị hệ thống', role: Role.ADMIN, passwordHash: await bcrypt.hash(password, 10) },
    });
    await tx.auditLog.create({
      data: { actorId: user.id, actorUsername: 'he-thong', actorRole: Role.ADMIN, action: 'USER_CREATED', entityType: 'User', entityId: user.id, metadata: { bootstrap: true, username } },
    });
  });
  console.log(`Đã tạo tài khoản quản trị "${username}". Đăng nhập rồi mở /admin/thiet-lap để thiết lập địa phương.`);
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
