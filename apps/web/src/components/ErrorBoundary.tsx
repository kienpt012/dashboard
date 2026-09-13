import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Lưới an toàn cuối cùng của giao diện.
 *
 *  Một lỗi khi dựng cây React sẽ gỡ toàn bộ cây và để lại màn hình trắng — người
 *  dùng không biết chuyện gì xảy ra, không biết dữ liệu vừa nhập còn hay mất, và
 *  không có đường nào đi tiếp. Thành phần này giữ lại một màn hình có lời giải
 *  thích và hai lối thoát.
 *
 *  Đặt ở hai tầng: ngoài cùng ứng dụng (bắt mọi thứ) và quanh vùng nội dung của
 *  khu quản trị (một màn hình hỏng thì thanh điều hướng vẫn còn để đi nơi khác).
 */

type Props = {
  children: ReactNode;
  /** Đổi giá trị này để bảng lỗi tự đóng — ví dụ truyền đường dẫn hiện tại. */
  resetKey?: string;
  /** Đặt true khi khối này nằm trong vỏ quản trị, để không vẽ lại nền toàn trang. */
  inline?: boolean;
};

type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Ghi ra bảng điều khiển để cán bộ kỹ thuật còn lần được nguyên nhân.
    // Không gửi đi đâu: nội dung màn hình có thể chứa dữ liệu công dân.
    console.error('[IOC] Giao diện gặp lỗi không xử lý được:', error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className={`state-page${this.props.inline ? '' : ' state-page-full'}`} role="alert">
        <div className="state-card">
          <div aria-hidden="true">
            <AlertOctagon />
          </div>
          <h3>Màn hình này gặp sự cố</h3>
          <p>
            Giao diện đã dừng lại để tránh hiển thị sai số liệu. Dữ liệu trên máy chủ không bị ảnh hưởng bởi sự cố
            này. Bạn có thể tải lại màn hình; nếu vẫn lỗi, vui lòng báo bộ phận kỹ thuật kèm thời điểm gặp lỗi.
          </p>
          <div className="state-actions">
            <button type="button" className="btn primary" onClick={() => window.location.reload()}>
              <RefreshCw />
              Tải lại màn hình
            </button>
            <button type="button" className="btn secondary" onClick={() => this.setState({ error: null })}>
              Thử hiển thị lại
            </button>
          </div>
          <details className="state-detail">
            <summary>Chi tiết kỹ thuật</summary>
            <code>{error.message}</code>
          </details>
        </div>
      </div>
    );
  }
}
