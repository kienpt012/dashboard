import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatResult {
  content: string;
  model: string;
  promptTokens?: number;
  evalTokens?: number;
  durationMs: number;
}

export interface OllamaChatOptions {
  temperature?: number;
  model?: string;
  numCtx?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Ollama chạy nhưng không có model được cấu hình (bị xoá, chưa tạo): lỗi của cả lượt, không phải của một đoạn. */
export class OllamaModelMissingError extends ServiceUnavailableException {
  constructor(readonly model: string) {
    super(`Chưa có model "${model}" trong Ollama. Tạo lại hoặc tải model rồi bấm "Trích xuất lại".`);
    this.name = 'OllamaModelMissingError';
  }
}

// Client gọi Ollama local. Mọi lời gọi model đều đi qua service này để thống nhất
// cấu hình, timeout và không bao giờ log nội dung tài liệu.
@Injectable()
export class OllamaService {
  private readonly logger = new Logger(OllamaService.name);
  readonly baseUrl: string;
  readonly extractModel: string;
  readonly embedModel: string;
  readonly requestTimeoutMs: number;
  readonly numCtx: number;
  /** OLLAMA_NUM_GPU: số lớp nạp lên GPU; 0 = chỉ CPU (máy GPU nhỏ, tránh Ollama tự chia model ra GPU rồi chậm hẳn). */
  readonly numGpu: number | null;
  /** Thời gian chờ một lần hỏi /api/version. Máy thiếu RAM đang nạp model có thể trả lời chậm hơn 3 giây. */
  readonly healthTimeoutMs: number;
  /** Giữ model nạp sẵn giữa các lần gọi (B8, B11), vd "30m"; rỗng = mặc định của Ollama. */
  readonly keepAlive: string | null;
  /** OLLAMA_THINK=false gửi think:false (model có bước suy nghĩ); bỏ trống thì không gửi (qwen3 instruct không có). */
  readonly think: boolean | null;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    this.extractModel = config.get<string>('OLLAMA_EXTRACT_MODEL') || 'qwen3:4b-instruct-2507-q4_K_M';
    this.embedModel = config.get<string>('OLLAMA_EMBED_MODEL') || 'bge-m3';
    // Trên GPU 4GB (~10 tok/s), một chunk nhiều chỉ tiêu có thể cần sinh >2000 token
    // (~4 phút). Job chạy nền nên timeout dài là an toàn; lời gọi ngắn (Copilot định
    // tuyến intent) tự kết thúc sớm hơn nhiều.
    this.requestTimeoutMs = boundedInteger(config.get<string>('OLLAMA_TIMEOUT_MS'), 480_000, 30_000, 3_600_000);
    this.numCtx = boundedInteger(config.get<string>('OLLAMA_NUM_CTX'), 4096, 2048, 32_768);
    const numGpu = (config.get<string>('OLLAMA_NUM_GPU') ?? '').trim();
    this.numGpu = /^\d{1,3}$/.test(numGpu) ? Number(numGpu) : null;
    this.healthTimeoutMs = boundedInteger(config.get<string>('OLLAMA_HEALTH_TIMEOUT_MS'), 10_000, 1_000, 120_000);
    const keepAlive = (config.get<string>('OLLAMA_KEEP_ALIVE') ?? '').trim();
    this.keepAlive = /^-?\d+(\.\d+)?(ms|s|m|h)?$/.test(keepAlive) ? keepAlive : null;
    const think = (config.get<string>('OLLAMA_THINK') ?? '').trim().toLowerCase();
    this.think = think === 'true' ? true : think === 'false' ? false : null;
  }

