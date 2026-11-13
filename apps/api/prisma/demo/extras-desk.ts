import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const appSamples = [
  ['mail', 'Thư công vụ', 'https://mail.tphcm.gov.vn', 'MailOutlined', 'Trao đổi', 'Gửi và nhận thư công vụ của Thành phố Hồ Chí Minh.'],
  ['dvcqg', 'Dịch vụ công quốc gia', 'https://dichvucong.gov.vn', 'GlobalOutlined', 'Thủ tục hành chính', 'Tra cứu, nộp và theo dõi hồ sơ dịch vụ công trực tuyến.'],
  ['dvchcm', 'Giải quyết TTHC TP.HCM', 'https://dichvucong.hochiminhcity.gov.vn', 'SolutionOutlined', 'Thủ tục hành chính', 'Tra cứu và xử lý thủ tục hành chính của Thành phố Hồ Chí Minh.'],
  ['1022', 'Cổng 1022', 'https://1022.tphcm.gov.vn', 'CustomerServiceOutlined', 'Trao đổi', 'Tiếp nhận và theo dõi phản ánh của người dân Thành phố Hồ Chí Minh.'],
  ['vbpl', 'Văn bản pháp luật', 'https://vbpl.vn', 'ReadOutlined', 'Tra cứu', 'Tra cứu văn bản quy phạm pháp luật.'],
  ['chinhphu', 'Cổng thông tin Chính phủ', 'https://chinhphu.vn', 'BankOutlined', 'Tra cứu', 'Theo dõi thông tin chỉ đạo, điều hành của Chính phủ.'],
];

async function main() {
  for (const [index, [id, name, url, icon, group, description]] of appSamples.entries()) {
    await prisma.workApp.upsert({ where: { id: `demo-desk-app-${id}` }, create: { id: `demo-desk-app-${id}`, name, url, icon, group, description, color: ['#1677ff', '#08979c', '#722ed1'][index % 3], sortOrder: index }, update: {} });
  }
  const people = await prisma.user.findMany({ where: { username: { in: ['chu.tich', 'lan.anh', 'thao.ktht'] } }, select: { id: true, username: true, departmentId: true } });
  const chair = people.find(user => user.username === 'chu.tich');
  const manager = people.find(user => user.username === 'lan.anh');
  const staff = people.find(user => user.username === 'thao.ktht');
  if (!chair || !manager || !staff) throw new Error('Cần nạp bộ dữ liệu mẫu có chu.tich, lan.anh, thao.ktht trước');
  const target = await prisma.target.findFirst({ where: { departmentId: manager.departmentId!, isArchived: false, title: { contains: 'giải ngân', mode: 'insensitive' } }, select: { id: true } });
  const staffTarget = await prisma.target.findFirst({ where: { assigneeId: staff.id, isArchived: false }, select: { id: true } });
  const today = new Date();
  const nextDay = new Date(today.getTime() + 86_400_000);
  const notes = [
    { id: 'demo-desk-note-chair', authorId: chair.id, content: 'Chị Lan Anh rà soát tiến độ giải ngân vốn đầu tư công, tổng hợp các vướng mắc cần UBND phường chỉ đạo xử lý để trao đổi tại giao ban.', color: 'yellow', dueAt: nextDay, targetId: target?.id, recipients: [{ userId: manager.id, seenAt: today, x: 12, y: 12 }] },
    { id: 'demo-desk-note-manager', authorId: manager.id, content: 'Thảo kiểm tra số liệu kỳ này, bổ sung minh chứng và gửi báo cáo để phòng rà soát trước hạn.', color: 'pink', dueAt: today, targetId: staffTarget?.id, recipients: [{ userId: staff.id, x: 20, y: 12 }] },
    { id: 'demo-desk-note-staff', authorId: staff.id, content: 'Em xin ý kiến Chủ tịch về các nội dung phối hợp liên phòng trong báo cáo tiến độ. Em đã tổng hợp tài liệu để trao đổi khi anh bố trí thời gian.', color: 'blue', dueAt: nextDay, recipients: [{ userId: chair.id, seenAt: today, doneAt: today, x: 10, y: 10 }] },
    { id: 'demo-desk-note-private', authorId: staff.id, content: 'Kiểm tra lại nguồn số liệu và tệp minh chứng trước khi trình báo cáo.', color: 'green', dueAt: nextDay, recipients: [{ userId: staff.id, seenAt: today, x: 35, y: 32 }] },
  ];
  for (const { recipients, ...note } of notes) await prisma.deskNote.upsert({ where: { id: note.id }, create: { ...note, recipients: { create: recipients } }, update: {} });
  await prisma.deskNoteReply.upsert({ where: { id: 'demo-desk-reply-chair' }, create: { id: 'demo-desk-reply-chair', noteId: 'demo-desk-note-staff', authorId: chair.id, content: 'Em gửi nội dung tổng hợp cho Văn phòng để bố trí trao đổi tại giao ban.' }, update: {} });
  for (const note of notes) for (const recipient of note.recipients) await prisma.notification.upsert({ where: { dedupeKey: `desk-note:${note.id}:${recipient.userId}` }, create: { userId: recipient.userId, kind: 'DESK_NOTE', title: 'Có note nhắc việc trên bàn làm việc', link: `/admin?note=${note.id}`, entityType: 'DeskNote', entityId: note.id, dedupeKey: `desk-note:${note.id}:${recipient.userId}` }, update: {} });
  console.log('Đã bổ sung 6 ứng dụng công vụ và 4 note mẫu; chạy lại không nhân đôi.');
}

main().finally(() => prisma.$disconnect());
