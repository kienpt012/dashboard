import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { PrismaClient } from '@prisma/client';

// Bộ dữ liệu mẫu chính thức của IOC: ảnh chụp toàn bộ dữ liệu của môi trường demo đã duyệt (một phường giả lập,
// mọi con số là mô phỏng). Ai cài mới đều nhận đúng bộ này; máy đang dùng bộ mẫu đời trước được thay khi chạy start-ioc.
//
//   Xuất (người phát triển, từ cơ sở dữ liệu demo):  DATABASE_URL=... npx tsx prisma/demo/export.ts [phiên-bản]
//   Nạp vào cơ sở dữ liệu trống:                     ./docker-entrypoint.sh seed
//   Thay bộ mẫu cũ bằng bộ mới (xoá dữ liệu hiện có): ./docker-entrypoint.sh seed-replace
//
// An toàn dữ liệu: chỉ cơ sở dữ liệu được nhận ra chắc chắn là bộ mẫu mới bị thay. Dữ liệu thật của địa phương
// (không có tài khoản mẫu) và bộ mẫu đã được dùng để nhập dữ liệu mới sau khi nạp đều không bao giờ bị tự thay.

export const SNAPSHOT_FILE = join(__dirname, 'du-lieu-mau.json.gz');

/**
 * Tệp nhị phân (văn bản gốc, tệp minh chứng) để riêng trong thư mục tep/, tên theo mã băm nội dung: ảnh chụp JSON
 * không phình to, git chỉ lưu mỗi tệp một lần, và mở thẳng được tệp để xem. Trong JSON ô dữ liệu ghi {"$file": tên}.
 */
export const FILES_DIR = join(__dirname, 'tep');

type FileRef = { $file: string };

const isFileRef = (value: unknown): value is FileRef =>
  typeof value === 'object' && value !== null && typeof (value as FileRef).$file === 'string';

function extensionOf(data: Buffer) {
  if (data.subarray(0, 4).toString('latin1') === '%PDF') return '.pdf';
  if (data[0] === 0x89 && data.subarray(1, 4).toString('latin1') === 'PNG') return '.png';
  if (data[0] === 0xff && data[1] === 0xd8) return '.jpg';
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  if (data[0] === 0x50 && data[1] === 0x4b) return '.zip';
  return '.bin';
}

async function binaryColumns(prisma: PrismaClient, table: string) {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND data_type = 'bytea'`,
    table,
  );
  return rows.map(row => row.name);
}

/** Lô nạp: tối đa 400 dòng hoặc ~24MB JSON (bảng văn bản có tệp PDF lớn). */
function batches(rows: Record<string, unknown>[]) {
  const result: Record<string, unknown>[][] = [];
  let current: Record<string, unknown>[] = [];
  let size = 0;
  for (const row of rows) {
    const length = JSON.stringify(row).length;
    if (current.length && (current.length >= 400 || size + length > 24_000_000)) {
      result.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += length;
  }
  if (current.length) result.push(current);
  return result;
}

/** Bảng không đưa vào bộ mẫu: thư đang chờ gửi, mã khôi phục mật khẩu, thao tác Jarvis đang chờ xác nhận. */
const SKIPPED = new Set(['_prisma_migrations', 'MailOutbox', 'PasswordResetChallenge', 'AgentAction']);

/**
 * Tài khoản chỉ có trong bộ mẫu (đặt tên kiểu tổng hợp, địa phương thật không dùng). Cơ sở dữ liệu được coi là bộ mẫu
 * khi có ĐỦ các tài khoản bắt buộc — tên thông dụng như "chu.tich", "van.thu" không đủ để kết luận.
 */
const DEMO_REQUIRED = ['staff.ktht', 'viewer.ktht'];
const DEMO_HINTS = ['lan.anh', 'manager.vhxh'];

type Snapshot = { version: string; takenAt: string; tables: Record<string, Record<string, unknown>[]> };

async function tableNames(prisma: PrismaClient) {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  return rows.map(row => row.name).filter(name => !SKIPPED.has(name));
}

type ForeignKey = { child: string; parent: string; column: string };

async function foreignKeys(prisma: PrismaClient): Promise<ForeignKey[]> {
  const rows = await prisma.$queryRawUnsafe<{ child: string; parent: string; column: string }[]>(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent, a.attname AS column
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f'`,
  );
  const clean = (name: string) => name.replace(/^public\./, '').replace(/^"|"$/g, '');
  return rows.map(row => ({ child: clean(row.child), parent: clean(row.parent), column: row.column }));
}

