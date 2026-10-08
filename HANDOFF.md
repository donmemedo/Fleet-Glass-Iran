# Session handoff: security hardening, pen test, perf and Apple-style UX

Written 2026-10-02 so any model or tool can continue. Read this first, then `README.md`.

## 1. The task

The owner's request, verbatim:

> use red team agents and blue team agents and security skills to audit and solve all problems and of course do pen test for this project, also add performance to all security things. and for ui/ux use /apple-design you can use how much tokens you want just try to finish all works under 5 hours

Deliverable: find and fix the security problems, re-test, keep every control cheap at runtime, and polish the UI to Apple's fluid-interface standard.

House rules:

- **Shortest correct diff.** Prefer framework features over new dependencies: Next `headers()`, pydantic constraints, FastAPI middleware, SQLite pragmas, CSS media queries.
- **Persian copy** follows `~/references/persian-ux-vocab/README.md`.
- **UI/UX** follows `~/.claude/skills/apple-design/SKILL.md`. Section 6 lists the items that apply here.
- Don't commit unless the owner asks. The tree is the MVP commit `a280e94` plus this file and `scripts/pentest.py`.

## 2. Status

**No app code has been changed yet.**

| Step | State |
| --- | --- |
| Read every source file | Done |
| Frontend production build | Done, clean on Next 16.3.6 |
| Backend tests | 1 passed |
| Dependency scans | Done, see section 4 |
| Pen-test script | Written and run: 15 of 42 controls pass |
| Multi-agent red-team workflow | Failed. All 12 agents hit usage limits and returned nothing |
| Fixes | Not started |
| UX pass | Not started |
| Re-test | Not started |

## 2b. Progress later on 2026-10-08 (committed locally on `security-hardening-perf-ux`, not pushed)

Everything in 2a's "Remaining" list is written: proxy allowlist/limits/timeout, headers + nonce CSP (`frontend/proxy.ts`), SW allowlist, client-side calculator with an honest zero-savings note (`frontend/app/quote.ts`, `npm test`), dashboard `#admin` unlock + error/retry states, Apple-design CSS pass, hardened Dockerfiles/compose, hash-pinned `backend/requirements.txt` (edit `requirements.in`), mobile cleartext only for localhost.

Pen test: **48 of 50 pass** (baseline 15 of 42). The two failures are fixed in code but not re-run: proxy gzip, and the backslash check now follows Next's same-origin 308. Next: rebuild, re-run `scripts/pentest.py` (60 s apart), Docker build, multi-agent red/blue verification, ponytail-review, graphify, README, report, push + PR. About 20 parallel Claude sessions keep load near 90, so builds take ~12 min and latency is not comparable with the baseline.

## 2a. Progress on 2026-10-08 (branch `security-hardening-perf-ux`, nothing committed or pushed yet)

Done and tested (`backend/.venv/bin/pytest -q` passes; bandit clean; pip-audit clean):

- `backend/main.py`: F1 (lead list needs `Authorization: Bearer $ADMIN_TOKEN`, 404 when the token is unset or under 32 chars, 401 when wrong, phone dropped from the list), F3 (docs only with `API_DOCS=1`), F5 (pure ASGI guard: 411 without Content-Length, 413 over 16 KB), F8 (422 handler never echoes input), F10 (`extra="forbid"`, `strict=True`, Cc/Cf rejected except ZWNJ/ZWJ), F11 (stats/plans/fleet serialized once at startup with ETag, 304 and `max-age=300`; everything else `no-store` + nosniff), F12 (WAL, connections now closed), honeypot field `website`, and POST returns `{"ok": true}` instead of the sequential row id (the id leaked lead volume).
- `POST /api/quote` was **removed** on purpose: the calculator must move to the client (new `frontend/app/quote.ts` + a `node --test` check). Until that frontend change lands the calculator shows dashes.
- F7: `backend/requirements.txt` now pins fastapi 0.142.2, starlette 1.7.0, uvicorn 0.54.0, uvloop, httptools. Not hash-pinned yet.
- `backend/test_main.py` covers all of the above, including 30 concurrent writes.

Remaining, in order: proxy `route.ts` (endpoint allowlist, 415 for non-JSON POST, streamed 16 KB cap, rate limit per rightmost X-Forwarded-For **plus a global cap** because Next keeps a client-sent XFF, refund the slot when the backend does not return 201, 5 s timeout with 502/504, forward only if-none-match/authorization and etag/cache-control back), `next.config.ts` headers + `poweredByHeader:false` + `proxy.ts` nonce CSP, `sw.js` API allowlist and `igf-v2`, client-side quote with an honest note when savings are 0 (F15), dashboard `#admin` unlock form and `useApi` error/retry states, section 6 UX items, Dockerfiles (non-root, `--no-server-header`, read-only FS in compose, `ADMIN_TOKEN` env), mobile cleartext only for localhost hosts, update `scripts/pentest.py` (quote probes now target `/api/requests`; checks must tolerate the refund-based limiter), then multi-agent red/blue verification, ponytail-review, graphify, README, PR.

