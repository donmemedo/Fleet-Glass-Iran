import os

os.environ["DB_PATH"] = "test.db"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

c = TestClient(app)


def test_api():
    assert c.get("/api/health").json() == {"ok": True}
    q = c.post("/api/quote", json={"vehicles": 100, "crack_rate": 20}).json()
    assert q["cracked"] == 20 and q["saved"] > 0 and q["with"] < q["without"]
    f = c.get("/api/fleet").json()
    assert sum(f["risk"].values()) == len(f["vehicles"]) == 48
    assert c.post("/api/requests", json={"company": "X", "name": "Ali", "phone": "0912", "fleet_size": 5, "city": "Tehran"}).status_code == 422
    r = c.post("/api/requests", json={"company": "Digi", "name": "Ali", "phone": "09121234567", "fleet_size": 80, "city": "Tehran"})
    assert r.status_code == 201
    assert c.get("/api/requests").json()[0]["company"] == "Digi"
    os.remove("test.db")
