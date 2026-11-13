import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { cleanupQaActors, createQaActors } from './qa-actors.mjs';

// Run with the assigned dev DATABASE_URL, QA_API_URL and QA_WEB_URL. No demo user's layout is changed.
const api = process.env.QA_API_URL || 'http://localhost:3101/api';
const web = process.env.QA_WEB_URL || 'http://localhost:5181';
if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL của CSDL QA riêng');
const prisma = new PrismaClient();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
const sockets = [];
let actors, chrome, profile, failure;

async function request(path, token, method = 'GET', body) {
  const response = await fetch(`${api}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000) });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function connect(url) {
  const socket = new WebSocket(url); sockets.push(socket);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  const events = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id); clearTimeout(item.timer); pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    }
    if (message.method) events.get(message.method)?.(message.params);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15_000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  };
  const until = async (expression, label, timeout = 15_000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) { try { if (await evaluate(expression)) return; } catch { /* Navigation may replace the context. */ } await pause(150); }
    throw new Error(`Không đạt: ${label}; UI: ${await evaluate('document.body.innerText.slice(0,1800)')}`);
  };
  events.set('Page.javascriptDialogOpening', () => void send('Page.handleJavaScriptDialog', { accept: true }));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  return { send, evaluate, until, events };
}

function fixture() {
  return {
    schemaVersion: 2, appearance: { wallpaper: 'graphite', customWallpaper: '', accent: '#7ce6c5', blur: 16, overlay: 25, dock: 'hidden' }, activeSpace: 'home', shortcuts: [],
    spaces: [{ id: 'home', name: 'Kiểm tra đồng bộ', widgets: [
      { id: 'notes', type: 'notes', title: 'Ghi chú QA', x: 0, y: 0, w: 6, h: 6, settings: { text: '<img src=x onerror="window.__xss=true">\n[nguy hiểm](javascript:alert(1))\n![ảnh](data:text/html,test)', preview: true } },
      { id: 'embed', type: 'embed', title: 'Trang nhúng QA', x: 6, y: 0, w: 6, h: 6, settings: { url: 'https://example.com' } },
    ] }],
  };
}

const clickText = (text, within = 'document') => `(()=>{const b=[...${within}.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(text)}); if(!b) throw new Error('Thiếu nút '+${JSON.stringify(text)}); b.click(); return true})()`;
const editNote = text => `(()=>{const e=document.querySelector('textarea[aria-label="Nội dung ghi chú"]'); if(!e) throw new Error('Thiếu ô ghi chú'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${JSON.stringify(text)}); e.dispatchEvent(new Event('input',{bubbles:true})); return true})()`;
const isSaved = `document.querySelector('.ws-save')?.textContent.includes('Đã đồng bộ')`;
const isConflict = `document.querySelector('.ws-save')?.textContent.includes('Cần đồng bộ')`;

try {
  actors = await createQaActors(prisma, 'desk-browser');
  const auth = await request('/auth/login', '', 'POST', { username: actors.staff.username, password: actors.password });
  const token = auth.accessToken;
  await request('/workspace', token, 'PUT', { expectedVersion: 1, config: fixture() });
  const port = 9400 + Math.floor(Math.random() * 400);
  profile = mkdtempSync(join(tmpdir(), 'ioc-desk-browser-'));
  chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-popup-blocking', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let pages = [];
  for (let i = 0; i < 60; i++) { try { pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (pages.some(page => page.type === 'page')) break; } catch {} await pause(200); }
  const first = pages.find(page => page.type === 'page'); assert.ok(first, 'Chrome chưa sẵn sàng');
  const a = await connect(first.webSocketDebuggerUrl);
  await a.send('Page.navigate', { url: web });
  await a.until(`location.origin === ${JSON.stringify(new URL(web).origin)} && document.readyState === 'complete'`, 'trang web mở');
  await a.evaluate(`localStorage.setItem('ioc_token',${JSON.stringify(token)});localStorage.setItem('ioc_user',${JSON.stringify(JSON.stringify(auth.user))});true`);
  await a.send('Page.navigate', { url: `${web}/admin` });
  await a.until(`!!document.querySelector('.ws-note-preview') && ${isSaved}`, 'bàn làm việc QA');
  const security = await a.evaluate(`(()=>{const p=document.querySelector('.ws-note-preview');const f=document.querySelector('.ws-widget-embed iframe');return {raw:p.textContent.includes('<img'),dangerous:p.querySelectorAll('img,script,svg,[onerror],[onload],a[href^="javascript:"],a[href^="data:"]').length,xss:!!window.__xss,sandbox:f?.getAttribute('sandbox'),referrer:f?.getAttribute('referrerpolicy'),allow:f?.getAttribute('allow')}})()`);
  assert.deepEqual(security, { raw: true, dangerous: 0, xss: false, sandbox: 'allow-scripts', referrer: 'no-referrer', allow: null });
  checks.push('Markdown thật escape HTML/protocol; iframe sandbox/referrer/permissions đúng');
  await a.evaluate(clickText('Viết', "document.querySelector('.ws-widget-notes')"));
  await a.until(`!!document.querySelector('textarea[aria-label="Nội dung ghi chú"]') && ${isSaved}`, 'chế độ viết đã lưu');
  await pause(1200);
  await a.evaluate(`window.open('/admin', 'qa-duplicate'); true`);
  let second;
  for (let i = 0; i < 50; i++) { pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); second = pages.find(page => page.type === 'page' && page.id !== first.id); if (second) break; await pause(200); }
  assert.ok(second, 'Không nhân đôi được tab');
  const b = await connect(second.webSocketDebuggerUrl);
  await b.until(`!!document.querySelector('textarea[aria-label="Nội dung ghi chú"]') && ${isSaved}`, 'tab thứ hai');
  const tabA = await a.evaluate(`sessionStorage.getItem('ioc_workspace_tab')`);
  const tabB = await b.evaluate(`sessionStorage.getItem('ioc_workspace_tab')`);
  assert.notEqual(tabA, tabB);
  await a.evaluate(editNote('Bản đã lưu từ tab A'));
  await a.until(isSaved, 'tab A lưu'); await pause(1200);
  assert.equal((await request('/workspace', token)).config.spaces[0].widgets[0].settings.text, 'Bản đã lưu từ tab A');
  await b.evaluate(editNote('Bản nháp giữ lại từ tab B'));
  await b.until(isConflict, 'tab B nhận 409');
  assert.equal((await request('/workspace', token)).config.spaces[0].widgets[0].settings.text, 'Bản đã lưu từ tab A');
  assert.equal(await b.evaluate(`JSON.parse(localStorage.getItem('ioc_workspace_draft:'+encodeURIComponent(${JSON.stringify(actors.staff.id)})+':'+sessionStorage.getItem('ioc_workspace_tab'))).config.spaces[0].widgets[0].settings.text`), 'Bản nháp giữ lại từ tab B');
  checks.push('Hai tab có khóa nháp riêng; 409 không ghi đè server và không mất bản nháp');
  await b.send('Page.reload');
  await b.until(isConflict, 'refresh phục hồi xung đột');
  assert.equal(await b.evaluate(`document.querySelector('textarea[aria-label="Nội dung ghi chú"]').value`), 'Bản nháp giữ lại từ tab B');
  if (process.env.QA_SHOTS_DIR) {
    mkdirSync(process.env.QA_SHOTS_DIR, { recursive: true });
    const shot = await b.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(process.env.QA_SHOTS_DIR, 'a0-conflict.png'), Buffer.from(shot.data, 'base64'));
  }
  await b.evaluate(clickText('Giữ bản của tôi', "document.querySelector('.ws-error-actions')"));
  await pause(250);
  const dialog = await b.evaluate(`!!document.querySelector('.ant-modal-confirm')`);
  if (dialog) await b.evaluate(`document.querySelector('.ant-modal-confirm .ant-btn-primary').click(); true`);
  await b.until(isSaved, 'giữ bản mình lưu thành công');
  assert.equal((await request('/workspace', token)).config.spaces[0].widgets[0].settings.text, 'Bản nháp giữ lại từ tab B');
  checks.push('Refresh giữ nháp 409; chọn Giữ bản của tôi lưu bằng version mới');
  b.events.set('Fetch.requestPaused', event => void b.send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'Failed' }));
  await b.send('Fetch.enable', { patterns: [{ urlPattern: `${api}/workspace`, requestStage: 'Request' }] });
  await b.evaluate(editNote('Bản nháp khi API mất mạng'));
  await b.until(`document.querySelector('.ws-save')?.textContent.includes('Chưa lưu')`, 'lỗi API lưu nháp');
  await b.send('Page.reload');
  await b.until(`document.body.innerText.includes('Chưa tải được bàn làm việc')`, 'lỗi API lúc tải lại');
  await b.send('Fetch.disable');
  await b.evaluate(clickText('Thử lại', "document.querySelector('.ws-loading')"));
  await b.until(`!!document.querySelector('textarea[aria-label="Nội dung ghi chú"]') && ${isSaved}`, 'Retry phục hồi và lưu');
  assert.equal(await b.evaluate(`document.querySelector('textarea[aria-label="Nội dung ghi chú"]').value`), 'Bản nháp khi API mất mạng');
  assert.equal((await request('/workspace', token)).config.spaces[0].widgets[0].settings.text, 'Bản nháp khi API mất mạng');
  checks.push('Mất API khi lưu và refresh: Thử lại phục hồi nháp rồi đồng bộ thành công');
} catch (error) { failure = error; }
finally {
  for (const socket of sockets) socket.close();
  if (chrome) { chrome.kill(); await pause(500); }
  if (profile) {
    const expectedRoot = resolve(tmpdir()); const target = resolve(profile);
    if (target.startsWith(`${expectedRoot}\\`) && target.slice(expectedRoot.length + 1).startsWith('ioc-desk-browser-')) {
      try { rmSync(target, { recursive: true, force: true }); } catch { /* Chrome may retain a short-lived handle. */ }
    }
  }
  try { await cleanupQaActors(prisma, actors); checks.push('Đã dọn tài khoản, cấu hình và audit QA'); }
  catch (error) { failure = new Error(`${failure?.message || ''}; dọn QA: ${error.message}`); }
  await prisma.$disconnect();
}
for (const check of checks) console.log(`PASS ${check}`);
if (failure) { console.error(failure.stack); process.exitCode = 1; }
else console.log(`Hoàn tất ${checks.length} kiểm tra trình duyệt bàn làm việc.`);
