import { useQuery } from '@tanstack/react-query';
import { http } from '@/lib/api';

// Hồ sơ địa phương: tên đơn vị, tên ứng dụng, màu thương hiệu. Không viết cứng tên địa phương nào trong giao diện.

export type PublicLocality = {
  configured: boolean;
  kind: string;
  kindLabel: string;
  name: string;
  agencyName: string;
  shortName: string;
  brandName: string;
  provinceName?: string | null;
  adminUnitCode?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  primaryColor: string;
};

const FALLBACK: PublicLocality = {
  configured: false,
  kind: 'PHUONG',
  kindLabel: 'Phường',
  name: 'Đơn vị chưa thiết lập',
  agencyName: 'Ủy ban nhân dân',
  shortName: '',
  brandName: 'IOC',
  primaryColor: '#1d4ed8',
};
const CACHE_KEY = 'ioc_locality';

function cached(): PublicLocality {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...FALLBACK, ...JSON.parse(raw) } : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export const LOCALITY_KEY = ['/public/locality'];

export function useLocality(): PublicLocality {
  const { data } = useQuery({
    queryKey: LOCALITY_KEY,
    queryFn: async () => {
      const value = { ...FALLBACK, ...(await http.get<PublicLocality>('/public/locality')) };
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(value));
      } catch {
        /* bỏ qua */
      }
      return value;
    },
    placeholderData: cached,
    staleTime: 10 * 60_000,
  });
  return data ?? FALLBACK;
}

/** Hai chữ cái đại diện: "Lái Thiêu" → "LT". */
export function localityInitials(locality: PublicLocality) {
  const words = (locality.shortName || locality.name).trim().split(/\s+/).filter(Boolean);
  return (words.length >= 2 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? 'IO').slice(0, 2)).toUpperCase();
}

/** "UBND phường Lái Thiêu" → ["ỦY BAN NHÂN DÂN", "PHƯỜNG LÁI THIÊU"] cho phần đầu văn bản. */
export function agencyLines(locality: PublicLocality) {
  const raw = (locality.agencyName || '').trim();
  const match = /^(UBND|Ủy ban nhân dân|Uỷ ban nhân dân)\s+(.+)$/i.exec(raw);
  if (match) return ['ỦY BAN NHÂN DÂN', match[2].toUpperCase()];
  if (locality.configured) return ['ỦY BAN NHÂN DÂN', `${locality.kindLabel} ${locality.name}`.toUpperCase()];
  return [raw.toUpperCase() || 'ỦY BAN NHÂN DÂN'];
}