/** Thứ tự nạp: bảng được tham chiếu đứng trước bảng tham chiếu tới nó (tự tham chiếu xử lý riêng). */
function loadOrder(tables: string[], keys: ForeignKey[]) {
  const parents = new Map<string, Set<string>>(tables.map(table => [table, new Set<string>()]));
  for (const key of keys) {
    if (key.child !== key.parent && parents.has(key.child) && parents.has(key.parent)) parents.get(key.child)!.add(key.parent);
  }
  const ordered: string[] = [];
  const placed = new Set<string>();
  while (ordered.length < tables.length) {
    const ready = tables.filter(table => !placed.has(table) && [...parents.get(table)!].every(parent => placed.has(parent)));
    if (!ready.length) throw new Error('Khoá ngoại giữa các bảng tạo thành vòng, không xác định được thứ tự nạp.');
    for (const table of ready) {
      ordered.push(table);
      placed.add(table);
    }
  }
  return ordered;
}

/** Bảng tự tham chiếu (chỉ tiêu cha–con): xếp dòng cha trước dòng con để nạp theo lô không vỡ khoá ngoại. */
function parentsFirst(rows: Record<string, unknown>[], column: string) {
  const ids = new Set(rows.map(row => row.id));
  const placed = new Set<unknown>();
  const result: Record<string, unknown>[] = [];
  let pending = rows;
  while (pending.length) {
    const next: Record<string, unknown>[] = [];
    for (const row of pending) {
      const parent = row[column];
      if (parent == null || !ids.has(parent) || placed.has(parent)) {
        result.push(row);
        placed.add(row.id);
      } else next.push(row);
    }
    if (next.length === pending.length) return [...result, ...next];
    pending = next;
  }
  return result;
}

export async function exportSnapshot(prisma: PrismaClient, version: string) {
  const snapshot: Snapshot = { version, takenAt: new Date().toISOString(), tables: {} };
  const used = new Set<string>();
  mkdirSync(FILES_DIR, { recursive: true });
  for (const table of await tableNames(prisma)) {
    const [row] = await prisma.$queryRawUnsafe<{ rows: Record<string, unknown>[] | null }[]>(
      `SELECT json_agg(t ORDER BY t.ctid) AS rows FROM "${table}" t`,
    );
    const rows = row?.rows ?? [];
    for (const column of await binaryColumns(prisma, table)) {
      for (const record of rows) {
        const value = record[column];
        if (typeof value !== 'string' || !value.startsWith('\\x')) continue;
        const data = Buffer.from(value.slice(2), 'hex');
        const name = `${createHash('sha256').update(data).digest('hex').slice(0, 32)}${extensionOf(data)}`;
        if (!existsSync(join(FILES_DIR, name))) writeFileSync(join(FILES_DIR, name), data);
        used.add(name);
        record[column] = { $file: name } satisfies FileRef;
      }
    }
    snapshot.tables[table] = rows;
  }
  // Tệp của bộ mẫu trước không còn dùng: xoá để repo không giữ tệp thừa.
  for (const name of readdirSync(FILES_DIR)) if (!used.has(name)) rmSync(join(FILES_DIR, name));
  writeFileSync(SNAPSHOT_FILE, gzipSync(Buffer.from(JSON.stringify(snapshot)), { level: 9 }));
  return snapshot;
}

export function readSnapshot(): Snapshot {
  return JSON.parse(gunzipSync(readFileSync(SNAPSHOT_FILE)).toString('utf8')) as Snapshot;
}

/** Dấu bộ mẫu lưu trong SystemSetting.demoDataVersion: "<phiên bản>@<thời điểm nạp ISO>". */
function parseMarker(marker: string | null | undefined) {
  if (!marker) return null;
  const [version, loadedAt] = marker.split('@');
  const time = loadedAt ? new Date(loadedAt) : null;
  return { version, loadedAt: time && !Number.isNaN(time.getTime()) ? time : null };
}

/**
 * Nạp bộ mẫu: xoá sạch dữ liệu hiện có (trừ lịch sử migration, kể cả các dòng mặc định do migration tạo) rồi nạp.
 * Mật khẩu mọi tài khoản được đặt lại theo .env (quản trị: adminPasswordHash, còn lại: userPasswordHash).
 * Người gọi chịu trách nhiệm kiểm tra cơ sở dữ liệu là trống hoặc bộ mẫu (dataStatus) trước khi gọi.
 */
