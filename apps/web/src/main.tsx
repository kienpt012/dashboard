import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { enableMotion } from './motion';
import { startScrollHints } from './scroll-hint';
import './styles/index.css';

// Chỉ bật lớp hoạt hoạ sau khi kịch bản đã chạy được. Nếu nó hỏng, CSS không ẩn
// gì cả và người dùng vẫn thấy toàn bộ nội dung.
enableMotion();
startScrollHints();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
);
