// Server-side document output. The browser exporter (js/utils/docGenerator.js)
// needs a DOM, so the bot sends the filled HTML to a headless-Chromium
// service instead — Gotenberg (https://gotenberg.dev), one Docker container:
//   docker run --rm -p 3000:3000 gotenberg/gotenberg:8
// Chromium shapes Arabic and lays out RTL exactly like the web preview.
// Without PDF_SERVICE_URL the bot sends a printable .html file instead.

import { joinUrl } from '../ai/openaiCompatible.ts';
import { errorKindFor, hostOf, redact } from '../metrics/classify.ts';
import { type CallObserver, emit } from '../metrics/types.ts';

export interface RenderedFile {
  data: Uint8Array;
  filename: string;
  mime: string;
}

export interface DocumentRenderer {
  render(bodyHtml: string, title: string): Promise<RenderedFile>;
}

const PDF_MARGIN_MM = 15;

// Same page setup as the web exporter: Tajawal, RTL, A4, 15mm margins.
export function wrapDocumentHtml(bodyHtml: string, title: string): string {
  const safeTitle = title.replaceAll(/[<>&"]/g, '');
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=block" />
<style>
  @page { size: A4; margin: ${PDF_MARGIN_MM}mm; }
  body { margin: 0; background: #fff; color: #111; font-family: Tajawal, Arial, sans-serif;
         font-size: 14px; line-height: 1.9; direction: rtl; text-align: right; }
  p { break-inside: avoid; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

export function safeFilename(title: string): string {
  return title.replaceAll(/[\\/:*?"<>|]/g, '').trim() || 'document';
}

export class PdfServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'PdfServiceError';
  }
}

export class GotenbergRenderer implements DocumentRenderer {
  constructor(private readonly baseUrl: string, private readonly basicAuth?: string, private readonly observe?: CallObserver) {}

  async render(bodyHtml: string, title: string): Promise<RenderedFile> {
    const started = Date.now();
    const event = { service: 'pdf' as const, provider: 'gotenberg', model: hostOf(this.baseUrl), operation: 'render', task: 'render' };
    try {
      const file = await this.convert(bodyHtml, title);
      emit(this.observe, { ...event, ok: true, httpStatus: 200, latencyMs: Date.now() - started });
      return file;
    } catch (e) {
      const status = e instanceof PdfServiceError ? e.status : null;
      const message = (e as Error).message;
      emit(this.observe, { ...event, ok: false, httpStatus: status, errorKind: errorKindFor(status, message), error: redact(message),
        latencyMs: Date.now() - started });
      throw e;
    }
  }

  private async convert(bodyHtml: string, title: string): Promise<RenderedFile> {
    const form = new FormData();
    form.append('files', new Blob([wrapDocumentHtml(bodyHtml, title)], { type: 'text/html' }), 'index.html');
    form.append('waitDelay', '1s'); // let the Tajawal web font load
    form.append('printBackground', 'true');
    const headers: Record<string, string> = {};
    if (this.basicAuth) headers.Authorization = `Basic ${btoa(this.basicAuth)}`;
    const res = await fetch(joinUrl(this.baseUrl, 'forms/chromium/convert/html'), {
      method: 'POST', headers, body: form, signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new PdfServiceError(`PDF service HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
    return { data: new Uint8Array(await res.arrayBuffer()), filename: `${safeFilename(title)}.pdf`, mime: 'application/pdf' };
  }
}

export class HtmlFileRenderer implements DocumentRenderer {
  render(bodyHtml: string, title: string): Promise<RenderedFile> {
    return Promise.resolve({
      data: new TextEncoder().encode(wrapDocumentHtml(bodyHtml, title)),
      filename: `${safeFilename(title)}.html`,
      mime: 'text/html',
    });
  }
}

export function getRenderer(observe?: CallObserver): DocumentRenderer {
  const url = Deno.env.get('PDF_SERVICE_URL');
  return url ? new GotenbergRenderer(url, Deno.env.get('PDF_SERVICE_BASIC_AUTH'), observe) : new HtmlFileRenderer();
}