## 3. Confirmed findings

| # | Sev | Finding | Where | Fix |
| --- | --- | --- | --- | --- |
| F1 | High | The lead list is public. `GET /api/requests` returns name and mobile number with no auth, and the public dashboard shows it. | `backend/main.py:131-134`, `frontend/app/dashboard/page.tsx:23` | Require an `ADMIN_TOKEN` header set from an env var. Drop `phone` from the list response. Hide the panel when no token is set. |
| F2 | High | The service worker caches every same-origin GET, including the lead list. | `frontend/public/sw.js:31-36` | Cache only `/api/stats`, `/api/plans` and `/api/fleet`. Bump the cache name so old caches are deleted. |
| F3 | Medium | The backend serves `/docs` and `/openapi.json`. | `backend/main.py:12` | Pass `docs_url=None, redoc_url=None, openapi_url=None` unless an env flag is set. |
| F4 | Medium | No security headers. CSP, HSTS, frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy and COOP are missing. `X-Powered-By: Next.js` is sent. | `frontend/next.config.ts` | Add static `headers()` and `poweredByHeader: false`. See the CSP note below. |
| F5 | Medium | No request body size limit. A 10 MB body through the proxy and a 50 MB body direct were both accepted. | proxy `route.ts`, `main.py` | Return 413 above 16 KB in the proxy, and add a matching check in FastAPI middleware. |
| F6 | Medium | No rate limit on lead submission. 40 of 40 rapid POSTs were stored. | proxy or `main.py:121` | Use an in-memory token bucket per client IP, with a size-bounded map. Add a hidden honeypot field to the form. |
| F7 | Medium | Starlette 0.46.2 has 7 advisories. | `backend/requirements.txt` | Upgrade to fastapi 0.142.2, which resolves to starlette 1.7.0. Use uvicorn 0.54.0. These versions were resolved with uv but not yet tested with the app. |
| F8 | Low | `NaN`, `Infinity` or `1e309` in the quote body returns a 500. Validation rejects the value, but the 422 response echoes it back and JSON encoding fails with `Out of range float values are not JSON compliant`. | `main.py:92-110` | Add a `RequestValidationError` handler that returns field names and messages without the input value. This also stops echoing large inputs. |
| F9 | Low | The proxy has no upstream timeout. When the backend is down it returns a bare 500. | proxy `route.ts` | Add `AbortSignal.timeout(5000)` and return a 502 or 504 JSON response. |
| F10 | Low | Unknown fields and bidi or control characters are accepted. A numeric string is coerced to an int. | `main.py:113-118` | Add `extra="forbid"` and a validator that rejects Unicode Cc and Cf characters. **Allow U+200C and U+200D**, because Persian text needs the zero-width non-joiner. |
| F11 | Low | API responses have no Cache-Control or ETag and are not compressed. The lead list is not marked `no-store`. | `main.py` | Set `no-store` on `/api/requests`. Set a short `max-age` with an ETag on stats and plans. Add `GZipMiddleware(minimum_size=1000)`. |
| F12 | Low | SQLite opens a new connection per request without WAL. Under heavy machine load, 4 of 200 concurrent writes dropped. | `main.py:15-18` | Set `PRAGMA journal_mode=WAL` once at startup and `busy_timeout=3000` per connection. |
| F13 | Low | Both containers run as root. Requirements are not hash-pinned. | `backend/Dockerfile`, `frontend/Dockerfile` | Add a `USER` directive and a read-only root filesystem with `/data` writable. |
| F14 | Low | The mobile shell has 7 npm advisories: 1 critical, 3 high and 3 moderate. All come from `@capacitor/cli` and `@capacitor/assets` build tooling, with no fix available. | `mobile/package.json` | Build-time only. Track upstream. Keep `server.url` HTTPS-only and set `allowNavigation`. |
| F15 | Product | The savings calculator shows 0 savings at low crack rates. At 100 vehicles and 5% the cost with checks is higher than without. | `main.py:97-110` | Make sure the inspection cost model is right, or raise the slider minimum. |

Checked and clean: SQL is parameterised. React escapes all stored strings, and the codebase has no `dangerouslySetInnerHTML` except the theme script. The phone regex rejects newlines. Deep JSON nesting returns 400. PUT, DELETE and PATCH return 405. There is no CORS wildcard. Frontend `npm audit` is clean. Bandit only flags `random` for seeded demo data, which is a false positive.

