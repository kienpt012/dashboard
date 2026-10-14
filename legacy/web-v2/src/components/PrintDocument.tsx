import type { ReactNode } from 'react';
import { auth } from '../api';
import { useLocality } from '../locality';

// Bản in theo thể thức văn bản hành chính (Nghị định 30/2020/NĐ-CP): tên cơ quan – Quốc hiệu, Tiêu ngữ – địa danh,
// ngày tháng – tên loại và trích yếu – nội dung – chữ ký. Chỉ hiện khi in; giao diện màn hình bọc trong .screen-only.

type Signer = { title: string; name?: string };

function agencyLines(agencyName: string) {
  const name = agencyName.trim().replace(/^UBND\s+/i, 'Ủy ban nhân dân ');
  const match = /^(Ủy ban nhân dân)\s+(.+)$/i.exec(name);
  return match ? [match[1].toUpperCase(), match[2].toUpperCase()] : [name.toUpperCase()];
}

function dateLine(place: string, at: Date) {
  const day = String(at.getDate()).padStart(2, '0');
  const month = at.getMonth() + 1;
  return `${place ? `${place}, ` : ''}ngày ${day} tháng ${month < 3 ? String(month).padStart(2, '0') : month} năm ${at.getFullYear()}`;
}

export default function PrintDocument({
  kind,
  title,
  subtitle,
  orientation = 'portrait',
  signers,
  at = new Date(),
  children,
}: {
  /** Tên loại: "PHỤ LỤC", "BÁO CÁO"… */
  kind: string;
  /** Trích yếu nội dung. */
  title: string;
  subtitle?: string;
  orientation?: 'portrait' | 'landscape';
  signers?: Signer[];
  at?: Date;
  children: ReactNode;
}) {
  const locality = useLocality();
  const lines = agencyLines(locality.configured ? locality.agencyName : 'Cơ quan');
  const place = locality.configured ? locality.shortName : '';
  const people = signers ?? [
    { title: 'NGƯỜI LẬP BIỂU', name: auth.user?.fullName },
    { title: 'THỦ TRƯỞNG ĐƠN VỊ' },
  ];

  return (
    <article className={`print-doc print-only ${orientation === 'landscape' ? 'landscape' : ''}`}>
      <header className="print-doc-head">
        <div className="print-doc-agency">
          {lines.map((line, index) => (
            <strong key={line} className={index === lines.length - 1 ? 'underline' : undefined}>{line}</strong>
          ))}
        </div>
        <div className="print-doc-nation">
          <strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong>
          <strong className="underline">Độc lập - Tự do - Hạnh phúc</strong>
          <em>{dateLine(place, at)}</em>
        </div>
      </header>
      <div className="print-doc-title">
        <strong>{kind}</strong>
        <strong>{title}</strong>
        {subtitle && <em>{subtitle}</em>}
      </div>
      <div className="print-doc-body">{children}</div>
      <footer className="print-doc-sign">
        {people.map(person => (
          <div key={person.title}>
            <strong>{person.title}</strong>
            <em>(Ký, ghi rõ họ tên)</em>
            <span className="print-doc-sign-space" />
            {person.name && <strong>{person.name}</strong>}
          </div>
        ))}
      </footer>
    </article>
  );
}
