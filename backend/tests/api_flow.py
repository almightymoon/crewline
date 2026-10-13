"""End-to-end API walkthrough. Run: DATABASE_URL=... python -m tests.api_flow  (from backend/, on a freshly seeded DB)."""
import time
from fastapi.testclient import TestClient
from app.main import app

def wait(fn, t=3):
    s = time.time()
    while time.time() - s < t:
        r = fn()
        if r: return r
        time.sleep(0.05)
    return None

with TestClient(app) as c:
    def login(email, portal, pw="password123"):
        r = c.post(f"/api/auth/login/{portal}", json={"email": email, "password": pw})
        return r
    def H(email, portal, pw="password123"):
        r = login(email, portal, pw); assert r.status_code == 200, (email, portal, r.text)
        return {"Authorization": "Bearer " + r.json()["token"]}, r.json()

    # ---- separate portals ----
    assert login("helen@crewline.dev", "freelancer").status_code == 403
    print("client on freelancer portal:", login("helen@crewline.dev", "freelancer").json()["detail"])
    assert login("tomas@crewline.dev", "client").status_code == 403
    assert login("tomas@crewline.dev", "admin").status_code == 403
    assert login("admin@crewline.dev", "client", "admin12345").status_code == 403
    assert login("helen@crewline.dev", "client", "wrong-password").status_code == 401
    hc, cu = H("helen@crewline.dev", "client"); hf, fu = H("tomas@crewline.dev", "freelancer"); ha, au = H("admin@crewline.dev", "admin", "admin12345")
    print("roles:", cu["user"]["role"], fu["user"]["role"], au["user"]["role"])
    # admin blocked from member endpoints, members blocked from admin
    assert c.get("/api/admin/stats", headers=hc).status_code == 403
    assert c.get("/api/admin/stats", headers=hf).status_code == 403
    assert c.get("/api/admin/stats").status_code == 401
    assert c.get("/api/me/orders", headers=ha).status_code == 403
    assert c.get("/api/conversations", headers=ha).status_code == 403
    # brute-force throttle
    for _ in range(8): login("nobody@x.com", "client", "bad")
    print("throttle:", login("nobody@x.com", "client", "bad").status_code)

    # ---- notifications ----
    n = c.get("/api/notifications", headers=hc).json(); print("helen notifications:", len(n["items"]), "unread", n["unread"])
    print("mark one read ->", c.post("/api/notifications/read", headers=hc, json={"ids": [n["items"][0]["id"]]}).json())
    print("mark all read ->", c.post("/api/notifications/read", headers=hc, json={"all": True}).json())
    na = c.get("/api/notifications", headers=ha).json(); print("admin sees dispute notification:", [x["title"] for x in na["items"]])

    # ---- realtime messaging over WebSocket ----
    convs = c.get("/api/conversations", headers=hc).json()
    conv = next(x for x in convs if x["other"]["name"] == "Tomás Rivera"); cid = conv["id"]
    tok_c = cu["token"]; tok_f = fu["token"]
    with c.websocket_connect(f"/ws?token={tok_c}") as wc:
        with c.websocket_connect(f"/ws?token={tok_f}") as wf:
            # presence: helen should be told tomas came online (tomas connected second)
            p = wc.receive_json(); print("presence event:", p)
            assert p["t"] == "presence" and p["online"] is True
            print("conversation shows online:", [x["other"]["online"] for x in c.get("/api/conversations", headers=hc).json() if x["id"] == cid])
            wc.send_json({"t": "send", "conv": cid, "body": "Realtime hello", "cid": "tmp-1"})
            m1 = wc.receive_json(); m2 = wf.receive_json()
            print("sender echo:", m1["t"], m1["cid"], m1["message"]["body"], "| recipient got:", m2["t"], m2.get("cid"), m2["message"]["body"])
            assert m1["cid"] == "tmp-1" and m2["message"]["id"] == m1["message"]["id"] and "cid" not in m2 or m2.get("cid") is None
            wc.send_json({"t": "typing", "conv": cid}); ty = wf.receive_json(); print("typing:", ty)
            wf.send_json({"t": "read", "conv": cid})
            ev = [wf.receive_json(), wc.receive_json()]; print("read events:", sorted(e["t"] for e in ev))
            rd = next(e for e in ev if e["t"] == "read"); assert rd["by"] == fu["user"]["id"]
            wf.send_json({"t": "send", "conv": cid, "body": "Reply from Tomas", "cid": "tmp-2"})
            wf.receive_json(); got = wc.receive_json(); assert got["message"]["body"] == "Reply from Tomas"
            wc.send_json({"t": "send", "conv": 999999, "body": "nope"})  # not a participant -> ignored
            wc.send_json({"t": "ping"}); assert wc.receive_json()["t"] == "pong"
            print("unread via HTTP after ws:", c.get("/api/messages/unread", headers=hc).json())
        # tomas disconnected -> presence offline
        off = wc.receive_json(); print("offline event:", off); assert off["online"] is False
    # outsider cannot read a conversation
    hs, _ = H("sofia@crewline.dev", "freelancer")
    assert c.get(f"/api/conversations/{cid}/messages", headers=hs).status_code == 404
    # pagination
    page = c.get(f"/api/conversations/{cid}/messages?limit=2", headers=hc).json(); print("latest page:", len(page["messages"]), "has_more", page["has_more"])
    older = c.get(f"/api/conversations/{cid}/messages?limit=2&before_id={page['messages'][0]['id']}", headers=hc).json(); print("older page:", len(older["messages"]))
    # bad websocket token
    try:
        with c.websocket_connect("/ws?token=bad") as w: w.receive_json()
        print("BAD: accepted")
    except Exception as e: print("bad token rejected:", type(e).__name__)

    # ---- order + live notifications for the freelancer ----
    hn = None
    r = c.post("/api/auth/register", json={"email": "newc@x.com", "password": "password123", "name": "New Client", "role": "client"}); hn = {"Authorization": "Bearer " + r.json()["token"]}
    c.post("/api/wallet/deposit", headers=hn, json={"amount": 2000})
    with c.websocket_connect(f"/ws?token={tok_f}") as wf:
        oid = c.post("/api/gigs/2/orders", headers=hn, json={"tier": "basic", "requirements": "dashboard"}).json()["order_id"]
        seen = {wf.receive_json()["t"], wf.receive_json()["t"]}
        print("tomas live events after new order:", sorted(seen))
        assert "notification" in seen and "message" in seen
    print("tomas notifications:", [x["title"] for x in c.get("/api/notifications?limit=3", headers=hf).json()["items"]])
    # prefs: turn off orders notifications and verify none created
    c.put("/api/me/preferences", headers=hf, json={"orders": False, "proposals": True, "messages": True, "announcements": True})
    before = c.get("/api/notifications", headers=hf).json()["unread"]
    c.post("/api/gigs/2/orders", headers=hn, json={"tier": "basic"})
    print("muted orders -> unread unchanged:", before == c.get("/api/notifications", headers=hf).json()["unread"])

    # ---- dispute + admin resolution ----
    assert c.post(f"/api/orders/{oid}/dispute", headers=hn, json={"reason": "short"}).status_code == 422
    r = c.post(f"/api/orders/{oid}/dispute", headers=hn, json={"reason": "The freelancer has not responded for days."}); assert r.status_code == 200 and r.json()["disputed"]
    assert c.post(f"/api/orders/{oid}/start", headers=hf).status_code == 409
    assert c.post(f"/api/orders/{oid}/cancel", headers=hn).status_code == 409
    print("disputes (admin):", [(d["id"], d["title"][:25]) for d in c.get("/api/admin/orders?disputed=true", headers=ha).json()])
    bal_before = c.get("/api/wallet", headers=hn).json()["balance"]
    r = c.post(f"/api/admin/orders/{oid}/resolve", headers=ha, json={"decision": "refund", "note": "No delivery, refunding the client."}); print("resolve refund:", r.status_code, r.json()["status"], r.json()["disputed"])
    print("client balance", bal_before, "->", c.get("/api/wallet", headers=hn).json()["balance"])
    assert c.post(f"/api/admin/orders/{oid}/resolve", headers=ha, json={"decision": "refund", "note": "again again"}).status_code == 404
    seeded = next(d for d in c.get("/api/admin/orders?disputed=true", headers=ha).json())
    f_bal = c.get("/api/wallet", headers=hf).json()["balance"]
    r = c.post(f"/api/admin/orders/{seeded['id']}/resolve", headers=ha, json={"decision": "release", "note": "Work matches the agreed brief."}); print("resolve release:", r.status_code, r.json()["status"])

    # ---- admin: stats, users, suspend, settings, announcements, logs ----
    st = c.get("/api/admin/stats", headers=ha).json(); print("stats:", st["users"], "gmv", st["gmv"], "revenue", st["revenue"], "series days", len(st["series"]))
    us = c.get("/api/admin/users?q=sofia", headers=ha).json(); print("user search:", us["total"], us["items"][0]["email"])
    sid = us["items"][0]["id"]
    print("detail:", c.get(f"/api/admin/users/{sid}", headers=ha).json()["orders_list"][:1])
    hs, _ = H("sofia@crewline.dev", "freelancer")
    assert c.post(f"/api/admin/users/{sid}/suspend", headers=ha, json={"reason": "Spam"}).status_code == 200
    print("suspended login:", login("sofia@crewline.dev", "freelancer").json()["detail"], "| old token:", c.get("/api/auth/me", headers=hs).status_code)
    print("suspended hidden from directory:", all(f["name"] != "Sofia Petrova" for f in c.get("/api/freelancers").json()))
    c.post(f"/api/admin/users/{sid}/reactivate", headers=ha); print("reactivated:", login("sofia@crewline.dev", "freelancer").status_code)
    assert c.post(f"/api/admin/users/{au['user']['id']}/suspend", headers=ha, json={}).status_code == 403
    print("announce:", c.post("/api/admin/announcements", headers=ha, json={"title": "Scheduled maintenance", "body": "Sunday 2am UTC", "audience": "freelancer"}).json())
    print("settings:", c.put("/api/admin/settings", headers=ha, json={"buyer_fee_pct": 3, "seller_fee_pct": 8, "signups_enabled": True}).json())
    print("meta fees:", c.get("/api/meta").json()["fees"])
    r = c.post("/api/gigs/3/orders", headers=hn, json={"tier": "basic"}); o = c.get(f"/api/orders/{r.json()['order_id']}", headers=hn).json(); print("new order uses new fees:", o["amount"], o["buyer_fee"], o["seller_fee_pct"])
    c.put("/api/admin/settings", headers=ha, json={"buyer_fee_pct": 5, "seller_fee_pct": 10, "signups_enabled": False})
    print("signups paused ->", c.post("/api/auth/register", json={"email": "z@z.com", "password": "password123", "name": "Zed", "role": "client"}).status_code)
    c.put("/api/admin/settings", headers=ha, json={"buyer_fee_pct": 5, "seller_fee_pct": 10, "signups_enabled": True})
    print("logs:", [(l["action"], l["target"][:18]) for l in c.get("/api/admin/logs", headers=ha).json()[:5]])
    print("transactions:", len(c.get("/api/admin/transactions", headers=ha).json()), "gigs:", len(c.get("/api/admin/gigs", headers=ha).json()))
    print("freelancer sees admin announcement:", any(x["kind"] == "announcement" and "maintenance" in x["title"] for x in c.get("/api/notifications", headers=hf).json()["items"]))

    # ---- settings & profile ----
    print("account update:", c.put("/api/me/account", headers=hf, json={"name": "Tomás R.", "color": "#ff375f"}).json()["name"])
    assert c.put("/api/me/account", headers=hf, json={"email": "helen@crewline.dev"}).status_code == 409
    assert c.post("/api/me/password", headers=hf, json={"current": "nope", "new": "newpassword1"}).status_code == 403
    assert c.post("/api/me/password", headers=hf, json={"current": "password123", "new": "newpassword1"}).status_code == 200
    print("login with new password:", login("tomas@crewline.dev", "freelancer", "newpassword1").status_code)
    r = c.put("/api/me/profile", headers=hf, json={"languages": ["English", "Spanish"], "experience": [{"role": "Engineer", "company": "X", "period": "2020", "description": "d"}, {"role": "", "company": ""}], "portfolio": [{"title": "Site", "description": "", "link": "https://x.y"}], "visible": False})
    print("profile:", len(r.json()["profile"]["experience"]), "experience,", len(r.json()["profile"]["portfolio"]), "portfolio, visible", r.json()["profile"]["visible"])
    print("hidden profile public:", c.get(f"/api/freelancers/{fu['user']['id']}").status_code, "| self:", c.get(f"/api/freelancers/{fu['user']['id']}", headers=hf).status_code)
    c.put("/api/me/profile", headers=hf, json={"visible": True})
    assert c.post("/api/me/deactivate", headers=hf, json={"password": "newpassword1"}).status_code == 409
print("ALL GOOD")
