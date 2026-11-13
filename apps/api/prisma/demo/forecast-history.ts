import type { PrismaClient } from '@prisma/client';

/** Hai năm MÔ PHỎNG để trình diễn đường huấn luyện; không phải số liệu thực tế của địa phương. */
export async function seedForecastHistory(prisma: PrismaClient) {
  const names = ['Thu ngân sách nhà nước', 'Giải ngân vốn đầu tư công', 'Hộ dân sử dụng nước sạch', 'Hồ sơ giải quyết đúng hạn', 'Tuyến đường được chỉnh trang', 'Thu gom chất thải sinh hoạt', 'Hộ kinh doanh đăng ký mới', 'Người dân tham gia bảo hiểm y tế'];
  const rows = [];
  for (const year of [2024, 2025]) for (let indicator = 0; indicator < 32; indicator++) {
    const success = indicator % 2 === 0, ratio = indicator % 4 === 2, lower = indicator % 8 === 3;
    const targetValue = lower ? 5 : ratio ? 90 : 1000 + indicator * 25;
    for (let month = 1; month <= 12; month++) {
      const elapsed = month / 12, wobble = Math.sin(month + indicator) * 0.015;
      const value = lower ? (success ? 12 - elapsed * 8 : 12 - elapsed * 3)
        : ratio ? 45 + elapsed * (success ? 50 : 28) + wobble
          : targetValue * elapsed * (success ? 1.08 + (indicator % 5) * 0.025 : 0.52 + (indicator % 5) * 0.035) * (1 + wobble);
      rows.push({ seriesKey: `mo-phong-du-bao-${String(indicator + 1).padStart(2, '0')}`, year,
        title: `${names[indicator % names.length]} – kịch bản mô phỏng ${indicator + 1}`, periodKey: `${year}-M${String(month).padStart(2, '0')}`,
        value: Math.round(value * 100) / 100, targetValue, unit: ratio || lower ? '%' : 'Đơn vị', direction: lower ? 'LOWER_IS_BETTER' as const : 'HIGHER_IS_BETTER' as const,
        kind: 'PLAN' as const, frequency: 'MONTHLY' as const, reportedAt: new Date(Date.UTC(year, month - 1, success ? 15 : indicator % 3 === 0 ? 25 : 19, 8)),
        dueDate: new Date(Date.UTC(year, 11, 31, 16, 59, 59, 999)), simulated: true, source: 'MÔ PHỎNG – kiểm thử mô hình, không phải số liệu thực tế' });
    }
  }
  const result = await prisma.forecastHistory.createMany({ data: rows, skipDuplicates: true });
  return { imported: result.count, simulated: true, years: [2024, 2025] };
}
