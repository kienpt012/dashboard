import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

// Thành phần vẽ của từng loại widget, tải lười theo nhóm. Khai báo (kích thước, cài đặt) nằm ở sổ widget phía máy chủ.

type Loader = () => Promise<Record<string, ComponentType>>;

function from(loader: Loader, name: string): LazyExoticComponent<ComponentType> {
  return lazy(() => loader().then(module => ({ default: module[name] })));
}

export const WIDGET_COMPONENTS: Record<string, LazyExoticComponent<ComponentType>> = {};

export function registerGroup(loader: Loader, names: Record<string, string>) {
  for (const [type, name] of Object.entries(names)) WIDGET_COMPONENTS[type] = from(loader, name);
}
