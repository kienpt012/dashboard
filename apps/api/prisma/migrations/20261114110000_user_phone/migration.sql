-- Số di động của tài khoản, dùng cho kênh tin nhắn khi khôi phục mật khẩu (G-41).
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
