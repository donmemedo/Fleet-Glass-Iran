"""IranGlassFleet API — fleet glass inspection, repair and SLA service."""
import hashlib
import json
import logging
import os
import random
import secrets
import sqlite3
import unicodedata
from contextlib import contextmanager
from datetime import date, timedelta

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.datastructures import MutableHeaders

DB = os.getenv("DB_PATH", "app.db")
MAX_BODY = 16 * 1024  # largest valid lead is well under 1 KB
DOCS = os.getenv("API_DOCS") == "1"  # interactive docs only when explicitly enabled (local dev)

app = FastAPI(title="IranGlassFleet API", version="1.1.0", docs_url="/docs" if DOCS else None, redoc_url=None, openapi_url="/openapi.json" if DOCS else None)


class Guard:
    """Pure ASGI (no per-request task like BaseHTTPMiddleware): O(1) body-size gate + safe default headers."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if scope["method"] == "POST":
            # h11/httptools enforce Content-Length framing, so checking the header is enough; no body is read here.
            length = dict(scope["headers"]).get(b"content-length", b"")
            if not length.isdigit():
                return await JSONResponse({"detail": "Content-Length required"}, 411)(scope, receive, send)
            if int(length) > MAX_BODY:
                return await JSONResponse({"detail": "Request body too large"}, 413)(scope, receive, send)

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                h = MutableHeaders(scope=message)
                h.setdefault("cache-control", "no-store")
                h.setdefault("x-content-type-options", "nosniff")
            await send(message)

        await self.app(scope, receive, send_with_headers)


app.add_middleware(Guard)


@app.exception_handler(RequestValidationError)
async def invalid(_: Request, exc: RequestValidationError):
    # Never echo the input back: it can be large, and NaN/Infinity make the JSON encoder raise (500).
    return JSONResponse({"detail": [{"loc": e["loc"], "msg": e["msg"]} for e in exc.errors()]}, 422)


@contextmanager
def db():
    con = sqlite3.connect(DB, timeout=5)
    con.row_factory = sqlite3.Row
    try:
        with con:
            yield con
    finally:
        con.close()


with db() as con:
    con.execute("PRAGMA journal_mode=WAL")  # persistent per file: readers never block the writer
    con.execute(
        """CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT, name TEXT, phone TEXT,
            fleet_size INTEGER, city TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)"""
    )

# Prices in million Toman, from the business plan (pricing section). The web calculator mirrors these in frontend/app/quote.ts.
PRICES = {"inspection": 0.25, "repair": 1.8, "replace": 12.0}

# ponytail: demo fleet is generated from a fixed seed, swap for a vehicles table when real data arrives.
MODELS = ["Peugeot Pars", "Samand", "Dena Plus", "Tara", "Shahin", "Arisan", "Kia Sportage", "Hyundai H350", "Foton Van", "Peugeot 207"]
LETTERS = "بجدسصطقلمنوهی"
CITIES = ["Tehran", "Karaj", "Isfahan", "Mashhad", "Shiraz"]


def _fleet():
    rnd = random.Random(1405)  # nosec B311: seeded demo data, not security
    today = date(2026, 9, 20)
    out = []
    for i in range(1, 49):
        risk = rnd.choices(["low", "medium", "high"], [55, 30, 15])[0]
        status = {"low": "ok", "medium": rnd.choice(["monitor", "scheduled"]), "high": rnd.choice(["repair", "replace"])}[risk]
        out.append({
            "id": i,
            "plate": f"{rnd.randint(11, 99)}{rnd.choice(LETTERS)}{rnd.randint(111, 999)}-{rnd.choice([10, 20, 30, 40, 68, 77, 88])}",
            "model": rnd.choice(MODELS),
            "year": rnd.randint(2014, 2025),
            "city": rnd.choice(CITIES),
            "risk": risk,
            "status": status,
            "crack_mm": 0 if risk == "low" else rnd.randint(3, 12) if risk == "medium" else rnd.randint(14, 60),
            "last_check": str(today - timedelta(days=rnd.randint(1, 80))),
        })
    return out


FLEET = _fleet()
_risk = {k: sum(v["risk"] == k for v in FLEET) for k in ("low", "medium", "high")}


def _static(payload):
    """Serialize constant data once at startup; requests then cost a dict lookup, and repeat visits get a 304."""
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    return body, f'"{hashlib.sha256(body).hexdigest()[:20]}"'


STATIC = {
    "stats": _static({"fleets": 30, "vehicles_checked": 6600, "repair_rate": 20, "sla_minutes": 10, "renewal": 88, "savings_billion": 9.4}),
    "plans": _static([
        {"id": "check", "price": 0.25, "unit": "vehicle", "features": ["onsite", "photo_report", "risk"]},
        {"id": "care", "price": 0.22, "unit": "vehicle_month", "features": ["onsite", "photo_report", "risk", "sla", "priority"], "featured": True},
        {"id": "enterprise", "price": 25, "unit": "month", "features": ["onsite", "photo_report", "risk", "sla", "priority", "dashboard", "api"]},
    ]),
    "fleet": _static({
        "vehicles": FLEET,
        "risk": _risk,
        "months": [{"m": m, "repair": r, "replace": p} for m, r, p in zip(range(1, 7), [42, 55, 61, 70, 84, 96], [18, 16, 14, 12, 11, 9])],
        "kpi": {"covered": len(FLEET), "open": _risk["medium"] + _risk["high"], "repaired": 96, "saved": round(96 * (PRICES["replace"] - PRICES["repair"]), 1)},
    }),
}


def _send_static(name: str, if_none_match: str):
    body, etag = STATIC[name]
    headers = {"etag": etag, "cache-control": "public, max-age=300"}
    if if_none_match == etag:
        return Response(status_code=304, headers=headers)
    return Response(body, media_type="application/json", headers=headers)


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/stats")
def stats(if_none_match: str = Header("")):
    return _send_static("stats", if_none_match)


@app.get("/api/plans")
def plans(if_none_match: str = Header("")):
    return _send_static("plans", if_none_match)


@app.get("/api/fleet")
def fleet(if_none_match: str = Header("")):
    return _send_static("fleet", if_none_match)


BAD_CATEGORIES = {"Cc", "Cf", "Co", "Cs", "Cn", "Zl", "Zp"}  # controls, format/bidi, private use, surrogates, unassigned, line breaks


def _plain(v: str) -> str:
    # Reject control and format characters (bidi overrides, NUL, ...). Persian needs ZWNJ/ZWJ, so those stay.
    if any(unicodedata.category(c) in BAD_CATEGORIES and c not in "\u200c\u200d" for c in v):
        raise ValueError("control characters are not allowed")
    return v


class Lead(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    company: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(pattern=r"^(\+98|0)?9[0-9]{9}$")  # [0-9], not \d: \d also matches Persian and other digits
    fleet_size: int = Field(ge=1, le=100_000)
    city: str = Field(min_length=2, max_length=60)
    website: str = Field("", max_length=200)  # honeypot: hidden in the form, only bots fill it

    _no_controls = field_validator("company", "name", "city")(_plain)


@app.post("/api/requests", status_code=201)
def create_request(lead: Lead):
    # The response never carries the row id: sequential ids would reveal lead volume. Bots get the same answer.
    if not lead.website:
        with db() as con:
            con.execute(
                "INSERT INTO requests (company, name, phone, fleet_size, city) VALUES (?,?,?,?,?)",
                (lead.company, lead.name, lead.phone, lead.fleet_size, lead.city),
            )
    return {"ok": True}


def _admin(authorization: str) -> None:
    token = os.getenv("ADMIN_TOKEN", "")
    if len(token) < 32:  # unset or too short to resist guessing: the endpoint does not exist
        raise HTTPException(404)
    if not secrets.compare_digest(authorization.encode(), f"Bearer {token}".encode()):
        raise HTTPException(401, headers={"www-authenticate": "Bearer"})


@app.get("/api/requests")
def list_requests(authorization: str = Header("")):
    _admin(authorization)
    with db() as con:
        # Only what the panel shows; the phone number stays in the database.
        return [dict(r) for r in con.execute("SELECT id, company, name, fleet_size, city, created FROM requests ORDER BY id DESC LIMIT 20")]


if len(os.getenv("ADMIN_TOKEN", "")) in range(1, 32):
    logging.getLogger("uvicorn.error").warning("ADMIN_TOKEN is shorter than 32 characters; the lead list stays disabled.")
