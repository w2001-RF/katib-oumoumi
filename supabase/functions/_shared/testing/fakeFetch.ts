// Test helper: replaces globalThis.fetch with a scripted one and records requests.

export interface Recorded {
  url: string;
  init: RequestInit;
  json?: unknown;   // parsed JSON body
  form?: FormData;  // multipart body
}

export type Responder = (req: Recorded) => Response | Promise<Response>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Runs `fn` with fetch answered by `respond`; restores the real fetch afterwards. */
export async function withFetch<T>(respond: Responder, fn: (requests: Recorded[]) => Promise<T>): Promise<T> {
  const requests: Recorded[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const req: Recorded = { url: String(input), init };
    if (typeof init.body === 'string') req.json = JSON.parse(init.body);
    else if (init.body instanceof FormData) req.form = init.body;
    requests.push(req);
    return await respond(req);
  }) as typeof fetch;
  try {
    return await fn(requests);
  } finally {
    globalThis.fetch = real;
  }
}
