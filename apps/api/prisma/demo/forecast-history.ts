import type { PrismaClient } from '@prisma/client';

const SERIES_PREFIX = 'mo-phong-du-bao-';
const SOURCE = 'MÔ PHỎNG – kiểm thử mô hình, không phải số liệu thực tế';
const NAMES = ['Thu ngân sách nhà nước', 'Giải ngân vốn đầu tư công', 'Hộ dân sử dụng nước sạch', 'Hồ sơ giải quyết đúng hạn', 'Tuyến đường được chỉnh trang', 'Thu gom chất thải sinh hoạt', 'Hộ kinh doanh đăng ký mới', 'Người dân tham gia bảo hiểm y tế'];

/** Bộ sinh số giả ngẫu nhiên có hạt giống cố định: chạy lại luôn cho đúng cùng một bộ dữ liệu. */
function seeded(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Một chuỗi 12 tháng của một chỉ tiêu mô phỏng. Mức đạt cuối năm dao động quanh mức giao (78%–122%), nhịp thực hiện mỗi
 * chuỗi một kiểu (dồn đầu năm, đều, dồn cuối năm), có tháng chững lại và có sai số từng tháng — để giữa năm một chỉ tiêu
 * về đích vẫn có thể trông chậm hơn một chỉ tiêu sẽ hụt, đúng như số liệu thật. Vì vậy mô hình không thể đoán trúng tuyệt đối.
 */
export function simulatedSeries(year: number, indicator: number) {
  const random = seeded(year * 1009 + indicator * 7919 + 17);
  const ratio = indicator % 4 === 2;
  const lower = indicator % 8 === 3;
  const finalRatio = 0.78 + 0.44 * random();
  const pace = 0.65 + 1.1 * random();
  const stallAt = random() < 0.3 ? 3 + Math.floor(random() * 6) : 0;
  const diligent = random() < (finalRatio >= 1 ? 0.8 : 0.45);
  const targetValue = lower ? 5 : ratio ? 90 : 1000 + indicator * 25;
  const start = lower ? 12 : ratio ? targetValue * (0.42 + 0.16 * random()) : 0;
  const end = lower ? targetValue * (2 - finalRatio) : ratio ? Math.min(100, targetValue * finalRatio) : targetValue * finalRatio;

  let progress = 0;
  let previous = start;
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const planned = (month / 12) ** pace;
    // Tháng chững: không tiến thêm; hai tháng sau bù dần.
    const step = month === stallAt || month === stallAt + 1 ? progress : planned;
    progress = month === 12 ? 1 : Math.max(progress, step);
    const noise = month === 12 ? 0 : (random() - 0.5) * 0.05;
    let value = start + (end - start) * Math.min(1, Math.max(0, progress + noise));
    // Số cộng dồn không giảm; chỉ tiêu "càng thấp càng tốt" thì không tăng lại.
    if (!ratio && !lower) value = Math.max(previous, value);
    if (lower) value = Math.min(previous, value);
    previous = value;
    const day = Math.min(27, (diligent ? 11 : 17) + Math.floor(random() * (diligent ? 6 : 10)));
    return {
      seriesKey: `${SERIES_PREFIX}${String(indicator + 1).padStart(2, '0')}`, year,
      title: `${NAMES[indicator % NAMES.length]} – kịch bản mô phỏng ${indicator + 1}`,
      periodKey: `${year}-M${String(month).padStart(2, '0')}`,
      value: round2(value), targetValue, unit: ratio || lower ? '%' : 'Đơn vị',
      direction: lower ? 'LOWER_IS_BETTER' as const : 'HIGHER_IS_BETTER' as const,
      kind: 'PLAN' as const, frequency: 'MONTHLY' as const,
      reportedAt: new Date(Date.UTC(year, month - 1, day, 8)),
      dueDate: new Date(Date.UTC(year, 11, 31, 16, 59, 59, 999)), simulated: true, source: SOURCE,
    };
  });
}

/** Hai năm MÔ PHỎNG để trình diễn đường huấn luyện; không phải số liệu thực tế của địa phương. Chạy lại thay bộ cũ. */
export async function seedForecastHistory(prisma: PrismaClient) {
  const rows = [2024, 2025].flatMap(year => Array.from({ length: 32 }, (_, indicator) => simulatedSeries(year, indicator)).flat());
  const [, result] = await prisma.$transaction([
    prisma.forecastHistory.deleteMany({ where: { simulated: true, seriesKey: { startsWith: SERIES_PREFIX } } }),
    prisma.forecastHistory.createMany({ data: rows }),
  ]);
  return { imported: result.count, simulated: true, years: [2024, 2025] };
}
