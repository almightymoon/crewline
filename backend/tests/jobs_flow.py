"""Find Jobs filters/sort/facets, job detail with client history, client reviews. Run on a freshly seeded DB."""
from fastapi.testclient import TestClient
from app.main import app

with TestClient(app) as c:
    def H(email, portal):
        r = c.post(f"/api/auth/login/{portal}", json={"email": email, "password": "password123"}); assert r.status_code == 200, r.text
        return {"Authorization": "Bearer " + r.json()["token"]}
    hf = H("tomas@crewline.dev", "freelancer"); hc = H("helen@crewline.dev", "client")
    S = lambda qs="", h=None: c.get("/api/jobs/search" + ("?" + qs if qs else ""), headers=h or {})
    r = S().json(); print("all open:", r["total"], "| first:", r["items"][0]["title"], "| facets:", {k: v for k, v in r["facets"].items()})
    it = r["items"][0]; print("item has stats:", it["client_stats"]["hire_rate"], it["client_stats"]["rating"], it["client_stats"]["total_spent"], it["experience_level"], it["duration"])
    print("category=dev:", [j["title"][:24] for j in S("category=dev").json()["items"]])
    print("category=dev,design:", S("category=dev,design").json()["total"])
    print("experience=expert:", S("experience=expert").json()["total"], "| duration=week:", S("duration=week").json()["total"])
    print("budget 500-1500:", [j["budget"] for j in S("min_budget=500&max_budget=1500").json()["items"]])
    print("skills=figma:", [j["title"][:20] for j in S("skills=figma").json()["items"]])
    print("verified:", S("verified=true").json()["total"], "unverified excluded:", S("verified=true").json()["total"] < S().json()["total"])
    print("min_rating=4.5:", S("min_rating=4.5").json()["total"], "| min_spent=20000:", [j["client"]["company"] for j in S("min_spent=20000").json()["items"]][:3])
    print("proposals 0-1:", S("max_proposals=1").json()["total"], "| >=2:", S("min_proposals=2").json()["total"])
    print("posted_within 24h:", S("posted_within=24").json()["total"], "| 168h:", S("posted_within=168").json()["total"])
    print("q=api:", [j["title"][:24] for j in S("q=api").json()["items"]])
    for srt in ["newest", "budget_high", "budget_low", "fewest_proposals", "client_rating", "client_spent"]:
        its = S("sort=" + srt).json()["items"]; key = {"newest": "created_at", "budget_high": "budget", "budget_low": "budget", "fewest_proposals": "proposals_count", "client_rating": None, "client_spent": None}[srt]
        print(f"sort {srt}:", [j[key] if key else (j["client_stats"]["rating"] if srt == "client_rating" else j["client_stats"]["total_spent"]) for j in its][:5] if key != "created_at" else [j["id"] for j in its][:5])
    print("pagination:", [j["id"] for j in S("limit=3&offset=0").json()["items"]], [j["id"] for j in S("limit=3&offset=3").json()["items"]])
    # applied / best match for a freelancer
    t = S("", hf).json(); applied = [j["title"][:20] for j in t["items"] if j.get("applied")]; print("tomas applied:", applied)
    print("hide applied:", S("applied=hide", hf).json()["total"], "| only applied:", S("applied=only", hf).json()["total"], "| client ignores applied filter:", S("applied=only", hc).json()["total"] == S().json()["total"])
    bm = S("sort=best_match", hf).json()["items"]; print("best match order:", [(j["title"][:18], j["match"]) for j in bm[:4]])
    # detail
    d = c.get("/api/jobs/1", headers=hf).json()
    print("detail keys ok:", all(k in d for k in ["client_stats", "client_reviews", "client_jobs", "similar", "bids", "experience_level", "duration"]))
    print("client stats:", d["client_stats"]); print("bids:", d["bids"]); print("reviews:", [(r["freelancer"]["name"], r["rating"]) for r in d["client_reviews"]][:3], "| past jobs:", [(j["title"][:20], j["status"]) for j in d["client_jobs"]][:3], "| similar:", [j["id"] for j in d["similar"]], "| match:", d["match"])
    d2 = c.get("/api/jobs/2", headers=hf).json(); print("tomas proposal on job 2:", d2["my_proposal_status"], d2["my_proposal"]["bid"] if d2["my_proposal"] else None)
    cd = c.get("/api/clients/13").json(); print("client profile:", cd["profile"]["company"], cd["stats"]["rating"], len(cd["reviews"]), "reviews,", len(cd["open_jobs"]), "open,", len(cd["past_jobs"]), "past")
    # post job with new fields
    r = c.post("/api/jobs", headers=hc, json={"title": "Build a data dashboard", "category": "data", "description": "We need a clean dashboard for our weekly sales numbers.", "skills": ["Python"], "budget": 700, "experience_level": "expert", "duration": "quarter"}); print("create job:", r.status_code)
    nj = c.get(f"/api/jobs/{r.json()['id']}").json(); print("new job fields:", nj["experience_level"], nj["duration"])
    assert c.post("/api/jobs", headers=hc, json={"title": "Build a data dashboard", "category": "data", "description": "We need a clean dashboard for our weekly sales numbers.", "budget": 700, "experience_level": "godlike"}).status_code == 422
    # freelancer reviews client after a released order (full flow with a fresh client)
    r = c.post("/api/auth/register", json={"email": "rev@x.com", "password": "password123", "name": "Rev Client", "role": "client", "company": "RevCo"}); hn = {"Authorization": "Bearer " + r.json()["token"]}; nid = r.json()["user"]["id"]
    c.post("/api/wallet/deposit", headers=hn, json={"amount": 500})
    oid = c.post("/api/gigs/11/orders", headers=hn, json={"tier": "basic"}).json()["order_id"]
    print("review before release:", c.post(f"/api/orders/{oid}/client-review", headers=hf, json={"rating": 5}).status_code)
    c.post(f"/api/orders/{oid}/start", headers=hf); c.post(f"/api/orders/{oid}/deliver", headers=hf, json={}); c.post(f"/api/orders/{oid}/release", headers=hn)
    o = c.get(f"/api/orders/{oid}", headers=hf).json(); print("client_review before:", o["client_review"])
    before = c.get(f"/api/clients/{nid}").json()["stats"]
    r = c.post(f"/api/orders/{oid}/client-review", headers=hf, json={"rating": 5, "comment": "Great client, clear scope."}); print("client review:", r.status_code)
    print("duplicate:", c.post(f"/api/orders/{oid}/client-review", headers=hf, json={"rating": 5}).status_code, "| as client:", c.post(f"/api/orders/{oid}/client-review", headers=hn, json={"rating": 5}).status_code)
    after = c.get(f"/api/clients/{nid}").json(); print("client stats before/after:", before["rating"], before["reviews_count"], "->", after["stats"]["rating"], after["stats"]["reviews_count"], "| shows:", after["reviews"][0]["comment"], "|", after["reviews"][0]["freelancer"]["name"])
    print("order now has client_review:", c.get(f"/api/orders/{oid}", headers=hn).json()["client_review"]["rating"])
    print("client notified:", [n["title"] for n in c.get("/api/notifications?limit=2", headers=hn).json()["items"]])
print("JOBS FLOW OK")