  /**
   * Ollama có trả lời không. Copilot gọi một lần, chờ ngắn (mặc định 3 giây) để không làm chậm câu trả lời.
   * Job trích xuất chạy nền nên gọi với `attempts` > 1: máy thiếu RAM có thể chậm vài chục giây, và nếu kết luận
   * sai là "không hoạt động" thì cả văn bản rơi về bộ luật dù Qwen vẫn chạy được.
   */
  async isAvailable(signal?: AbortSignal, options: { timeoutMs?: number; attempts?: number; retryDelayMs?: number } = {}): Promise<boolean> {
    const timeoutMs = options.timeoutMs ?? 3_000;
    const attempts = Math.max(1, Math.floor(options.attempts ?? 1));
    const retryDelayMs = options.retryDelayMs ?? 2_000;
    let lastError = 'không rõ';
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}/api/version`, {
          signal: combineAbortSignals(timeoutMs, signal),
        });
        if (response.ok) return true;
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        rethrowExternalAbort(signal);
        lastError = error instanceof Error ? error.name : 'lỗi';
      }
      if (attempt < attempts) await sleep(retryDelayMs * attempt, signal);
    }
    if (attempts > 1) {
      this.logger.warn(`Ollama không trả lời ${this.baseUrl}/api/version sau ${attempts} lần (mỗi lần chờ ${timeoutMs} ms, lỗi cuối: ${lastError})`);
    }
    return false;
  }

  // Sinh JSON theo schema bằng grammar-constrained decoding của Ollama (tham số format).
  async chatStructured(
    messages: OllamaChatMessage[],
    schema: Record<string, unknown>,
    options?: OllamaChatOptions,
  ): Promise<OllamaChatResult> {
    const startedAt = Date.now();
    const model = options?.model || this.extractModel;
    // Máy chỉ có CPU (3–5 token/giây) có thể cần hơn 15 phút cho một đoạn dày: OLLAMA_TIMEOUT_MS đặt được tới 60 phút.
    const timeoutMs = boundedInteger(options?.timeoutMs, this.requestTimeoutMs, 1_000, 3_600_000);
    // Dùng stream để tránh trần headersTimeout 300s của undici (fetch Node):
    // với stream, header trả về ngay và token chảy liên tục nên chỉ còn giới hạn
    // tổng thời gian do AbortSignal kiểm soát.
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: true,
          format: schema,
          ...(this.keepAlive ? { keep_alive: this.keepAlive } : {}),
          ...(this.think !== null ? { think: this.think } : {}),
          options: {
            temperature: options?.temperature ?? 0.1,
            num_ctx: options?.numCtx ?? this.numCtx,
            ...(this.numGpu !== null ? { num_gpu: this.numGpu } : {}),
          },
          messages,
        }),
        signal: combineAbortSignals(timeoutMs, options?.signal),
      });
    } catch (error) {
      rethrowExternalAbort(options?.signal);
      this.logger.error(`Không thể kết nối Ollama (${model}): ${error instanceof Error ? error.name : 'lỗi'}`);
      throw new ServiceUnavailableException('Dịch vụ AI cục bộ chưa sẵn sàng. Vui lòng kiểm tra Ollama.');
    }
    if (!response.ok) {
      const detail = await safeErrorText(response);
      this.logger.error(`Ollama trả lỗi ${response.status} cho model ${model}: ${detail}`);
      if (response.status === 404 && /not found/i.test(detail)) throw new OllamaModelMissingError(model);
      throw new ServiceUnavailableException('Dịch vụ AI cục bộ trả về lỗi. Vui lòng thử lại sau.');
    }
    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      rethrowExternalAbort(options?.signal);
      this.logger.error(`Luồng phản hồi Ollama bị ngắt (${model}): ${error instanceof Error ? error.name : 'lỗi'}`);
      throw new ServiceUnavailableException('Dịch vụ AI cục bộ bị gián đoạn. Vui lòng thử lại.');
    }
    let content = '';
    let promptTokens: number | undefined;
    let evalTokens: number | undefined;
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let chunk: { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
      try {
        chunk = JSON.parse(trimmed) as typeof chunk;
      } catch {
        continue;
      }
      if (typeof chunk.message?.content === 'string') content += chunk.message.content;
      if (typeof chunk.prompt_eval_count === 'number') promptTokens = chunk.prompt_eval_count;
      if (typeof chunk.eval_count === 'number') evalTokens = chunk.eval_count;
    }
    if (!content.trim()) {
      throw new ServiceUnavailableException('Dịch vụ AI không trả về nội dung hợp lệ.');
    }
    return {
      content,
      model,
      promptTokens,
      evalTokens,
      durationMs: Date.now() - startedAt,
    };
  }

  async embed(texts: string[], options?: { model?: string }): Promise<number[][]> {
    if (!texts.length) return [];
    const model = options?.model || this.embedModel;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: texts, ...(this.keepAlive ? { keep_alive: this.keepAlive } : {}) }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException('Dịch vụ AI cục bộ chưa sẵn sàng. Vui lòng kiểm tra Ollama.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('Dịch vụ embedding trả về lỗi. Vui lòng thử lại sau.');
    }
    const payload = (await response.json()) as { embeddings?: number[][] };
    if (!Array.isArray(payload.embeddings) || payload.embeddings.length !== texts.length) {
      throw new ServiceUnavailableException('Kết quả embedding không hợp lệ.');
    }
    return payload.embeddings;
  }
}

function boundedInteger(raw: string | number | undefined, fallback: number, min: number, max: number): number {
  const parsed = typeof raw === 'number' ? Math.floor(raw) : Number.parseInt(raw ?? '', 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function combineAbortSignals(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function rethrowExternalAbort(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('The operation was aborted', 'AbortError');
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return 'không đọc được nội dung lỗi';
  }
}
