-- D-022: bảng có cấu trúc hàng/cột được code đọc từng hàng theo hàng tiêu đề, không gọi Qwen.
-- Đề xuất tạo theo cách này mang phương thức TABLE để người duyệt và thống kê phân biệt với Qwen và bộ luật.
ALTER TYPE "ExtractionMethod" ADD VALUE IF NOT EXISTS 'TABLE';
