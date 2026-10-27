import { solarToLunar, vietnamDateParts } from './lunar';

// Ngày lễ, ngày kỷ niệm của Việt Nam hiện trên lời chào và lịch của bàn làm việc. `official`: ngày nghỉ theo Bộ luật Lao động.

export interface Holiday {
  name: string;
  official: boolean;
}

const SOLAR: Record<string, Holiday> = {
  '1/1': { name: 'Tết Dương lịch', official: true },
  '3/2': { name: 'Ngày thành lập Đảng Cộng sản Việt Nam', official: false },
  '8/3': { name: 'Ngày Quốc tế Phụ nữ', official: false },
  '26/3': { name: 'Ngày thành lập Đoàn TNCS Hồ Chí Minh', official: false },
  '30/4': { name: 'Ngày Giải phóng miền Nam, thống nhất đất nước', official: true },
  '1/5': { name: 'Ngày Quốc tế Lao động', official: true },
  '19/5': { name: 'Ngày sinh Chủ tịch Hồ Chí Minh', official: false },
  '27/7': { name: 'Ngày Thương binh – Liệt sĩ', official: false },
  '2/9': { name: 'Quốc khánh', official: true },
  '20/10': { name: 'Ngày Phụ nữ Việt Nam', official: false },
  '20/11': { name: 'Ngày Nhà giáo Việt Nam', official: false },
  '22/12': { name: 'Ngày thành lập Quân đội nhân dân Việt Nam', official: false },
};

const LUNAR: Record<string, Holiday> = {
  '1/1': { name: 'Tết Nguyên đán', official: true },
  '2/1': { name: 'Tết Nguyên đán', official: true },
  '3/1': { name: 'Tết Nguyên đán', official: true },
  '15/1': { name: 'Tết Nguyên tiêu (Rằm tháng Giêng)', official: false },
  '10/3': { name: 'Giỗ Tổ Hùng Vương', official: true },
  '15/7': { name: 'Lễ Vu Lan', official: false },
  '15/8': { name: 'Tết Trung thu', official: false },
  '23/12': { name: 'Tết ông Công ông Táo', official: false },
};

export function holidaysOn(date: Date): Holiday[] {
  const solar = vietnamDateParts(date);
  const lunar = solarToLunar(date);
  const list: Holiday[] = [];
  const fromSolar = SOLAR[`${solar.day}/${solar.month}`];
  if (fromSolar) list.push(fromSolar);
  const fromLunar = lunar.leap ? undefined : LUNAR[`${lunar.day}/${lunar.month}`];
  if (fromLunar) list.push(fromLunar);
  return list;
}
