"""IranGlassFleet API — fleet glass inspection, repair and SLA service."""
import os
import random
import sqlite3
from datetime import date, timedelta

from fastapi import FastAPI
from pydantic import BaseModel, Field

DB = os.getenv("DB_PATH", "app.db")

app = FastAPI(title="IranGlassFleet API", version="1.0.0")


def db():
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    return con


with db() as con:
    con.execute(
        """CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT, company TEXT, name TEXT, phone TEXT,
            fleet_size INTEGER, city TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)"""
    )

# Prices in million Toman, from the business plan (pricing section).
PRICES = {"inspection": 0.25, "repair": 1.8, "replace": 12.0}

# ponytail: demo fleet is generated from a fixed seed, swap for a vehicles table when real data arrives.
MODELS = ["Peugeot Pars", "Samand", "Dena Plus", "Tara", "Shahin", "Arisan", "Kia Sportage", "Hyundai H350", "Foton Van", "Peugeot 207"]
LETTERS = "بجدسصطقلمنوهی"
CITIES = ["Tehran", "Karaj", "Isfahan", "Mashhad", "Shiraz"]


def _fleet():
    rnd = random.Random(1405)
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


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/stats")
def stats():
    return {"fleets": 30, "vehicles_checked": 6600, "repair_rate": 20, "sla_minutes": 10, "renewal": 88, "savings_billion": 9.4}


@app.get("/api/plans")
def plans():
    return [
        {"id": "check", "price": 0.25, "unit": "vehicle", "features": ["onsite", "photo_report", "risk"]},
        {"id": "care", "price": 0.22, "unit": "vehicle_month", "features": ["onsite", "photo_report", "risk", "sla", "priority"], "featured": True},
        {"id": "enterprise", "price": 25, "unit": "month", "features": ["onsite", "photo_report", "risk", "sla", "priority", "dashboard", "api"]},
    ]


@app.get("/api/fleet")
def fleet():
    risk = {k: sum(v["risk"] == k for v in FLEET) for k in ("low", "medium", "high")}
    months = [{"m": m, "repair": r, "replace": p} for m, r, p in zip(range(1, 7), [42, 55, 61, 70, 84, 96], [18, 16, 14, 12, 11, 9])]
    return {
        "vehicles": FLEET,
        "risk": risk,
        "months": months,
        "kpi": {"covered": len(FLEET), "open": risk["medium"] + risk["high"], "repaired": 96, "saved": round(96 * (PRICES["replace"] - PRICES["repair"]), 1)},
    }


class Quote(BaseModel):
    vehicles: int = Field(ge=1, le=100_000)
    crack_rate: float = Field(ge=0, le=100, description="% of fleet with small cracks per year")


@app.post("/api/quote")
def quote(q: Quote):
    cracked = q.vehicles * q.crack_rate / 100
    # Without checks most small cracks grow into replacements; with fleet check ~80% are caught while repairable.
    without = cracked * 0.7 * PRICES["replace"] + cracked * 0.3 * PRICES["repair"]
    caught = cracked * 0.8
    with_check = caught * PRICES["repair"] + (cracked - caught) * PRICES["replace"] + q.vehicles * PRICES["inspection"] * 2
    return {
        "cracked": round(cracked),
        "without": round(without, 1),
        "with": round(with_check, 1),
        "saved": round(max(without - with_check, 0), 1),
        "downtime_days": round(caught * 1.5),
    }


class Lead(BaseModel):
    company: str = Field(min_length=2, max_length=120)
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(pattern=r"^(\+98|0)?9\d{9}$")
    fleet_size: int = Field(ge=1, le=100_000)
    city: str = Field(min_length=2, max_length=60)


@app.post("/api/requests", status_code=201)
def create_request(lead: Lead):
    with db() as con:
        cur = con.execute(
            "INSERT INTO requests (company, name, phone, fleet_size, city) VALUES (?,?,?,?,?)",
            (lead.company, lead.name, lead.phone, lead.fleet_size, lead.city),
        )
    return {"id": cur.lastrowid}


@app.get("/api/requests")
def list_requests():
    with db() as con:
        return [dict(r) for r in con.execute("SELECT * FROM requests ORDER BY id DESC LIMIT 20")]
