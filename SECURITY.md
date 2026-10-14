# Security, performance and UX review

Review of IranGlassFleet on branch `security-hardening-perf-ux`, October 2026. The baseline is commit `a280e94`, the MVP.

To report a vulnerability, contact the repository owner privately rather than opening a public issue.

## Result

| Measure | Before | After |
| --- | --- | --- |
| Live pen-test controls passing (`scripts/pentest.py`) | 15 of 42 | 55 of 55 |
| Backend dependency advisories (pip-audit) | 7, all in Starlette 0.46.2 | 0 |
| Frontend dependency advisories (npm audit) | 0 at the first audit, 8 published since | 0 |
| Lead list with names and phone numbers | Public | Admin key required, phone never returned |
| Server CPU per fleet API request (Next + FastAPI) | 10.9 ms | 6.1 ms |
| Fleet API bytes on the wire | 7,462 | 1,340 |

## Method

| Lens | What was done |
| --- | --- |
| Red team | Adversary-style review of every entry point, following the MITRE ATT&CK phases (recon, initial access, collection, exfiltration, impact), and an attack tree for the two attacker goals. |
| Blue team | Control-by-control check that each defence fails closed and that the proxy and backend agree. |
| SAST | bandit, semgrep (security-audit, OWASP Top 10, Python and TypeScript packs), pip-audit, npm audit. |
| Pen test | `scripts/pentest.py` against the running stack: headers, CSP nonce, path traversal, endpoint and method allowlist, auth and key-guessing throttle, validation, body size, rate limits including forged `X-Forwarded-For`, caching, compression. |
| Performance | Every control costed. The old and new stacks were run side by side, with interleaved requests and server CPU time per request, so machine load affects both equally. |
| UX | The interface was checked against Apple's fluid-interface guidance (WWDC *Designing Fluid Interfaces*) and the Persian UX-writing vocabulary. |
| Simplicity | ponytail-review of the whole diff. |
| Verification | Each reviewer finding went to an independent skeptic who tried to refute it before it was fixed. |

## Findings fixed

### First audit

| ID | Severity | Finding | Fix |
| --- | --- | --- | --- |
| F1 | High | The lead list, with names and phone numbers, was public. | `GET /api/requests` needs `Authorization: Bearer $ADMIN_TOKEN` (32+ characters, constant-time compare). It does not exist when the token is unset, never returns the phone, and is `no-store`. The dashboard hides the panel unless opened at `/dashboard#admin`. |
| F2 | High | The service worker cached every same-origin GET, including the lead list. | Only `/api/stats`, `/api/plans` and `/api/fleet` are cached. The cache name moved to `igf-v2`, which deletes old caches. Responses marked `no-store` or fetched with credentials are never stored. |
| F3 | Medium | `/docs` and `/openapi.json` were served. | Off unless `API_DOCS=1`. |
| F4 | Medium | No security headers; `X-Powered-By` sent. | Per-request nonce CSP with `strict-dynamic` (`frontend/proxy.ts`), HSTS, `X-Frame-Options`, nosniff, Referrer-Policy, Permissions-Policy, COOP, CORP. `default-src 'none'` on the API. |
| F5 | Medium | No request size limit. | 16 KB cap, streamed in the proxy and gated on `Content-Length` in FastAPI (411/413). |
| F6 | Medium | Unlimited lead submissions. | 5 stored leads per client and 60 overall per minute. Rejected input costs no quota. A hidden honeypot field silently drops bot submissions. |
| F7 | Medium | Starlette advisories. | FastAPI 0.142.2 and Starlette 1.7.0, hash-pinned. |
| F8 | Low | `NaN` or `Infinity` input caused a 500; 422 responses echoed input. | The validation handler returns field names and messages only. |
| F9 | Low | No upstream timeout. | 5 s timeout, 502 or 504 JSON. |
| F10 | Low | Unknown fields, control and bidi characters, and type coercion accepted. | Strict model with `extra="forbid"`. Controls, bidi and format characters, private-use, surrogates, unassigned code points and line separators are rejected. ZWNJ and ZWJ stay allowed for Persian. |
| F11 | Low | No caching headers or compression on the API. | Static data serialized once at startup with ETag, 304 and `max-age=300`. Everything else `no-store`. Gzip in the proxy. |
| F12 | Low | Concurrent writes could fail. | SQLite WAL, connections closed per request. Tested with 30 concurrent writes. |
| F13 | Low | Containers ran as root; requirements not hash-pinned. | Non-root users, read-only root filesystem, all capabilities dropped, `no-new-privileges`, process and memory limits, rotated logs, `pip install --require-hashes`. |
| F14 | Low | Mobile build tooling has advisories. | No upstream fix exists; build-time only. The app now refuses a non-HTTPS server URL except for local development hosts. |
| F15 | Product | The calculator showed zero savings at low crack rates. | The calculator runs in the browser and now says plainly when checks don't pay off. Break-even is near a 10% yearly crack rate with current prices. |

