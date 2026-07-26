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

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    this.extractModel = config.get<string>('OLLAMA_EXTRACT_MODEL') || 'qwen3:4b-instruct-2507-q4_K_M';
    this.embedModel = config.get<string>('OLLAMA_EMBED_MODEL') || 'bge-m3';
    this.requestTimeoutMs = boundedInteger(config.get<string>('OLLAMA_TIMEOUT_MS'), 240_000, 30_000, 900_000);
    this.numCtx = boundedInteger(config.get<string>('OLLAMA_NUM_CTX'), 4096, 2048, 32_768);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(3_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Sinh JSON theo schema bằng grammar-constrained decoding của Ollama (tham số format).
  async chatStructured(
    messages: OllamaChatMessage[],
    schema: Record<string, unknown>,
    options?: { temperature?: number; model?: string },
  ): Promise<OllamaChatResult> {
    const startedAt = Date.now();
    const model = options?.model || this.extractModel;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          format: schema,
          options: {
            temperature: options?.temperature ?? 0.1,
            num_ctx: this.numCtx,
          },
          messages,
        }),
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      this.logger.error(`Không thể kết nối Ollama (${model}): ${error instanceof Error ? error.name : 'lỗi'}`);
      throw new ServiceUnavailableException('Dịch vụ AI cục bộ chưa sẵn sàng. Vui lòng kiểm tra Ollama.');
    }
    if (!response.ok) {
      const detail = await safeErrorText(response);
      this.logger.error(`Ollama trả lỗi ${response.status} cho model ${model}: ${detail}`);
      throw new ServiceUnavailableException('Dịch vụ AI cục bộ trả về lỗi. Vui lòng thử lại sau.');
    }
    const payload = (await response.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const content = payload.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new ServiceUnavailableException('Dịch vụ AI không trả về nội dung hợp lệ.');
    }
    return {
      content,
      model,
      promptTokens: payload.prompt_eval_count,
      evalTokens: payload.eval_count,
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
        body: JSON.stringify({ model, input: texts }),
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

function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return 'không đọc được nội dung lỗi';
  }
}
