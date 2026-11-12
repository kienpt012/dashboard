import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouter } from './app/router';
import { ThemeProvider } from './app/theme';
import { ApiError, session } from './lib/api';
import './lib/format';
import './styles/global.css';
import './styles/print.css';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

// Đổi người đăng nhập (đăng nhập, đăng xuất, hết phiên) thì bỏ toàn bộ dữ liệu đã đệm của phiên trước.
let lastToken = session.token;
session.subscribe(() => {
  if (session.token === lastToken) return;
  lastToken = session.token;
  client.clear();
});

// Sau khi triển khai bản web mới, trang đang mở vẫn trỏ tới các file JS cũ (tên có mã băm) đã bị thay. Tải lại trang
// một lần để lấy index.html mới; nhớ lần tải lại trong sessionStorage để không lặp vô hạn nếu lỗi do nguyên nhân khác.
window.addEventListener('vite:preloadError', event => {
  const key = 'ioc:reloaded-after-deploy';
  try {
    if (sessionStorage.getItem(key) === location.pathname) return;
    sessionStorage.setItem(key, location.pathname);
  } catch {
    // sessionStorage bị chặn: vẫn tải lại một lần
  }
  event.preventDefault();
  location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <AppRouter />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
