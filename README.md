# IranGlassFleet · ایران‌گلس‌فلیت

Web app for the business plan in this folder: a B2B windshield inspection, repair and SLA service for company fleets.

- `frontend/` — Next.js 16 (App Router, TypeScript, plain CSS). Persian/English with RTL, light/dark, responsive.
- `backend/` — FastAPI + SQLite. Endpoints: `/api/health` (container healthcheck only), `/api/stats`, `/api/plans`, `/api/fleet`, `POST /api/requests` (lead form), `GET /api/requests` (admin only).

The browser only talks to Next (`/api/*`), which proxies an allowlist of endpoints (all but `/api/health`) to FastAPI using `BACKEND_URL`, read at runtime. The savings calculator runs in the browser (`frontend/app/quote.ts`).

## Run with Docker

```bash
docker compose up --build            # http://localhost:3000
WEB_PORT=3077 docker compose up --build   # if port 3000 is taken
ADMIN_TOKEN=$(openssl rand -hex 32) docker compose up --build   # also turn on the admin lead list
```

Both containers run as non-root users on a read-only filesystem with all Linux capabilities dropped. A `data` volume created by an older root-run version may need `chown 10001` once.

The site listens on `127.0.0.1` only. In production, put a TLS reverse proxy such as Caddy or nginx in front of it. The proxy should overwrite `X-Forwarded-For` and set request timeouts. Set `WEB_BIND=0.0.0.0` only for a trusted local network, because it serves plain HTTP.

Back up the lead database with `docker compose exec backend python -c "import sqlite3; sqlite3.connect('/data/app.db').backup(sqlite3.connect('/tmp/backup.db'))"`, then copy `/tmp/backup.db` out with `docker compose cp`.

## Run locally

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
API_DOCS=1 .venv/bin/uvicorn main:app --port 8000   # API_DOCS=1 serves /docs; off by default

cd frontend && npm install && npm run dev   # BACKEND_URL defaults to http://localhost:8000
```

`backend/requirements.txt` is hash-pinned. Change versions in `requirements.in`, then run
`uv pip compile requirements.in --generate-hashes --python-version 3.12 -o requirements.txt`.

## Security settings

| Setting | Where | Effect |
| --- | --- | --- |
| `ADMIN_TOKEN` | backend env | 32+ random characters turn on the lead list. Open `/dashboard#admin` and enter the key. Unset or shorter: the endpoint does not exist. |
| `API_DOCS=1` | backend env | Serves `/docs` and `/openapi.json`. Leave unset in production. |
| Lead rate limit | `frontend/app/api/[...path]/route.ts` | 5 stored leads per client per minute and 60 overall. Wrong admin keys: 10 per client per minute, each logged. |
| CSP | `frontend/proxy.ts` | Per-request nonce for scripts. Other headers are in `frontend/next.config.ts`. |

## Test

```bash
cd backend && .venv/bin/pip install pytest httpx && .venv/bin/pytest -q
cd frontend && npm test
```

Live pen test against a running stack, at most once a minute because of the rate-limit window:

```bash
ADMIN_TOKEN=... backend/.venv/bin/python scripts/pentest.py http://127.0.0.1:3000 http://127.0.0.1:8000
```
