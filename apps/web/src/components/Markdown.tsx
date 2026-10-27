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

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
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
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className={item.checked ? 'done' : undefined}>
                    {item.checked !== null && (item.checked ? <CheckSquareOutlined /> : <BorderOutlined />)}
                    <span>{item.inlines.map(renderInline)}</span>
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </div>
  );
}
