import { DirectiveKind, PrismaClient } from '@prisma/client';
import { parsePlanningDueDate } from '../../src/planning-date';
import { evaluateTarget } from '../../src/metrics';

// Chỉ bổ sung các dòng có khóa VBCD-2026; chạy lại giữ nguyên dữ liệu người dùng đã chỉnh.
const prisma = new PrismaClient();
const definitions: { code: string; name: string; number: string; kind: DirectiveKind; issued: string; tasks: [string, string][]; source?: boolean }[] = [
  { code: 'VBCD-2026-CT12', name: 'Chương trình công tác quý IV năm 2026 của UBND phường', number: '12/CTr-UBND', kind: 'CHUONG_TRINH', issued: '2026-10-01', tasks: [
    ['Rà soát các nhiệm vụ trọng tâm quý IV và lịch kiểm tra của UBND phường', 'VP'],
    ['Tổng hợp tiến độ thực hiện các công trình đầu tư công trên địa bàn', 'KTHTDT'],
    ['Tổ chức rà soát danh sách hộ cần hỗ trợ dịp cuối năm', 'VHXH'],
    ['Đánh giá kết quả giải quyết hồ sơ hành chính tháng 11', 'TTCC'],
    ['Kiểm tra phương án bảo đảm an ninh trật tự dịp cuối năm', 'CAND'],
    ['Chuẩn bị nội dung tổng kết công tác quốc phòng địa phương', 'QS'],
  ] },
  { code: 'VBCD-2026-TB128', name: 'Kết luận của Chủ tịch UBND phường tại cuộc họp giao ban về giải ngân vốn đầu tư công', number: '128/TB-UBND', kind: 'THONG_BAO_KET_LUAN', issued: '2026-10-07', tasks: [
    ['Rà soát hồ sơ thanh toán các công trình đã nghiệm thu để đẩy nhanh giải ngân vốn đầu tư công', 'KTHTDT'],
    ['Tổng hợp vướng mắc giải phóng mặt bằng và đề xuất hướng xử lý', 'KTHTDT'],
    ['Theo dõi kết quả thực hiện kết luận giao ban và tổng hợp báo cáo Chủ tịch', 'VP'],
    ['Phối hợp tuyên truyền đến các hộ dân tại khu vực triển khai công trình', 'VHXH'],
    ['Kiểm tra điều kiện an toàn giao thông tại các điểm thi công', 'CAND'],
    ['Công khai lịch tiếp nhận và giải quyết hồ sơ liên quan đến công trình', 'TTCC'],
  ] },
  { code: 'VBCD-2026-KH45', name: 'Kế hoạch kiểm tra trật tự đô thị và vệ sinh môi trường quý IV năm 2026', number: '45/KH-UBND', kind: 'KE_HOACH', issued: '2026-10-09', tasks: [
    ['Lập danh sách các tuyến đường trọng điểm cần kiểm tra trật tự đô thị', 'KTHTDT'],
    ['Tổ chức kiểm tra việc chấp hành quy định về lấn chiếm lòng đường, vỉa hè', 'CAND'],
    ['Thông tin lịch kiểm tra và vận động hộ kinh doanh tự khắc phục', 'VHXH'],
    ['Tổng hợp kết quả kiểm tra và tham mưu biện pháp xử lý tồn tại', 'VP'],
    ['Rà soát điểm tập kết rác và đề xuất phương án khắc phục', 'KTHTDT'],
    ['Tổng hợp phản ánh của người dân về trật tự đô thị', 'TTCC'],
  ] },
  { code: 'VBCD-2026-CV236', name: 'Tăng cường hướng dẫn dịch vụ công trực tuyến và chuyển đổi số tại phường', number: '236/UBND-VP', kind: 'CONG_VAN', issued: '2026-10-12', tasks: [
    ['Rà soát tài khoản công vụ và phân quyền truy cập các phần mềm dùng chung', 'VP'],
    ['Tổ chức hướng dẫn người dân nộp hồ sơ trực tuyến tại Trung tâm', 'TTCC'],
    ['Cập nhật nội dung tuyên truyền về định danh điện tử và dịch vụ công', 'VHXH'],
    ['Tổng hợp nhu cầu hỗ trợ chuyển đổi số của hộ kinh doanh', 'KTHTDT'],
    ['Phối hợp hướng dẫn kích hoạt tài khoản định danh điện tử', 'CAND'],
    ['Báo cáo kết quả số hóa hồ sơ và đề xuất nhiệm vụ tháng 12', 'TTCC'],
  ] },
  { code: 'VBCD-2026-QD333', name: 'Nhiệm vụ triển khai Chương trình công tác năm 2026 theo Quyết định 333/QĐ-UBND', number: '333/QĐ-UBND', kind: 'QUYET_DINH', issued: '2026-01-20', source: true, tasks: [
    ['Tổng hợp kết quả thực hiện chương trình công tác năm 2026', 'VP'],
    ['Rà soát tiến độ các chỉ tiêu phát triển kinh tế trên địa bàn', 'KTHTDT'],
    ['Đánh giá công tác bảo đảm an sinh xã hội trong năm', 'VHXH'],
    ['Tổng hợp tỷ lệ hồ sơ thủ tục hành chính giải quyết đúng hạn', 'TTCC'],
    ['Chuẩn bị báo cáo bảo đảm an ninh trật tự cuối năm', 'CAND'],
    ['Đề xuất chương trình công tác và nhiệm vụ trọng tâm năm sau', 'VP'],
  ] },
];

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Không chạy dữ liệu minh họa trên production');
  const [departments, users, relatedTarget, source] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true } }), prisma.user.findMany({ where: { isActive: true } }),
    prisma.target.findFirst({ where: { title: { contains: 'giải ngân vốn đầu tư công', mode: 'insensitive' }, kind: { not: 'TASK' } } }),
    prisma.sourceDocument.findFirst({ where: { docNumber: '333/QĐ-UBND' } }),
  ]);
  const leader = users.find(user => user.username === 'chu.tich');
  if (!leader || !departments.length) throw new Error('Cần nạp bộ dữ liệu mẫu trước');
  let created = 0;
  for (const definition of definitions) {
    const issuedDate = definition.source && source?.issuedDate ? source.issuedDate : parsePlanningDueDate(definition.issued);
    const framework = await prisma.framework.upsert({ where: { code: definition.code }, update: {}, create: {
      code: definition.code, name: definition.name, kind: 'TASK', year: issuedDate.getUTCFullYear(), directiveKind: definition.kind,
      docNumber: definition.number, issuedDate, issuer: definition.source ? source?.issuedBy ?? 'UBND Thành phố Hồ Chí Minh' : 'UBND phường Lái Thiêu',
      signer: definition.source ? null : leader.fullName, legalBasis: definition.number,
      sourceDocumentId: definition.source ? source?.id : null, sortOrder: 600,
    } });
    for (const [index, [title, departmentCode]] of definition.tasks.entries()) {
      const code = `${definition.code}-${index + 1}`;
      if (await prisma.target.count({ where: { code } })) continue;
      const department = departments.find(item => item.code === departmentCode)!;
      const assignee = users.find(user => user.departmentId === department.id && user.role === 'STAFF') ?? users.find(user => user.departmentId === department.id && user.role === 'MANAGER');
      const due = ['2026-10-25', '2026-10-31', '2026-11-20', '2026-11-10', '2026-11-15', '2026-12-15'][index];
      const value = [100, 100, 55, 35, 0, 0][index];
      const reported = ['2026-10-23', '2026-11-03', '2026-11-08', '2026-11-06'][index];
      const createdAt = new Date('2026-10-15T02:00:00Z');
      const dueDate = parsePlanningDueDate(due);
      const lastReportedAt = reported ? new Date(`${reported}T08:30:00+07:00`) : null;
      const metric = evaluateTarget({ currentValue: value, targetValue: 100, dueDate, kind: 'TASK', hasReport: Boolean(lastReportedAt) });
      await prisma.$transaction(async tx => {
        const task = await tx.target.create({ data: {
          code, title, unit: '%', kind: 'TASK', frameworkId: framework.id, year: framework.year!, targetValue: 100, currentValue: value,
          dueDate, departmentId: department.id, assigneeId: index === 5 ? null : assignee?.id, assignedAt: index === 5 ? null : createdAt,
          assignedById: index === 5 ? null : leader.id, ordinal: String(index + 1), sortOrder: (index + 1) * 10,
          dispatchedById: leader.id, dispatchedByName: leader.fullName, dispatchedAt: createdAt, lastReportedAt, status: metric.status,
          legalBasis: definition.number, sourceDocumentId: framework.sourceDocumentId, createdAt,
          relatedTargetId: definition.code === 'VBCD-2026-TB128' && index === 0 ? relatedTarget?.id : null,
          coordinators: index === 0 ? { create: departments.filter(item => item.code === 'VP' && item.id !== department.id).map(item => ({ departmentId: item.id })) } : undefined,
        } });
        if (lastReportedAt && assignee) await tx.progressUpdate.create({ data: {
          id: `${code}-REPORT`, targetId: task.id, userId: assignee.id, value, periodKey: null, reviewStatus: 'APPROVED',
          reviewedBy: leader.id, reviewedAt: new Date(lastReportedAt.getTime() + 86_400_000), createdAt: lastReportedAt,
          note: value === 100 ? 'Đã hoàn thành nội dung được giao; kết quả đã được tổng hợp vào báo cáo của phòng.' : 'Đã hoàn thành rà soát bước đầu, đang tổng hợp hồ sơ và phối hợp các đơn vị để xử lý phần việc còn lại.',
        } });
        await tx.workEvent.create({ data: { targetId: task.id, action: 'TARGET_CREATED', actorId: leader.id, actorName: leader.fullName, departmentId: department.id, createdAt, note: 'Giao nhiệm vụ theo văn bản chỉ đạo' } });
      });
      created++;
    }
  }
  console.log(`Đã bổ sung ${created} nhiệm vụ; bộ minh họa có 5 văn bản và 30 nhiệm vụ.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
