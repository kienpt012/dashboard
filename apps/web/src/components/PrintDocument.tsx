import { PrinterOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { agencyLines, useLocality } from '@/app/locality';
import { useUser } from '@/app/session';

// Văn bản in theo thể thức hành chính: tên cơ quan – Quốc hiệu, Tiêu ngữ – địa danh, ngày tháng – tên loại, trích yếu –
// nội dung – chữ ký. Dựng sẵn ngoài #root, chỉ hiện khi in.

type Signer = { title: string; name?: string };

function dateLine(place: string, at: Date) {
  const day = String(at.getDate()).padStart(2, '0');
  const month = at.getMonth() + 1;
  return `${place ? `${place}, ` : ''}ngày ${day} tháng ${month < 3 ? String(month).padStart(2, '0') : month} năm ${at.getFullYear()}`;
}

export function PrintDocument({
  kind,
  title,
  subtitle,
  orientation = 'portrait',
  signers,
  at,
  children,
}: {
  /** Tên loại: "PHỤ LỤC", "BÁO CÁO"… */
  kind: string;
  /** Trích yếu. */
  title: string;
  subtitle?: string;
  orientation?: 'portrait' | 'landscape';
  signers?: Signer[];
  at?: Date;
  children: ReactNode;
}) {
  const locality = useLocality();
  const user = useUser();
  const lines = agencyLines(locality);
  const place = locality.configured ? locality.shortName || locality.name : '';
  const people = signers ?? [{ title: 'NGƯỜI LẬP BIỂU', name: user?.fullName }, { title: 'THỦ TRƯỞNG ĐƠN VỊ' }];

  useEffect(() => {
    document.body.classList.add('has-print-doc');
    return () => document.body.classList.remove('has-print-doc');
  }, []);

  return createPortal(
    <div className="print-root">
      <article className={`print-doc${orientation === 'landscape' ? ' landscape' : ''}`}>
        <header className="print-doc-head">
          <div className="print-doc-agency">
            {lines.map((line, index) => (
              <span key={line} className={index === lines.length - 1 ? 'underline' : undefined}>
                {line}
              </span>
            ))}
          </div>
          <div className="print-doc-nation">
            <span>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</span>
            <span className="underline">Độc lập - Tự do - Hạnh phúc</span>
            <em>{dateLine(place, at ?? new Date())}</em>
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
    </div>,
    document.body,
  );
}

export function PrintButton({ label = 'In' }: { label?: string }) {
  return (
    <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
      {label}
    </Button>
  );
}
