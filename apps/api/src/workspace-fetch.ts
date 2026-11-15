import { BadGatewayException, BadRequestException, GatewayTimeoutException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT = 8000;
type Resolver = (hostname: string) => Promise<LookupAddress[]>;
type Dependencies = { resolve?: Resolver; request?: typeof httpsRequest };

/** Reject special-use networks and IPv6 transition addresses as well as private LANs. */
export function isPublicAddress(address: string): boolean {
  if (address.includes('%')) return false;
  const family = isIP(address);
  if (family === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || a === 100 && b >= 64 && b <= 127
      || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31
      || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)
      || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)
      || a === 203 && b === 0 && c === 113);
  }
  if (family === 6) {
    const [first, second = '0'] = address.toLowerCase().split(':');
    const a = parseInt(first, 16);
    const b = parseInt(second || '0', 16);
    // Only global unicast 2000::/3; exclude 6to4, protocol assignments and documentation.
    return a >= 0x2000 && a <= 0x3fff && a !== 0x2002 && a !== 0x3ffe
      && !(a === 0x2001 && (b < 0x0200 || b === 0x0db8))
      && !(a === 0x3fff && b <= 0x0fff);
  }
  return false;
}

export function parsePublicApiUrl(input: string): URL {
  if (typeof input !== 'string' || input.length > 2048 || /[\u0000-\u0020\\]/.test(input)) {
    throw new BadRequestException('Địa chỉ API không hợp lệ');
  }
  let url: URL;
  try { url = new URL(input); } catch { throw new BadRequestException('Địa chỉ API không hợp lệ'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || url.hash) {
    throw new BadRequestException('API phải dùng HTTPS cổng 443, không kèm tài khoản hoặc phần #');
  }
  // A DNS name with a final dot denotes the same host. Use the same canonical name for
  // validation, lookup, Host and certificate verification, rather than checking one and dialing another.
  if (url.hostname.endsWith('.')) url.hostname = url.hostname.slice(0, -1);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || /(^|\.)(localhost|local|internal|invalid|test|onion)$/.test(hostname)
    || (!isIP(hostname) && !hostname.includes('.'))
    || isIP(hostname) && !isPublicAddress(hostname)) {
    throw new BadRequestException('Chỉ kết nối API công khai trên Internet');
  }
  return url;
}

export async function resolvePublicApi(url: URL, resolver: Resolver = hostname => lookup(hostname, { all: true, verbatim: true })) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  if (family) {
    if (!isPublicAddress(hostname)) throw new BadRequestException('Chỉ kết nối API công khai trên Internet');
    return { address: hostname, family };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let addresses: LookupAddress[];
  try {
    addresses = await Promise.race([
      resolver(hostname),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new GatewayTimeoutException('Hết thời gian phân giải địa chỉ API')), 5000); }),
    ]);
  } catch (error) {
    if (error instanceof GatewayTimeoutException) throw error;
    throw new BadGatewayException('Không phân giải được tên miền API');
  } finally { if (timer) clearTimeout(timer); }
  // Reject mixed public/private answers; the selected IP is pinned into the TLS socket below.
  if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address) || isIP(entry.address) !== entry.family)) {
    throw new BadRequestException('API trỏ tới địa chỉ mạng không được phép');
  }
  return addresses[0];
}

/** Read public JSON without cookies, authorization, redirects, proxy envs or DNS rebinding. */
export async function fetchPublicJson(input: string, dependencies: Dependencies = {}) {
  const url = parsePublicApiUrl(input);
  const resolved = await resolvePublicApi(url, dependencies.resolve);
  const request = dependencies.request ?? httpsRequest;
  const data = await new Promise<unknown>((resolve, reject) => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = (error?: Error, value?: unknown) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const req = request(url, {
      method: 'GET',
      agent: false,
      family: resolved.family,
      // Preserve the original hostname for Host and TLS verification, but never resolve it again.
      lookup: ((_host: string, options: { all?: boolean }, callback: (...args: any[]) => void) => {
        if (options?.all) callback(null, [resolved]);
        else callback(null, resolved.address, resolved.family);
      }) as any,
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity', 'User-Agent': 'IOC-Workspace/1.0' },
    }, response => {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        done(new BadGatewayException(status >= 300 && status < 400
          ? 'API chuyển hướng; hãy nhập trực tiếp địa chỉ HTTPS cuối cùng'
          : `API trả về mã lỗi ${status}`));
        response.destroy();
        return;
      }
      const contentType = String(response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (!(contentType === 'application/json' || /^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(contentType))) {
        done(new BadGatewayException('API phải trả về dữ liệu JSON'));
        response.destroy();
        return;
      }
      if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') {
        done(new BadGatewayException('API trả về định dạng nén không được hỗ trợ'));
        response.destroy();
        return;
      }
      if (Number(response.headers['content-length'] ?? 0) > MAX_RESPONSE_BYTES) {
        done(new BadGatewayException('Dữ liệu API vượt quá 1 MB'));
        response.destroy();
        return;
      }
      let size = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        if (finished) return;
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          done(new BadGatewayException('Dữ liệu API vượt quá 1 MB'));
          response.destroy();
        } else chunks.push(chunk);
      });
      response.on('error', () => done(new BadGatewayException('Kết nối API bị gián đoạn')));
      response.on('aborted', () => done(new BadGatewayException('Kết nối API bị gián đoạn')));
      response.on('end', () => {
        if (finished) return;
        try { done(undefined, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { done(new BadGatewayException('API trả về JSON không hợp lệ')); }
      });
    });
    req.on('error', () => done(new BadGatewayException('Không kết nối được API công khai')));
    timer = setTimeout(() => {
      done(new GatewayTimeoutException('API không phản hồi trong 8 giây'));
      req.destroy();
    }, REQUEST_TIMEOUT);
    req.end();
  });
  return { data, fetchedAt: new Date().toISOString(), source: url.href };
}
