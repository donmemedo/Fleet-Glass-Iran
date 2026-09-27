// Same-origin proxy to FastAPI. BACKEND_URL is read at runtime, so one image works in any environment.
async function proxy(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
  const r = await fetch(`${backend}/api/${path.join("/")}${new URL(req.url).search}`, {
    method: req.method,
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
    body: req.method === "GET" ? undefined : await req.text(),
    cache: "no-store",
  });
  return new Response(r.body, { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json" } });
}

export { proxy as GET, proxy as POST };
