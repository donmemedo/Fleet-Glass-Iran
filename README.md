# IranGlassFleet · ایران‌گلس‌فلیت

Web app for the business plan in this folder: a B2B windshield inspection, repair and SLA service for company fleets.

- `frontend/` — Next.js 16 (App Router, TypeScript, plain CSS). Persian/English with RTL, light/dark, responsive.
- `backend/` — FastAPI + SQLite. Endpoints: `/api/stats`, `/api/plans`, `/api/fleet`, `POST /api/quote`, `GET|POST /api/requests`.

The browser only talks to Next (`/api/*`), which proxies to FastAPI using `BACKEND_URL`, read at runtime.

## Run with Docker

```bash
docker compose up --build            # http://localhost:3000
WEB_PORT=3077 docker compose up --build   # if port 3000 is taken
```

## Run locally

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --port 8000

cd frontend && npm install && npm run dev   # BACKEND_URL defaults to http://localhost:8000
```

## Test

```bash
cd backend && .venv/bin/pip install pytest httpx && .venv/bin/pytest -q
```
