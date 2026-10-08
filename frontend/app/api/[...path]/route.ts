// Same-origin proxy to FastAPI. Only the endpoints below are reachable; BACKEND_URL is read at runtime.
const ROUTES: Record<string, string[]> = { health: ["GET"], stats: ["GET"], plans: ["GET"], fleet: ["GET"], requests: ["GET", "POST"] };
const MAX_BODY = 16 * 1024;
const PER_IP = 5; // stored leads per client per minute
const GLOBAL = 60; // stored leads per minute overall: X-Forwarded-For can be forged when Next faces the internet directly

const reply = (status: number, detail: string, headers?: Record<string, string>) =>
  Response.json({ detail }, { status, headers: { "cache-control": "no-store", ...headers } });

// ponytail: fixed-window counters in one Node process; move to Redis if the web tier ever runs more than one instance.
const windows = new Map<string, { start: number; n: number }>();
function take(key: string, max: number) {
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now - w.start > 60_000) {
    if (windows.size > 10_000) windows.clear(); // bounded memory; the global cap still holds after a clear
    windows.set(key, (w = { start: now, n: 0 }));
  }
  return ++w.n <= max;
}
function giveBack(key: string) {
  const w = windows.get(key);
  if (w) w.n--;
}

// Rightmost entry: the address the nearest proxy saw. Next only fills the header when the client did not send one.
const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "unknown";

/** Reads at most MAX_BODY bytes; null when the body is larger. Never buffers an oversized upload. */
async function readBody(req: Request): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return null;
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
    size += r.value.byteLength;
    if (size > MAX_BODY) {
      await reader!.cancel();
      return null;
    }
    chunks.push(r.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handle(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  const methods = ROUTES[path];
  if (!methods) return reply(404, "Not found");
  if (!methods.includes(req.method)) return reply(405, "Method not allowed", { allow: methods.join(", ") });

  const headers: Record<string, string> = {};
  for (const h of ["if-none-match", "authorization"]) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  let body: string | undefined;
  let keys: string[] = [];
  if (req.method === "POST") {
    // JSON-only also blocks cross-site form posts: a JSON content type forces a CORS preflight we never answer.
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply(415, "Send application/json");
    const text = await readBody(req);
    if (text === null) return reply(413, "Request body too large");
    body = text;
    headers["content-type"] = "application/json";
    keys = [`ip:${clientIp(req)}`, "all"];
    const ok = [take(keys[0], PER_IP), take(keys[1], GLOBAL)]; // take both so a refund below stays symmetric
    if (!ok.every(Boolean)) {
      keys.forEach(giveBack);
      return reply(429, "Too many requests", { "retry-after": "60" });
    }
  }

  let r: Response;
  try {
    r = await fetch(`${process.env.BACKEND_URL ?? "http://localhost:8000"}/api/${path}`, {
      method: req.method, headers, body, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    keys.forEach(giveBack);
    return (e as Error).name === "TimeoutError" ? reply(504, "Upstream timeout") : reply(502, "Upstream unavailable");
  }
  if (r.status !== 201) keys.forEach(giveBack); // only stored leads use up the quota; rejected input costs nothing

  const out = new Headers({ "cache-control": r.headers.get("cache-control") ?? "no-store", vary: "accept-encoding" });
  for (const h of ["content-type", "etag", "www-authenticate"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  // Next does not compress route-handler responses; native gzip shrinks the fleet payload ~5x for phones on slow links.
  const gzip = r.body && Number(r.headers.get("content-length") ?? 0) > 1024 && /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "");
  if (gzip) out.set("content-encoding", "gzip");
  return new Response(gzip ? r.body!.pipeThrough(new CompressionStream("gzip")) : r.body, { status: r.status, headers: out });
}

export { handle as GET, handle as POST };
