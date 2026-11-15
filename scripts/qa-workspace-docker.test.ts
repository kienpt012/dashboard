import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import test from 'node:test';

// Image web chỉ chép apps/web vào bước dựng. Tệp nào của máy chủ mà giao diện nhập trực tiếp thì phải được chép riêng
// trong apps/web/Dockerfile, nếu không bản dựng trên máy và CI vẫn xanh nhưng `docker compose build` hỏng.

const root = resolve(__dirname, '..');
const webSrc = join(root, 'apps', 'web', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test('mọi tệp ngoài apps/web mà giao diện nhập đều được chép vào image web', () => {
  const dockerfile = readFileSync(join(root, 'apps', 'web', 'Dockerfile'), 'utf8');
  const outside = new Set<string>();
  for (const file of sourceFiles(webSrc)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const target = resolve(dirname(file), match[1]);
      const fromWeb = relative(join(root, 'apps', 'web'), target);
      if (fromWeb.startsWith('..')) outside.add(relative(root, target).split('\\').join(posix.sep));
    }
  }
  assert.ok(outside.size > 0, 'giao diện đang dùng chung bộ kiểm tra cấu hình với máy chủ');
  for (const path of outside) {
    const withExtension = `${path}.ts`;
    assert.ok(
      dockerfile.includes(`COPY ${withExtension} ${withExtension}`),
      `apps/web/Dockerfile thiếu dòng: COPY ${withExtension} ${withExtension}`,
    );
  }
});
