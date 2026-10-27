import { createContext, useContext } from 'react';
import type { WidgetDefinition, WidgetInstance } from '../types';

// Ngữ cảnh của một widget đang vẽ: cấu hình, khai báo, phòng đang xem đã giải, năm, chu kỳ làm mới, đang phóng to hay
// đang tùy biến. Thành phần vẽ widget đọc qua useWidget().

export interface WidgetContextValue {
  widget: WidgetInstance;
  def: WidgetDefinition;
  spaceId: string;
  /** Phòng của widget: cài đặt riêng → phòng đang xem của không gian → phòng của người dùng. */
  departmentId: string | null;
  year: number;
  refreshMs: number;
  maximized: boolean;
  editing: boolean;
  /** Đổi cài đặt widget (tự lưu, hoàn tác được). */
  setSettings: (patch: Record<string, unknown>, coalesce?: string) => void;
  /** Mở ngăn cài đặt của widget (widget chưa cấu hình mời người dùng chọn). */
  openSettings: () => void;
}

export const WidgetContext = createContext<WidgetContextValue | null>(null);

export function useWidget(): WidgetContextValue {
  const value = useContext(WidgetContext);
  if (!value) throw new Error('useWidget phải nằm trong khung widget');
  return value;
}

/** Cài đặt kiểu chặt của widget (giá trị đã được máy chủ chuẩn hoá theo khai báo). */
export function useSettings<T extends Record<string, unknown>>(): T {
  return useWidget().widget.settings as T;
}
