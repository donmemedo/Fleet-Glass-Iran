// Same-origin proxy to FastAPI. Only the endpoints below are reachable; BACKEND_URL is read at runtime.
const ROUTES = new Map<string, string[]>(Object.entries({ health: ["GET"], stats: ["GET"], plans: ["GET"], fleet: ["GET"], requests: ["GET", "POST"] }));
const MAX_BODY = 16 * 1024;
const PER_IP = 5; // stored leads per client per minute
const GLOBAL = 60; // stored leads per minute overall: X-Forwarded-For can be forged when Next faces the internet directly
const AUTH_FAILS = 10; // wrong admin keys per client per minute

const reply = (status: number, detail: string, headers?: Record<string, string>) =>
  Response.json({ detail }, { status, headers: { "cache-control": "no-store", ...headers } });

// ponytail: fixed-window counters in one Node process; move to Redis if the web tier ever runs more than one instance.
type Window = { start: number; n: number };
const windows = new Map<string, Window>();
let global: Window = { start: 0, n: 0 }; // kept outside the map, so clearing per-client windows never resets it

/** Charges one use to the key's current window (null = global) and returns that window. */
function take(key: string | null): Window {
  const now = Date.now();
  let w = key === null ? global : windows.get(key);
  if (!w || now - w.start > 60_000) {
    w = { start: now, n: 0 }; // a new object, so a late refund lands on the old window, not this one
    if (key === null) global = w;
    else {
      if (windows.size > 10_000) windows.clear(); // bounded memory under address flooding
      windows.set(key, w);
    }
  }
  w.n++;
  return w;
}
const giveBack = (charged: Window[]) => charged.forEach((w) => w.n--);
const tooMany = () => reply(429, "Too many requests", { "retry-after": "60" });

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
  const methods = ROUTES.get(path);
  if (!methods) return reply(404, "Not found");
  if (!methods.includes(req.method)) return reply(405, "Method not allowed", { allow: methods.join(", ") });

  const ip = clientIp(req);
  const headers: Record<string, string> = {};
  const etag = req.headers.get("if-none-match");
  if (etag) headers["if-none-match"] = etag;
  // The admin key is only meaningful on GET /api/requests; never forwarded with a POST.
  const auth = req.method === "GET" ? req.headers.get("authorization") : null;
  let body: string | undefined;
  let charged: Window[] = [];
  if (auth) {
    headers.authorization = auth;
    charged = [take(`auth:${ip}`)];
    if (charged[0].n > AUTH_FAILS) {
      giveBack(charged);
      return tooMany();
    }
  }
  if (req.method === "POST") {
    // JSON-only also blocks cross-site form posts: a JSON content type forces a CORS preflight we never answer.
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return reply(415, "Send application/json");
    const text = await readBody(req);
    if (text === null) return reply(413, "Request body too large");
    body = text;
    headers["content-type"] = "application/json";
    charged = [take(`lead:${ip}`), take(null)];
    if (charged[0].n > PER_IP || charged[1].n > GLOBAL) {
      giveBack(charged);
      return tooMany();
    }
  }

  let r: Response;
  try {
    r = await fetch(`${process.env.BACKEND_URL ?? "http://localhost:8000"}/api/${path}`, {
      method: req.method, headers, body, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    giveBack(charged);
    return (e as Error).name === "TimeoutError" ? reply(504, "Upstream timeout") : reply(502, "Upstream unavailable");
  }
  // Leads: only stored ones use quota. Admin: only rejected keys do.
  if (auth ? r.status !== 401 : r.status !== 201) giveBack(charged);
  if (auth && r.status === 401) console.warn(`admin key rejected for ${ip}`); // audit trail in the container log

  const out = new Headers({ "cache-control": r.headers.get("cache-control") ?? "no-store", vary: "accept-encoding" });
  for (const h of ["content-type", "etag", "www-authenticate"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  // Next does not compress route-handler responses; native gzip shrinks the fleet payload ~5x for phones on slow links.
  const gzip = r.status === 200 && r.body && /\bgzip\b/.test(req.headers.get("accept-encoding") ?? "");
  if (gzip) out.set("content-encoding", "gzip");
  return new Response(gzip ? r.body!.pipeThrough(new CompressionStream("gzip")) : r.body, { status: r.status, headers: out });
}

export { handle as GET, handle as POST };
