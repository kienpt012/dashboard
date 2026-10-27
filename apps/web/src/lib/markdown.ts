// Markdown gọn cho khối chữ và sổ ghi chú: đề mục, đậm, nghiêng, mã, liên kết, danh sách, ô đánh dấu, đường kẻ.
// Kết quả là cây dữ liệu để React vẽ thành phần tử — không bao giờ chèn HTML thô, nên thẻ <script>, <img onerror> chỉ
// hiện như chữ.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'link'; href: string; external: boolean; children: Inline[] };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; items: { checked: boolean | null; inlines: Inline[] }[] }
  | { type: 'rule' };

const INTERNAL = /^\/(admin|trinh-chieu|phan-anh)([/?#]|$)/;

function safeHref(href: string): { href: string; external: boolean } | null {
  const value = href.trim();
  if (INTERNAL.test(value) && !value.includes('..')) return { href: value, external: false };
  try {
    const url = new URL(value);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return { href: value, external: true };
  } catch {
    // không phải URL đầy đủ
  }
  return null;
}

const TOKEN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(_[^_\n]+_)|(\*[^*\n]+\*)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const match = TOKEN.exec(rest);
    if (!match) {
      out.push({ type: 'text', text: rest });
      break;
    }
    if (match.index > 0) out.push({ type: 'text', text: rest.slice(0, match.index) });
    const token = match[0];
    if (match[1]) out.push({ type: 'code', text: token.slice(1, -1) });
    else if (match[2]) out.push({ type: 'bold', children: parseInline(token.slice(2, -2)) });
    else if (match[3]) {
      const label = token.slice(1, token.indexOf(']('));
      const target = safeHref(token.slice(token.indexOf('](') + 2, -1));
      if (target) out.push({ type: 'link', ...target, children: parseInline(label) });
      else out.push({ type: 'text', text: label });
    } else out.push({ type: 'italic', children: parseInline(token.slice(1, -1)) });
    rest = rest.slice(match.index + token.length);
  }
  return out.filter(inline => inline.type !== 'text' || inline.text.length > 0);
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { checked: boolean | null; inlines: Inline[] }[] | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inlines: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.length) blocks.push({ type: 'list', items: list });
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const item = /^\s*[-*+]\s+(?:\[( |x|X)\]\s+)?(.*)$/.exec(line);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'rule' });
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, inlines: parseInline(heading[2]) });
    } else if (item) {
      flushParagraph();
      list ??= [];
      list.push({ checked: item[1] === undefined ? null : item[1].toLowerCase() === 'x', inlines: parseInline(item[2]) });
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
