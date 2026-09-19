import 'server-only';

/** Next may normalize request.url's hostname; Host retains the browser's target. */
export function requestOrigin(request: Request): string | null {
  try {
    const url = new URL(request.url);
    const host = request.headers.get('host');
    if (!host) return url.origin;
    // A Host value is an authority, never a URL, credentials, path or proxy list.
    if (/[\s/@?#\\,]/.test(host)) return null;
    const target = new URL(`${url.protocol}//${host}`);
    if (target.username || target.password || target.pathname !== '/' || !target.hostname) return null;
    return target.origin;
  } catch { return null; }
}

/** Bound request bytes while streaming, before JSON parsing and Zod validation. */
export async function readBoundedJson(request: Request, maxBytes = 4096): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('invalid-json');
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) throw new Error('invalid-size');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('missing-body');
  const chunks: Uint8Array[] = []; let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { void reader.cancel().catch(() => undefined); reject(new Error('body-timeout')); }, 3000); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { void reader.cancel().catch(() => undefined); throw new Error('invalid-size'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timer); }
}
