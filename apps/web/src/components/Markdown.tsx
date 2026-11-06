import { CheckSquareOutlined, BorderOutlined } from '@ant-design/icons';
import { Fragment, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { parseMarkdown, type Inline } from '@/lib/markdown';

// Vẽ Markdown gọn (lib/markdown.ts) thành phần tử React — không dùng innerHTML.

function renderInline(inline: Inline, key: number): ReactNode {
  switch (inline.type) {
    case 'text':
      return <Fragment key={key}>{inline.text}</Fragment>;
    case 'code':
      return <code key={key}>{inline.text}</code>;
    case 'bold':
      return <strong key={key}>{inline.children.map(renderInline)}</strong>;
    case 'italic':
      return <em key={key}>{inline.children.map(renderInline)}</em>;
    case 'link':
      return inline.external ? (
        <a key={key} href={inline.href} target="_blank" rel="noopener noreferrer">
          {inline.children.map(renderInline)}
        </a>
      ) : (
        <Link key={key} to={inline.href}>
          {inline.children.map(renderInline)}
        </Link>
      );
  }
}

/** `onToggle`: bấm ô đánh dấu thứ n (đếm theo thứ tự hiện) — sổ ghi chú dùng để đánh dấu xong ngay khi đang xem. */
export function Markdown({ text, className, onToggle }: { text: string; className?: string; onToggle?: (index: number) => void }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  let checks = 0;
  return (
    <div className={`md${className ? ` ${className}` : ''}`}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading': {
            const Tag = `h${block.level + 2}` as 'h3' | 'h4' | 'h5';
            return <Tag key={index}>{block.inlines.map(renderInline)}</Tag>;
          }
          case 'paragraph':
            return <p key={index}>{block.inlines.map(renderInline)}</p>;
          case 'rule':
            return <hr key={index} />;
          case 'list':
            return (
              <ul key={index} className={block.items.some(item => item.checked !== null) ? 'md-checks' : undefined}>
                {block.items.map((item, itemIndex) => {
                  const icon = item.checked ? <CheckSquareOutlined /> : <BorderOutlined />;
                  const check = item.checked === null ? -1 : checks++;
                  return (
                    <li key={itemIndex} className={item.checked ? 'done' : undefined}>
                      {item.checked !== null &&
                        (onToggle ? (
                          <button type="button" className="md-check" aria-pressed={item.checked} aria-label={item.checked ? 'Bỏ đánh dấu xong' : 'Đánh dấu xong'} onClick={() => onToggle(check)}>
                            {icon}
                          </button>
                        ) : (
                          icon
                        ))}
                      <span>{item.inlines.map(renderInline)}</span>
                    </li>
                  );
                })}
              </ul>
            );
        }
      })}
    </div>
  );
}