**CSP note.** The App Router emits inline scripts for hydration, so a hash-only CSP will break the page. Pages are already dynamic because `layout.tsx` reads cookies, so a per-request nonce from a Next 16 `proxy.ts` adds almost no cost. Hash the theme script in `layout.tsx:26` or give it the nonce. `style-src` needs `'unsafe-inline'` because React sets `style` attributes. Fonts are self-hosted by `next/font`, so `font-src 'self'` is enough.

## 4. Scan results

| Tool | Result |
| --- | --- |
| pytest | 1 passed |
| bandit | 1 low, a false positive |
| pip-audit | starlette 0.46.2: 7 advisories, all fixed by 1.3.1 or later |
| npm audit, frontend | 0 |
| npm audit, mobile | 7, build tooling only |

## 5. Fix plan in order

1. **`backend/main.py`:** F3, F8, F10, F5, F1, F11, F12. Then upgrade requirements for F7 and run pytest.
2. **`frontend/app/api/[...path]/route.ts`:** only proxy an explicit list of backend endpoints. Then add F5, F6 and F9. Forward the client IP in a header the backend trusts only from the proxy.
3. **`frontend/next.config.ts`** and a new `frontend/proxy.ts` if you use a nonce: F4.
4. **`frontend/public/sw.js`:** F2.
5. **Dashboard:** hide the requests panel without a token. Add error and retry states, because `api()` swallows errors and a dead backend shows skeletons forever.
6. **Dockerfiles:** F13.
7. **UX pass:** section 6.
8. **Tests:** extend `backend/test_main.py` for every backend fix. Re-run `scripts/pentest.py` until every control passes. HSTS only matters behind TLS, but sending it is harmless.

Keep every control cheap. Headers are static config. The rate limiter is O(1) with bounded memory. Size checks read `content-length` before reading the body.

## 6. UX items to do

These come from reading the code against the apple-design skill. They have not been audited in a browser yet.

- **Press feedback:** `.btn` and `.icon-btn` animate `transform` over 200-250 ms. Use about 100 ms on `:active` so the press feels instant.
- **Bottom sheet:** the dialog animates in but closes instantly. Make it exit along the same path. On phones add drag-to-dismiss with velocity handoff.
- **Reduced motion:** the blanket `.01ms` override also removes useful cross-fades. Replace it with per-component fades. Add `prefers-reduced-transparency` and `prefers-contrast` rules for the glass surfaces.
- **Touch targets:** `.icon-btn` is 38 px and the segmented buttons are smaller. Make them at least 44 px.
- **Tilt:** the hero car follows the pointer through a 600 ms transition. It should track 1:1.
- **Calculator latency:** each slider move waits for a debounce and a network round trip. Compute the quote on the client for instant feedback, and keep the endpoint only if something else needs it.
- **Main-thread cost:** `useFx` runs `getBoundingClientRect` on every `pointermove`. Throttle it to one call per animation frame. The three aurora blobs animate `blur(90px)` without stopping, so pause them when the hero is offscreen.
- **Filter control:** the risk filter uses `role="tablist"` without arrow-key support. Use buttons with `aria-pressed` instead.
- **States:** add loading, empty and error states for every fetch, with a retry action.

## 7. How to resume

Ports 3000 and 8000 belong to other projects on this machine, so use 3123 and 8123. Plain `pip` can't reach PyPI here because DNS fails, so use `uv`.

```bash
# Stop this session's servers. They serve the unmodified MVP build.
kill 260733 267062 2>/dev/null

# Backend
cd backend
uv pip install --python .venv/bin/python -r requirements.txt pytest httpx pip-audit bandit
DB_PATH=/tmp/igf-test.db .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8123 &

# Frontend
cd ../frontend && npm run build
cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/
cd .next/standalone && BACKEND_URL=http://127.0.0.1:8123 PORT=3123 HOSTNAME=127.0.0.1 node server.js &

# Verify
cd ../../..
backend/.venv/bin/python scripts/pentest.py http://127.0.0.1:3123 http://127.0.0.1:8123
cd backend && .venv/bin/pytest -q
```

`scripts/pentest.py` prints PASS or FAIL for each control and a latency table. Its exit code is the number of failures. Baseline latency on this machine: fleet through the proxy is 6 ms at p50, direct is 2.8 ms, and the home page HTML is 14 ms.

In Claude Code, the multi-agent audit can be re-run from this script:
`~/.claude/projects/-home-makhataei-Projects-Mine-Fleet-Glass-Iran/ffe25f11-2522-4c2d-b18c-347e173f4751/workflows/scripts/red-team-audit-wf_9d0dcda5-27f.js`. It expects the servers on 3123 and 8123. It is expensive, so section 3 is enough to start fixing.
