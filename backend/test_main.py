import os
import threading

os.environ["DB_PATH"] = "test.db"
TOKEN = "t" * 40

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

c = TestClient(app)
LEAD = {"company": "Digi", "name": "Ali", "phone": "09121234567", "fleet_size": 80, "city": "Tehran"}


def test_api(monkeypatch):
    assert c.get("/api/health").json() == {"ok": True}
    assert c.get("/docs").status_code == 404 and c.get("/openapi.json").status_code == 404
    f = c.get("/api/fleet")
    assert sum(f.json()["risk"].values()) == len(f.json()["vehicles"]) == 48
    assert "max-age" in f.headers["cache-control"]
    assert c.get("/api/fleet", headers={"if-none-match": f.headers["etag"]}).status_code == 304

    bad = [{**LEAD, "phone": "0912"}, {**LEAD, "fleet_size": "10"}, {**LEAD, "extra": 1},
           {**LEAD, "company": "Acme‮"}, {**LEAD, "name": "Al\x00i"}, {**LEAD, "company": "A" * 121}]
    for body in bad:
        assert c.post("/api/requests", json=body).status_code == 422, body
    r = c.post("/api/requests", content='{"fleet_size": NaN}', headers={"content-type": "application/json"})
    assert r.status_code == 422 and "input" not in r.text
    assert c.post("/api/requests", content="x" * 20000, headers={"content-type": "application/json"}).status_code == 413
    assert c.post("/api/requests", json={**LEAD, "company": "پخش‌نمونه"}).status_code == 201  # ZWNJ allowed

    assert c.post("/api/requests", json={**LEAD, "company": "Bot", "website": "x"}).json() == {"ok": True}
    assert c.post("/api/requests", json=LEAD).json() == {"ok": True}

    assert c.get("/api/requests").status_code == 404  # no ADMIN_TOKEN: endpoint off
    monkeypatch.setenv("ADMIN_TOKEN", TOKEN)
    assert c.get("/api/requests", headers={"authorization": "Bearer nope"}).status_code == 401
    r = c.get("/api/requests", headers={"authorization": f"Bearer {TOKEN}"})
    assert r.status_code == 200 and r.headers["cache-control"] == "no-store"
    rows = r.json()
    assert rows[0]["company"] == "Digi" and "phone" not in rows[0] and all(x["company"] != "Bot" for x in rows)

    codes = []
    ts = [threading.Thread(target=lambda i=i: codes.append(c.post("/api/requests", json={**LEAD, "company": f"C{i}"}).status_code)) for i in range(30)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert codes.count(201) == 30
    for suffix in ("", "-wal", "-shm"):
        if os.path.exists("test.db" + suffix):
            os.remove("test.db" + suffix)
