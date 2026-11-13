import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

if (new URL(process.env.DATABASE_URL || '').pathname !== '/ioc_wp_c') throw new Error('Chỉ kiểm tra seed trên ioc_wp_c');
const prisma = new PrismaClient();
const snapshot = async () => ({
  targets: await prisma.target.count(), reports: await prisma.progressUpdate.count(),
  history: await prisma.forecastHistory.count(), events: await prisma.workEvent.count(), audits: await prisma.auditLog.count(),
});
try {
  const before = await snapshot();
  const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'apps/api/prisma/demo/extras-forecast.ts'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const after = await snapshot();
  assert.deepEqual(after, before, 'Chạy lại seed không được thêm bản ghi');
  const targets = await prisma.target.findMany({ where: { framework: { code: 'LT-NQDU-2026' } } });
  assert.equal(targets.length, 7);
  assert.equal(targets.filter(row => row.linkGroupId).length, 4);
  assert.equal(await prisma.forecastHistory.count({ where: { simulated: true } }), 768);
  console.log(JSON.stringify({ ok: true, before, after, linkedPairs: 4, suggestions: 3, simulatedHistory: 768 }, null, 2));
} finally { await prisma.$disconnect(); }
