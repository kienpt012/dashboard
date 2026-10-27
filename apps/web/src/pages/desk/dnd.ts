// Kéo widget từ kho thả vào lưới: trong lúc kéo trình duyệt không cho đọc dữ liệu kéo, nên giữ loại widget ở đây.

export const WIDGET_MIME = 'application/x-ioc-widget';

let current: string | null = null;

export const widgetDrag = {
  start(type: string) {
    current = type;
  },
  end() {
    current = null;
  },
  get type() {
    return current;
  },
};