Also fixed: the lead `POST` used to return the row id, which revealed how many leads arrive. It now returns `{"ok": true}`.

### Second review (red and blue team)

Found by the red, blue and SAST reviewers after the first round. Severities are the ones the skeptics settled on.

| IDs | Severity | Finding | Fix | Skeptic |
| --- | --- | --- | --- | --- |
| R1, B1, S1 | Medium | Flooding the limiter with forged client addresses cleared its map, which also reset the overall lead cap. A simulation stored 300 leads in a minute against a cap of 60. | The overall counter lives outside the map, so clearing per-client entries never resets it. | Confirmed |
| R2 | Low | Compose published the site on every interface over plain HTTP, so the admin key could cross a network unencrypted. | Compose binds `127.0.0.1` by default; the README requires a TLS reverse proxy in front. | Confirmed, lowered from medium |
| B2 | Low | Rejected admin keys left no trace. | Each rejected key is logged with the client address; Docker logs are rotated. | Confirmed, lowered from medium |
| R3, S2 | Low | A refund arriving after the minute rolled over lowered the next window's count, letting about one extra cap through per window. | Each request refunds exactly the window it was charged to. | Confirmed |
| R4, S3 | Low | Paths such as `/api/constructor` matched inherited object properties and returned 500 with a stack trace in the log. | The allowlist is a `Map`, so only real endpoints match. | Confirmed |
| R5 | Low | The unused image optimizer re-encoded images on every request because the read-only filesystem blocks its cache. | Turned off with `images.unoptimized`; the endpoint now answers 404. | Confirmed |
| B3 | Low | Admin key guessing was not throttled. | 10 wrong keys per client per minute, then 429. A correct key costs nothing. | Split: confirmed once, judged theoretical once given a 32+ character random key; kept as cheap defence in depth |
| B5 | Low | The phone check accepted Persian and full-width digits; line separators and private-use characters were accepted in text. | `[0-9]` only; those character categories are rejected too. | Confirmed |
| B7 | Low | `.env`, where `ADMIN_TOKEN` lives, was not git-ignored. | Ignored. | Confirmed |
| B8 | Low | No log rotation or resource limits. | 10 MB × 3 rotated logs, 512 MB memory and 256 process limits per container. | Confirmed |
| B4 | Info | CSP matcher exclusions were prefix matches, so some 404 pages had no CSP. | Exclusions end in `$`. | Confirmed, lowered from low |
| B9 | Info | No dependency-update path. | Dependabot for pip, npm (web and mobile) and Docker. | Confirmed |
| S4 | Info | Next 16.3.6, sharp and source-map-js fell inside newly published advisory ranges; none was reachable in this configuration. | Next 16.3.8, sharp 0.35.5, source-map-js 1.2.2. npm audit is clean. | Confirmed |
| B6 | Info | No backup path for the lead database. | One-line SQLite backup in the README. | Confirmed as an operational gap, not a code defect |
| — | Low | Two test files held a raw right-to-left override character, which hides text in code review. The backend held raw zero-width joiners. | Written as `\u` escapes. | Found during the fix pass |
| — | Info | The service worker would have stored a `no-store` or credentialed response if such a path were ever added to its allowlist. | It skips both; pages stay cached for offline use. | From the blue-team notes |

## Attack tree

Two attacker goals, broken into the paths an outsider could try. Cost, skill and detectability are rough ratings (low, medium, high). Status is after both rounds of fixes.

**Goal 1: obtain the lead list (names and phone numbers).** Any one path below is enough.

