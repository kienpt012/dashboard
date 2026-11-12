-- Thêm loại văn bản để tự nhận dạng theo số ký hiệu (Nghị định 30/2020/NĐ-CP) và chọn hồ sơ xử lý theo loại.
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'NGHI_DINH';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'THONG_TU';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'CHI_THI';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'CHUONG_TRINH';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'THONG_BAO';
