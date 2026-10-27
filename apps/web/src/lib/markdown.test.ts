import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdown, type Inline } from './markdown';

function flat(inlines: Inline[]): string {
  return inlines.map(inline => ('children' in inline ? flat(inline.children) : inline.text)).join('');
}

test('markdown: đề mục, đoạn văn, chữ đậm, nghiêng, mã', () => {
  const blocks = parseMarkdown('# Tiêu đề\nDòng **đậm** và _nghiêng_ với `mã`');
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'paragraph');
  if (blocks[1].type !== 'paragraph') return;
  assert.deepEqual(blocks[1].inlines.map(inline => inline.type), ['text', 'bold', 'text', 'italic', 'text', 'code']);
  assert.equal(flat(blocks[1].inlines), 'Dòng đậm và nghiêng với mã');
});

test('markdown: liên kết chỉ nhận http(s) và đường dẫn nội bộ', () => {
  const unsafe = parseMarkdown('[bấm](javascript:alert(1))')[0];
  assert.ok(unsafe.type === 'paragraph');
  if (unsafe.type !== 'paragraph') return;
  assert.ok(unsafe.inlines.every(inline => inline.type !== 'link'));
  const safe = parseMarkdown('[DVC](https://dichvucong.gov.vn) và [chỉ tiêu](/admin/targets)')[0];
  if (safe.type !== 'paragraph') return assert.fail('không phải đoạn văn');
  const links = safe.inlines.filter(inline => inline.type === 'link');
  assert.deepEqual(links.map(link => (link.type === 'link' ? [link.href, link.external] : null)), [['https://dichvucong.gov.vn', true], ['/admin/targets', false]]);
});

test('markdown: danh sách và ô đánh dấu', () => {
  const [list] = parseMarkdown('- [x] Xong\n- [ ] Chưa\n- Thường');
  assert.equal(list.type, 'list');
  if (list.type !== 'list') return;
  assert.deepEqual(list.items.map(item => [item.checked, flat(item.inlines)]), [[true, 'Xong'], [false, 'Chưa'], [null, 'Thường']]);
});

test('markdown: thẻ HTML hiện nguyên văn, không thành thẻ', () => {
  const [block] = parseMarkdown('<img src=x onerror=alert(1)>');
  assert.ok(block.type === 'paragraph');
  if (block.type !== 'paragraph') return;
  assert.equal(flat(block.inlines), '<img src=x onerror=alert(1)>');
});