export async function loadSnapshot(prisma: PrismaClient, options: { adminPasswordHash: string; userPasswordHash: string }) {
  const snapshot = readSnapshot();
  const tables = await tableNames(prisma);
  const keys = await foreignKeys(prisma);
  const order = loadOrder(tables, keys);
  await prisma.$transaction(
    async tx => {
      await tx.$executeRawUnsafe(`TRUNCATE ${[...tables, 'MailOutbox'].map(table => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`);
      for (const table of order) {
        let rows = snapshot.tables[table] ?? [];
        if (!rows.length) continue;
        const self = keys.find(key => key.child === table && key.parent === table);
        if (self) rows = parentsFirst(rows, self.column);
        // Chỉ nạp những cột bảng hiện có; cột mới thêm sau khi chụp nhận giá trị mặc định.
        const columns = await tx.$queryRawUnsafe<{ name: string }[]>(
          `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          table,
        );
        const present = new Set(Object.keys(rows[0]));
        const list = columns.map(column => column.name).filter(name => present.has(name)).map(name => `"${name}"`).join(', ');
        // Ô tệp nhị phân ghi tên tệp trong tep/: đọc tệp, đưa vào dạng hex mà json_populate_recordset hiểu cho bytea.
        rows = rows.map(record => {
          const refs = Object.entries(record).filter(([, value]) => isFileRef(value));
          if (!refs.length) return record;
          const copy = { ...record };
          for (const [column, value] of refs) copy[column] = `\\x${readFileSync(join(FILES_DIR, (value as FileRef).$file)).toString('hex')}`;
          return copy;
        });
        for (const batch of batches(rows)) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "${table}" (${list}) SELECT ${list} FROM json_populate_recordset(NULL::"${table}", $1::json)`,
            JSON.stringify(batch),
          );
        }
      }
      // Trigger của bảng sự kiện phản ánh tự xếp thư thông báo vào hàng đợi khi nạp: bộ mẫu không được gửi thư thật.
      await tx.$executeRawUnsafe(`DELETE FROM "MailOutbox"`);
      await tx.$executeRawUnsafe(`UPDATE "User" SET "passwordHash" = $1 WHERE role = 'ADMIN'`, options.adminPasswordHash);
      await tx.$executeRawUnsafe(`UPDATE "User" SET "passwordHash" = $1 WHERE role <> 'ADMIN'`, options.userPasswordHash);
      await tx.$executeRawUnsafe(`UPDATE "SystemSetting" SET "demoDataVersion" = $1`, `${snapshot.version}@${new Date().toISOString()}`);
    },
    { timeout: 180_000, maxWait: 30_000 },
  );
  return snapshot;
}

export type DataState = 'empty' | 'demo' | 'demo-used' | 'demo-old' | 'real';

/**
 * Trạng thái dữ liệu:
 *  - empty: chưa có tài khoản nào;
 *  - demo: bộ mẫu có dấu phiên bản, chưa ai nhập dữ liệu mới sau khi nạp — thay được an toàn;
 *  - demo-used: bộ mẫu nhưng đã có chỉ tiêu, báo cáo, phản ánh, văn bản, dòng dữ liệu tạo sau khi nạp — chỉ thay khi
 *    người dùng tự xác nhận;
 *  - demo-old: bộ mẫu đời trước (chưa có dấu phiên bản) — nhận ra qua các tài khoản mẫu tổng hợp;
 *  - real: dữ liệu thật của địa phương — không bao giờ thay.
 */
export async function dataStatus(prisma: PrismaClient): Promise<{ state: DataState; version: string | null }> {
  const users = await prisma.user.count();
  if (users === 0) return { state: 'empty', version: null };
  const usernames = new Set(
    (await prisma.user.findMany({ where: { username: { in: [...DEMO_REQUIRED, ...DEMO_HINTS] } }, select: { username: true } })).map(user => user.username),
  );
  const isDemo = DEMO_REQUIRED.every(name => usernames.has(name)) && usernames.size >= 3;
  if (!isDemo) return { state: 'real', version: null };
  const setting = await prisma.systemSetting.findUnique({ where: { id: 'default' }, select: { demoDataVersion: true } });
  const marker = parseMarker(setting?.demoDataVersion);
  if (!marker) return { state: 'demo-old', version: 'cu' };
  if (marker.loadedAt) {
    // Một phút sau khi nạp mà có dữ liệu nghiệp vụ mới: bộ mẫu đã được dùng thật, không tự xoá.
    const since = { createdAt: { gt: new Date(marker.loadedAt.getTime() + 60_000) } };
    const created = await Promise.all([
      prisma.target.count({ where: since }),
      prisma.progressUpdate.count({ where: since }),
      prisma.feedback.count({ where: since }),
      prisma.sourceDocument.count({ where: since }),
      prisma.datasetRow.count({ where: since }),
      prisma.targetDirective.count({ where: since }),
    ]);
    if (created.some(count => count > 0)) return { state: 'demo-used', version: marker.version };
  }
  return { state: 'demo', version: marker.version };
}
