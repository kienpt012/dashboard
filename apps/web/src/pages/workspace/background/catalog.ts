/** Local SVG wallpapers; no image host or network connection is needed. */
export const EXTRA_WALLPAPERS = [
  { id: 'gom', name: 'Men gốm Lái Thiêu', caption: 'Men ngọc, nét lam và hoa gốm quê nhà' },
  { id: 'trong-dong', name: 'Trống đồng', caption: 'Ánh đồng trầm và nhịp hoa văn Việt' },
  { id: 'dem-sao', name: 'Đêm sao', caption: 'Một dải ngân hà cho giờ tập trung' },
  { id: 'rung-tram', name: 'Rừng tràm', caption: 'Tán xanh, thân mảnh và sương nhẹ' },
  { id: 'sen', name: 'Sen thanh', caption: 'Nét sen hồng trên mặt hồ xanh thẫm' },
  { id: 'dia-hinh', name: 'Đường đồng mức', caption: 'Những đường núi như một bản đồ đêm' },
  { id: 'binh-minh', name: 'Bình minh', caption: 'Ánh nắng đầu ngày trên miền đồi xa' },
] as const;

export type ExtraWallpaperId = (typeof EXTRA_WALLPAPERS)[number]['id'];
