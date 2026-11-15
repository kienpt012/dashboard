import { PrismaClient } from '@prisma/client';

// Dữ liệu minh hoạ cho Lịch làm việc của lãnh đạo (G-40): tuần trước, tuần này (đã công khai) và tuần sau (đang soạn).
// Chạy lại không ghi đè tuần đã có lịch.   npx tsx apps/api/prisma/demo/extras-schedule.ts

const prisma = new PrismaClient();
const DAY_MS = 86_400_000;

type Row = [day: number, session: 'ALLDAY' | 'AM' | 'PM' | 'EVENING', time: string | null, content: string, leader: string, location: string | null, participants: string | null, isPublic?: boolean];

const CHAIR = 'Chủ tịch UBND Võ Thành Đạt';
const VICE = 'Phó Chủ tịch UBND Huỳnh Thị Mai';

const WEEKS: Row[][] = [
  [
    [0, 'AM', '07:30', 'Chào cờ đầu tuần; họp giao ban Thường trực UBND với các phòng, ban', CHAIR, 'Hội trường UBND phường', 'Thường trực UBND, trưởng các phòng, ban'],
    [0, 'PM', '14:00', 'Làm việc với Phòng Kinh tế, Hạ tầng và Đô thị về tiến độ giải ngân vốn đầu tư công', CHAIR, 'Phòng họp số 1', 'Phòng Kinh tế, Hạ tầng và Đô thị; Văn phòng HĐND và UBND'],
    [1, 'AM', '08:00', 'Kiểm tra hiện trường công trình nâng cấp hẻm liên khu phố Hòa Long – Long Thới', VICE, 'Khu phố Hòa Long', 'Phòng Kinh tế, Hạ tầng và Đô thị; Ban điều hành khu phố'],
    [1, 'PM', '14:00', 'Họp Ban Chỉ đạo chuyển đổi số phường', CHAIR, 'Phòng họp số 2', 'Thành viên Ban Chỉ đạo'],
    [2, 'AM', '08:00', 'Dự hội nghị trực tuyến của UBND Thành phố về cải cách hành chính', VICE, 'Phòng họp trực tuyến', null],
    [2, 'PM', '14:00', 'Làm việc với Trung tâm Phục vụ hành chính công về tỷ lệ hồ sơ giải quyết đúng hạn', CHAIR, 'Trung tâm Phục vụ hành chính công', null],
    [3, 'AM', '08:00', 'Tiếp công dân định kỳ', CHAIR, 'Phòng Tiếp công dân', null],
    [3, 'PM', '14:00', 'Họp xét duyệt hồ sơ trợ giúp xã hội tháng 11', VICE, 'Phòng họp số 2', 'Phòng Văn hóa – Xã hội'],
    [4, 'AM', '08:00', 'Họp Thường trực UBND thông qua báo cáo kinh tế – xã hội tháng', CHAIR, 'Phòng họp số 1', 'Thường trực UBND, Chánh Văn phòng', false],
    [4, 'PM', '14:00', 'Kiểm tra công tác vệ sinh môi trường khu vực chợ Lái Thiêu', VICE, 'Chợ Lái Thiêu', 'Phòng Kinh tế, Hạ tầng và Đô thị; Công an phường'],
    [5, 'AM', '07:00', 'Ra quân "Ngày thứ Bảy văn minh" tại các khu phố', VICE, 'Các khu phố', null],
  ],
  [
    [0, 'AM', '07:30', 'Chào cờ đầu tuần; họp giao ban Thường trực UBND với các phòng, ban', CHAIR, 'Hội trường UBND phường', 'Thường trực UBND, trưởng các phòng, ban'],
    [0, 'PM', '14:00', 'Nghe báo cáo tiến độ thu ngân sách nhà nước 11 tháng', CHAIR, 'Phòng họp số 1', 'Phòng Kinh tế, Hạ tầng và Đô thị'],
    [1, 'AM', '08:30', 'Thăm, làm việc với Trường Tiểu học trên địa bàn về công tác chuẩn quốc gia', VICE, 'Trường Tiểu học Lái Thiêu', 'Phòng Văn hóa – Xã hội'],
    [1, 'PM', '14:00', 'Họp rà soát các chỉ tiêu kinh tế – xã hội có nguy cơ không đạt', CHAIR, 'Phòng họp số 1', 'Trưởng các phòng, ban', false],
    [2, 'AM', '08:00', 'Đối thoại với thanh niên về chuyển đổi số và dịch vụ công trực tuyến', VICE, 'Hội trường UBND phường', 'Đoàn Thanh niên phường'],
    [3, 'AM', '08:00', 'Tiếp công dân định kỳ', CHAIR, 'Phòng Tiếp công dân', null],
    [3, 'PM', '15:00', 'Kiểm tra công tác chuẩn bị tuyển chọn, gọi công dân nhập ngũ', CHAIR, 'Ban Chỉ huy Quân sự phường', 'Ban Chỉ huy Quân sự, Công an phường'],
    [4, 'AM', '08:00', 'Hội nghị sơ kết công tác cải cách hành chính quý IV', VICE, 'Hội trường UBND phường', 'Văn phòng HĐND và UBND; Trung tâm Phục vụ hành chính công'],
    [4, 'PM', '14:00', 'Làm việc với các khu phố về giải quyết phản ánh của người dân', VICE, 'Phòng họp số 2', 'Trưởng các khu phố'],
  ],
];