| Path | Cost | Skill | Detect | Status |
| --- | --- | --- | --- | --- |
| Ask the API without a key | Low | Low | High | Blocked: key required, constant-time compare |
| Guess the admin key | Low | Low | Medium | Blocked: 32+ random characters, 10 wrong keys per minute per client, each one logged |
| Sniff the key in transit (needs a network position and a plain-HTTP origin) | Medium | Medium | Low | Blocked by default: localhost-only port; operator must add TLS |
| Steal the key with injected script (needs an injection point and a CSP bypass) | High | High | Medium | Blocked: React escaping, nonce CSP with `strict-dynamic`, input character filtering |
| Frame the admin panel | Low | Low | Low | Blocked: `frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| Reach FastAPI or its docs directly | Low | Low | Low | Blocked: not published, docs off, exact endpoint allowlist |
| Read a cached copy (service worker or HTTP caches) | Low | Low | Low | Blocked: API allowlist, `no-store`, old cache deleted |
| Infer lead volume | Low | Low | Medium | Blocked for row ids. Residual: probing the overall cap estimates traffic at the cost of blocking intake for a minute |

**Goal 2: disrupt or abuse lead intake.** Any one path below is enough.

| Path | Cost | Skill | Detect | Status |
| --- | --- | --- | --- | --- |
| Flood junk leads with forged client addresses | Low | Low | Medium | Capped at 60 stored leads per minute; the cap-reset and refund bugs are fixed |
| Post leads from another site | Low | Low | Low | Blocked: JSON only, no CORS |
| Send oversized or endless bodies | Low | Low | Medium | Blocked: 16 KB streamed cap on both tiers |
| Hold connections open with slow bodies | Low | Medium | Low | Needs the TLS reverse proxy with request timeouts |
| Burn CPU through the image optimizer | Low | Low | Medium | Blocked: optimizer off |
| Crash the backend with malformed input | Low | Low | High | Blocked: strict model, 422 without echo |
| Fill the disk through logs | Medium | Low | Medium | Blocked: rotated logs; crafted paths no longer raise errors |
| Use up the overall cap so real leads wait | Low | Low | Medium | Residual, by design: bounded junk beats unbounded junk |

## Performance

The old and new stacks ran side by side on the same machine. CPU time per request comes from the server process and does not depend on machine load. Latency was measured with interleaved requests, so load affects both stacks equally.

Server CPU per request:

| Request | Before ms | After ms |
| --- | --- | --- |
| `/` (Next, median of six runs) | 16.6 | 17.2 |
| `/dashboard` (Next) | 16.9 | 18.0 |
| `/api/fleet` (Next) | 7.2 | 5.2 |
| `/api/fleet` (FastAPI) | 3.7 | 0.9 |

Latency (p50 / p95) and bytes on the wire:

| Path | Old p50 / p95 ms | New p50 / p95 ms | Old bytes | New bytes |
| --- | --- | --- | --- | --- |
| `/api/fleet` | 18.2 / 50.5 | 12.7 / 32.4 | 7462 | 1340 |
| `/api/plans` | 14.2 / 39.4 | 14.3 / 37.6 | 342 | 163 |
| `/api/stats` | 15.6 / 31.2 | 14.6 / 32.6 | 106 | 113 |
| `/` | 32.4 / 81.2 | 37.0 / 93.5 | 6994 | 7287 |
| `/dashboard` | 25.1 / 93.0 | 30.4 / 92.1 | 4753 | 5005 |
| `/api/fleet` repeat visit (304) | n/a | 6.8 / 10.4 | n/a | 0 |

- **The per-request CSP costs about 0.6 ms on the home page and 1.1 ms on the dashboard.** That is the nonce work and slightly larger HTML; the home-page difference is within run-to-run spread.
- **The API is cheaper than before.** A fleet request costs 6.1 ms of CPU across both tiers instead of 10.9 ms. Payloads are serialized once at startup, constant routes skip the thread pool, and each payload is gzipped once per deploy.
- **The fleet payload is 5.6 times smaller** on the wire, and repeat visits get a 304 with no body.

The performance reviewer's findings, with the skeptic's verdict:

| ID | Finding | Fix | Skeptic |
| --- | --- | --- | --- |
| P1 | Intl formatters were rebuilt for every row on every keystroke. | Formatters are built once per language. | Confirmed |
| P2 | Constant-payload routes ran in the thread pool. | They are `async`. | Not a defect, kept for the measured CPU win |
| P3 | The proxy re-compressed the same payload on every request. | Compressed once per ETag, bounded cache. | Not a defect at the reviewed commit; needed after round 2 removed the size gate |
| P4 | The calculator's shimmer repainted every frame outside the hero. | Shimmer runs only in the hero, which pauses offscreen. | Confirmed |
| P5 | A late pointer move could re-apply the hero tilt after the pointer left. | The reset goes through the same per-frame queue. | Confirmed |
| P6 | Page requests waited for the service worker to boot. | Navigation preload is on. | Confirmed |

## UX

Changes from the Apple fluid-interface review:

- Buttons respond on press within 100 ms, and every control has at least a 44 px touch target, including the slider.
- The calculator answers as the slider moves, with no network wait.
- The request sheet enters and leaves along the same path. On phones it follows the finger, can be thrown down to dismiss, and settles with a critically damped spring that inherits the release velocity.
- The hero tilt follows the pointer with one layout read per frame. Its looping animations pause while offscreen.
- Reduced motion keeps gentle fades and removes movement and loops. Reduced transparency and increased contrast get solid surfaces and stronger lines.
- Every data load has loading, empty and error states with a retry button. The risk filter is a group of toggle buttons with `aria-pressed`.
- New Persian copy follows the project's UX-writing vocabulary: «نادرست» rather than «اشتباه», «تلاش دوباره», «ورود».

A dedicated UX reviewer then found more issues over two runs, six of them medium. All are fixed:

- **Request sheet.** Grabbing it during its entry animation now continues from where it is. After a drag-dismiss it stays offscreen instead of sliding back, and with reduced motion it fades out. A text selection that ends on the backdrop no longer closes it and loses what was typed. The dialog has an accessible name.
- **First paint.** The hero and dashboard header used to stay invisible until JavaScript loaded. They now animate in with CSS alone, so they show on slow phones and without JavaScript.
- **Contrast.** Risk pills, error text, the savings line, the gradient card and the primary button now reach 4.5:1 in both themes. High-contrast mode makes the nav bar opaque and the gradient text solid.
- **Touch.** Hover effects apply only to real pointers, so nothing stays lifted after a tap. Nav links and the logo are 44 px targets, and the risk filter reacts on press. With reduced motion, buttons dim on press instead of scaling. The search field uses 16 px text, so iOS no longer zooms in on it. The header no longer overflows on small phones when the install button appears.
- **Screen readers.** A sent request is announced and takes focus. A wrong admin key is announced and the field is refocused. The logo link has a name on phones. The language toggle and hero image have names in the current language. The vehicle list and chart expose table and value semantics, and an empty search result is announced.
- **Persian copy.** Counts use the singular noun («۱۲۰ خودرو»). «تعهد پاسخ‌گویی» replaces «SLA», and «پرونده» replaces «پروفایل». The pricing buttons say «درخواست بازدید», which is what they do.
- **Smaller fixes.** Searching plates with Persian digits now finds them. The donut shows a placeholder instead of «1» while loading. With reduced motion, the theme change cross-fades instead of flashing. Field errors clear as soon as the field is edited.

## Simplicity review

ponytail-review of the whole diff suggested four cuts, six lines in total. Three were applied: the backend's duplicate price table, a redundant cache header on the service worker, and the public `/api/health` route, which no browser code uses. The rubber-band resistance on the sheet stays, because Apple's fluid-interface guidance asks for soft edges.

## SAST

| Tool | Result |
| --- | --- |
| bandit 1.9.4 | 0 issues in `backend/main.py`. The seeded demo random generator carries a reviewed `# nosec`. |
| semgrep 1.179.0 (security-audit, OWASP Top 10, Python, TypeScript) | 0 results from 296 rules over 19 files. |
| pip-audit 2.10.1 | 0 known vulnerabilities in the hash-pinned requirements. |
| npm audit | 8 advisories had been published since the first audit, in Next, sharp and source-map-js; none reachable here. After upgrading, 0. |

