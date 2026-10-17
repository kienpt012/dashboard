import react from '@vitejs/plugin-react';
import { createReadStream, cpSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// Tài nguyên phụ của pdf.js (bộ giải mã ảnh WASM cho bản scan JBIG2/JPEG 2000, bảng mã CMap, phông chuẩn, hồ sơ màu):
// phục vụ ở /pdfjs/… khi chạy dev và chép vào bản dựng — trình xem PDF trỏ tới đây.
const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const PDFJS_ASSETS = ['wasm', 'cmaps', 'standard_fonts', 'iccs'];
const MIME: Record<string, string> = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.bcmap': 'application/octet-stream' };

function pdfjsAssets(): Plugin {
  let outDir = 'dist';
  return {
    name: 'ioc-pdfjs-assets',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^[\\/]+/, '');
        const [folder] = path.split(/[\\/]/);
        const file = join(PDFJS_ROOT, path);
        if (!PDFJS_ASSETS.includes(folder) || !file.startsWith(PDFJS_ROOT) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      for (const folder of PDFJS_ASSETS) {
        cpSync(join(PDFJS_ROOT, folder), join(outDir, 'pdfjs', folder), { recursive: true, filter: source => !/quickjs/i.test(source) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsAssets()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          echarts: ['echarts'],
        },
      },
    },
  },
});
