import { config } from "../config/env.js";
import type { ParseSettings } from "../types.js";

export interface MineruParseResult {
  filename: string;
  content: Buffer;
  contentType: string;
}

export class MineruService {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly taskTimeoutMs: number;

  constructor(opts?: { baseUrl?: string; timeoutMs?: number; taskTimeoutMs?: number }) {
    this.baseUrl = (opts?.baseUrl ?? config.MINERU_API_URL).replace(/\/$/, "");
    this.timeoutMs = (opts?.timeoutMs ?? config.MINERU_API_TIMEOUT_SECONDS) * 1000;
    this.taskTimeoutMs = (opts?.taskTimeoutMs ?? config.MINERU_API_TASK_TIMEOUT_SECONDS) * 1000;
  }

  async health(): Promise<{ available: boolean; baseUrl: string; [key: string]: unknown }> {
    try {
      const resp = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) {
        return { available: false, baseUrl: this.baseUrl, error: `HTTP ${resp.status}` };
      }
      const payload = await resp.json();
      return { available: true, baseUrl: this.baseUrl, ...(payload as object) };
    } catch (err) {
      return { available: false, baseUrl: this.baseUrl, error: String(err) };
    }
  }

  async parseFile(
    filename: string,
    fileBuffer: Buffer,
    settings: ParseSettings
  ): Promise<MineruParseResult> {
    const formData = new FormData();
    for (const [key, value] of Object.entries(this.buildFormData(settings))) {
      formData.append(key, value);
    }
    formData.append(
      "files",
      new Blob([new Uint8Array(fileBuffer)], { type: "application/octet-stream" }),
      filename
    );

    const resp = await fetch(`${this.baseUrl}/file_parse`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`MinerU API returned ${resp.status}: ${text}`);
    }

    const content = Buffer.from(await resp.arrayBuffer());
    const contentType = resp.headers.get("content-type") ?? "application/zip";
    return { filename, content, contentType };
  }

  buildFormData(settings: ParseSettings): Record<string, string> {
    return {
      backend: settings.backend,
      effort: "high",
      parse_method: settings.parseMethod,
      lang_list: settings.lang,
      formula_enable: String(settings.formulaEnable),
      table_enable: String(settings.tableEnable),
      return_md: "true",
      return_middle_json: "true",
      return_model_output: "true",
      return_content_list: "true",
      return_images: "true",
      response_format_zip: "true",
    };
  }
}

export const mineruService = new MineruService();