The SAST reviewer's three code findings were the same issues the red and blue teams found, listed above as S1 to S3. Manual review found parameterised SQL everywhere and no server-side request forgery path, because the proxy builds its upstream URL only from allowlist keys.

## Remaining risk and operator checklist

- **No browser screenshot pass was run.** The UI changes were reviewed in code by two UX passes and their skeptics. Check the phone bottom sheet and RTL layout on a real device before release.

- **Put a TLS reverse proxy in front.** Compose publishes the site on `127.0.0.1` only. The proxy should terminate TLS, overwrite `X-Forwarded-For` so the per-client limits see real addresses, and set request timeouts against slow-body clients.
- **The global lead cap can be filled on purpose.** Someone sending junk can use up the overall 60-per-minute allowance, which delays real leads for that minute. This trades availability for a bounded junk rate.
- **Set `ADMIN_TOKEN` from a random generator,** for example `openssl rand -hex 32`, and keep it in an untracked `.env`.
- **Back up the lead database.** The README has a one-line backup command.
- **Mobile build tooling advisories** stay until Capacitor ships fixes. Dependabot opens PRs for every dependency tree weekly.

## Re-run

```bash
cd backend && .venv/bin/pytest -q
cd frontend && npm test
ADMIN_TOKEN=... backend/.venv/bin/python scripts/pentest.py http://127.0.0.1:3000 http://127.0.0.1:8000   # at most once a minute
```
