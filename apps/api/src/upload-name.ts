/**
 * Tên tệp tải lên qua multipart: multer (busboy) đọc tên theo latin1 trong khi trình duyệt gửi UTF-8, nên tên tiếng Việt
 * thành "BÃ¡o cÃ¡o.pdf". Đổi lại về UTF-8 khi tên đúng là chuỗi UTF-8 bị đọc nhầm; tên đã đúng Unicode thì giữ nguyên.
 */
export function uploadFileName(name: string | null | undefined): string {
  if (!name) return '';
  // Có ký tự ngoài dải latin1 nghĩa là tên đã được giải mã đúng.
  if (!/[\u0080-\u00ff]/.test(name) || /[^\u0000-\u00ff]/.test(name)) return name.normalize('NFC');
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return (decoded.includes('\uFFFD') ? name : decoded).normalize('NFC');
}
