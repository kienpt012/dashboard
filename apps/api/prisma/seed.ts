import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { dataStatus, loadSnapshot } from './demo/snapshot';

// Dữ liệu mẫu IOC: nạp bộ dữ liệu mẫu chính thức (prisma/demo/du-lieu-mau.json.gz) — một phường giả lập, mọi số liệu
// là mô phỏng. Cơ sở dữ liệu trống thì nạp; đã có dữ liệu thì không đụng tới, trừ khi chạy với --replace (start-ioc
// dùng để thay bộ mẫu cũ, KHÔNG BAO GIỜ áp dụng cho dữ liệu thật của địa phương).

const prisma = new PrismaClient();

function seedPassword(name: 'DEMO_ADMIN_PASSWORD' | 'DEMO_USER_PASSWORD', fallback: string) {
  const configured = process.env[name]?.trim();
  const value = configured || fallback;
  const isWeak =
    !configured
    || configured === fallback
    || configured.startsWith('replace-with-')
    || value.length < 12
    || !/[a-z]/.test(value)
    || !/[A-Z]/.test(value)
    || !/\d/.test(value)
    || !/[^A-Za-z0-9]/.test(value);
  if (process.env.NODE_ENV === 'production' && isWeak) {
    throw new Error(`${name} must be explicitly set to a strong, non-default password in production.`);
  }
  return value;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED?.toLowerCase() !== 'true') {
    throw new Error('Không chạy dữ liệu mẫu trong production. Chỉ đặt ALLOW_DEMO_SEED=true khi đã xác nhận đây là môi trường demo.');
  }
  const replace = process.argv.includes('--replace');
  const status = await dataStatus(prisma);
  if (status.state === 'real') {
    console.log('Cơ sở dữ liệu đang chứa dữ liệu thật — không nạp dữ liệu mẫu.');
    return;
  }
  if (status.state !== 'empty' && !replace) {
    console.log(`Cơ sở dữ liệu đã có bộ dữ liệu mẫu (${status.version}) — giữ nguyên.`);
    return;
  }
  const adminPasswordHash = await bcrypt.hash(seedPassword('DEMO_ADMIN_PASSWORD', 'Admin@12345'), 10);
  const userPasswordHash = await bcrypt.hash(seedPassword('DEMO_USER_PASSWORD', 'Demo@12345'), 10);
  // Cơ sở dữ liệu "trống" vẫn có vài dòng mặc định do migration tạo: trình nạp luôn dọn sạch trước (dữ liệu thật đã bị chặn ở trên).
  const snapshot = await loadSnapshot(prisma, { adminPasswordHash, userPasswordHash });
  const targets = snapshot.tables.Target?.length ?? 0;
  const users = snapshot.tables.User?.length ?? 0;
  console.log(`Đã nạp bộ dữ liệu mẫu ${snapshot.version}: ${users} tài khoản, ${targets} chỉ tiêu.`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