function mondayOfToday() {
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const date = new Date(`${today}T00:00:00.000Z`);
  return new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS);
}

async function main() {
  const clerk = await prisma.user.findFirst({ where: { username: 'van.thu' }, select: { id: true } });
  const monday = mondayOfToday();
  const plans = [
    { offset: -1, rows: WEEKS[1], isPublic: true },
    { offset: 0, rows: WEEKS[0], isPublic: true },
    { offset: 1, rows: WEEKS[1], isPublic: false },
  ];
  let created = 0;
  for (const plan of plans) {
    const weekStart = new Date(monday.getTime() + plan.offset * 7 * DAY_MS);
    if (await prisma.workSchedule.findUnique({ where: { weekStart }, select: { id: true } })) continue;
    await prisma.workSchedule.create({
      data: {
        weekStart,
        isPublic: plan.isPublic,
        publishedAt: plan.isPublic ? new Date(weekStart.getTime() - 2 * DAY_MS + 9 * 3_600_000) : null,
        publishedById: plan.isPublic ? clerk?.id ?? null : null,
        createdById: clerk?.id ?? null,
        updatedById: clerk?.id ?? null,
        entries: {
          create: plan.rows.map(([day, session, startTime, content, leader, location, participants, isPublic], index) => ({
            date: new Date(weekStart.getTime() + day * DAY_MS), session, startTime, content, leader, location, participants,
            isPublic: isPublic ?? true, sortOrder: index,
          })),
        },
      },
    });
    created += 1;
  }
  console.log(`Lịch làm việc mẫu: thêm ${created} tuần, giữ nguyên ${plans.length - created} tuần đã có.`);
  console.log(await addPublicBlock());
}

type Layout = { i: string; x: number; y: number; w: number; h: number; minW?: number; minH?: number };
type Config = { widgets: { id: string; type: string; title?: string; settings: Record<string, unknown> }[]; layouts: Record<string, Layout[]> };

const BLOCK_ID = 'leader-schedule';
const BLOCK_SIZE: Record<string, [w: number, h: number, minW: number, minH: number]> = { desktop: [12, 9, 4, 5], tablet: [8, 9, 4, 5], mobile: [4, 12, 4, 6] };

function withBlock(raw: unknown): Config | null {
  const config = structuredClone(raw) as Config;
  if (!Array.isArray(config?.widgets) || config.widgets.some(widget => widget.type === 'leaderSchedule')) return null;
  config.widgets.push({ id: BLOCK_ID, type: 'leaderSchedule', title: 'Lịch làm việc của lãnh đạo', settings: { maxItems: 8 } });
  for (const [breakpoint, [w, h, minW, minH]] of Object.entries(BLOCK_SIZE)) {
    const layout = config.layouts[breakpoint] ?? [];
    const bottom = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
    layout.push({ i: BLOCK_ID, x: 0, y: bottom, w, h, minW, minH });
    config.layouts[breakpoint] = layout;
  }
  return config;
}

/** Đặt khối "Lịch làm việc của lãnh đạo" vào cuối trang công khai (bản nháp và bản đang công bố) nếu chưa có. */
async function addPublicBlock() {
  const dashboard = await prisma.publicDashboard.findFirst();
  if (!dashboard?.publishedRevision) return 'Trang công khai chưa công bố: bỏ qua khối lịch làm việc.';
  const current = await prisma.publicDashboardRevision.findUnique({
    where: { dashboardId_revision: { dashboardId: dashboard.id, revision: dashboard.publishedRevision } },
  });
  const published = current && withBlock(current.config);
  if (!current || !published) return 'Trang công khai đã có khối lịch làm việc.';
  const draft = withBlock(dashboard.draftConfig) ?? (dashboard.draftConfig as unknown as Config);
  const revision = dashboard.publishedRevision + 1;
  await prisma.$transaction([
    prisma.publicDashboardRevision.create({
      data: {
        dashboardId: dashboard.id, revision, name: current.name, templateKey: current.templateKey, config: published as object,
        changeNote: 'Thêm khối Lịch làm việc của lãnh đạo', publishedBy: current.publishedBy,
      },
    }),
    prisma.publicDashboard.update({
      where: { id: dashboard.id },
      data: { publishedRevision: revision, draftConfig: draft as object, draftVersion: { increment: 1 } },
    }),
  ]);
  return `Trang công khai: đã thêm khối lịch làm việc (bản công bố lần ${revision}).`;
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
