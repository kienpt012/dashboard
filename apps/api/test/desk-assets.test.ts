import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { processImage, sniffImage } from '../src/desk/assets';
import { DeskConfigError } from '../src/desk/validate';

function png(width: number, height: number) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2563eb';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(0, 0, width / 2, height / 2);
  return canvas.encode('png');
}

const isWebp = (buffer: Buffer) => buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP';

test('ảnh nền: ảnh lớn thu về cạnh dài 2560, mã hoá lại WebP, ảnh xem trước cạnh dài 480', async () => {
  const result = await processImage(await png(3000, 1500));
  assert.equal(result.width, 2560);
  assert.equal(result.height, 1280);
  assert.ok(isWebp(result.bytes), 'ảnh chính phải là WebP');
  assert.ok(isWebp(result.thumb), 'ảnh xem trước phải là WebP');
  const thumb = await loadImage(result.thumb);
  assert.equal(thumb.width, 480);
  assert.equal(thumb.height, 240);
});

test('ảnh nền: ảnh nhỏ giữ nguyên kích thước', async () => {
  const result = await processImage(await png(800, 600));
  assert.equal(result.width, 800);
  assert.equal(result.height, 600);
});

test('ảnh nền: nhận diện loại ảnh theo byte đầu, không theo đuôi tệp', () => {
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'jpeg');
  assert.equal(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'webp');
  assert.equal(sniffImage(Buffer.from('%PDF-1.7')), null);
  assert.equal(sniffImage(Buffer.from('GIF89a')), null);
});

test('ảnh nền: ảnh khai báo quá 40 triệu điểm ảnh bị từ chối trước khi giải mã', async () => {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'latin1');
  header.writeUInt32BE(30000, 16);
  header.writeUInt32BE(30000, 20);
  await assert.rejects(processImage(header), (error: unknown) => error instanceof DeskConfigError && /quá lớn/.test(error.message));
});

test('ảnh nền: tệp không phải ảnh hoặc ảnh hỏng bị từ chối', async () => {
  await assert.rejects(processImage(Buffer.from('GIF89a................')), DeskConfigError);
  const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('không phải dữ liệu ảnh')]);
  await assert.rejects(processImage(broken), DeskConfigError);
});
