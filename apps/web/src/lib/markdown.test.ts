import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarkdown, toggleCheck, type Inline } from './markdown';

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

test('markdown: chặn thông tin đăng nhập, URL tương đối khác giao thức và ký tự đổi cách hiểu URL', () => {
  for (const target of ['javascript:alert(1)', 'data:text/html,hello', '//example.com', 'https://user:pass@example.com', '/admin/../logout', '/admin/\\example.com', 'https://good.test\\@evil.test']) {
    const block = parseMarkdown(`[mở](${target})`)[0];
    assert.equal(block.type, 'paragraph');
    if (block.type !== 'paragraph') continue;
    assert.ok(block.inlines.every(inline => inline.type !== 'link'), target);
  }
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

test('bấm ô đánh dấu thứ n đổi đúng dòng nguồn, bỏ qua mục danh sách thường và dòng kẻ', () => {
  const source = '# Việc\n- mục thường\n- [ ] gọi điện\n---\n* [x] gửi công văn\n  - [ ] họp giao ban';
  assert.equal(toggleCheck(source, 0), '# Việc\n- mục thường\n- [x] gọi điện\n---\n* [x] gửi công văn\n  - [ ] họp giao ban');
  assert.equal(toggleCheck(source, 1), '# Việc\n- mục thường\n- [ ] gọi điện\n---\n* [ ] gửi công văn\n  - [ ] họp giao ban');
  assert.equal(toggleCheck(source, 2), '# Việc\n- mục thường\n- [ ] gọi điện\n---\n* [x] gửi công văn\n  - [x] họp giao ban');
  assert.equal(toggleCheck(source, 3), source);
});

test('ô đánh dấu giữ nguyên xuống dòng Windows và phần còn lại của ghi chú', () => {
  const source = '# Giao ban\r\n- [ ] **Gửi báo cáo**\r\nGhi chú riêng\r\n';
  const checked = toggleCheck(source, 0);
  assert.equal(checked, '# Giao ban\r\n- [x] **Gửi báo cáo**\r\nGhi chú riêng\r\n');
  assert.equal(toggleCheck(checked, 0), source);
  assert.equal(toggleCheck(source, -1), source);
});
