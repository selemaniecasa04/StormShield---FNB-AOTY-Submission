"""End-to-end smoke test for the feature-phone channels (USSD + voice keypad).
Run against a freshly seeded server:  python3 tests/ussd_smoke.py [http://localhost:3000]
"""
import sys, time, json, requests

B = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
GOGO = "+27831110002"
fails = 0

def check(cond, label, extra=""):
    global fails
    print(("PASS " if cond else "FAIL ") + label, extra if not cond else "")
    if not cond:
        fails += 1

def ussd(sid, phone, inputs, headers=None):
    out = []
    for i in range(len(inputs) + 1):
        r = requests.post(B + "/api/ussd", data={"sessionId": sid, "serviceCode": "*120*7867#", "phoneNumber": phone, "text": "*".join(inputs[:i]), "networkCode": "65501"}, headers=headers or {})
        out.append(r.text)
    return out

# 1. Registered basic-phone user: main menu in isiZulu with risk header, toggle to English.
s = ussd("t-menu", GOGO, ["9"])
check(s[0].startswith("CON StormShield: Umlazi"), "main menu shows area + risk", s[0][:60])
check("I am safe" in s[1], "9 switches to English")
check(all(len(x) <= 200 for x in s), "screens fit a USSD page")

# 2. Safe check-in notifies family and stops calls.
s = ussd("t-safe", GOGO, ["9", "1", "2"])
check(s[-1].startswith("END") and "SAFE" in s[-1] and "family" in s[-1], "safe check-in ends session", s[-1])

# 3. Help request with details creates an urgent ticket.
s = ussd("t-help", GOGO, ["9", "2", "2", "4", "1", "1"])
check(s[-1].startswith("END Help request SS-"), "help request created", s[-1])

# 4. Invalid input re-prompts, 0 goes back.
s = ussd("t-nav", GOGO, ["9", "7", "0", "x"])
check("Invalid choice" in s[-1] and "I am safe" in s[-1], "invalid + back navigation", s[-1][:80])

# 5. Unregistered sandbox number registers in 5 steps.
new = "+27790%06d" % (int(time.time()) % 1000000)
s = ussd("t-reg", new, ["1", "Zanele", "1", "1", "5", "1"])
check(s[-1].startswith("END Welcome Zanele"), "registration by USSD", s[-1])

# 6. Non-demo numbers are refused without the gateway secret.
s = ussd("t-deny", "+27711234567", [])
check(s[0].startswith("END") and "cannot" in s[0], "unknown real number refused without secret")
check(requests.get(B + "/api/phone", params={"msisdn": "+27820000001"}).status_code == 403, "simulator cannot act as staff")

# 7. Voice call with keypad + follow-up questions.
r = requests.post(B + "/api/phone", json={"msisdn": GOGO, "action": "call_me"})
check(r.ok, "test call queued", r.text)
call = None
for _ in range(15):
    time.sleep(1)
    call = requests.get(B + "/api/phone", params={"msisdn": GOGO}).json()["call"]
    if call and call["status"] == "ringing":
        break
check(bool(call), "phone rings")
if call:
    tid = call["id"]
    post = lambda **k: requests.post(B + "/api/phone", json={"msisdn": GOGO, "targetId": tid, **k}).json()
    check(post(action="answer")["stage"] == "menu", "answered")
    q1 = post(action="key", key="4")
    check(q1.get("stage") == "question" and q1["question"]["id"] == "situation", "key 4 asks what is happening")
    check(post(action="answer_q", key="9")["stage"] == "question", "invalid follow-up re-asked")
    post(action="answer_q", key="2")
    done = post(action="answer_q", key="3")
    check(done.get("stage") == "done", "follow-ups complete")

# 8. SMS inbox has the emergency footer.
d = requests.get(B + "/api/phone", params={"msisdn": GOGO}).json()
check(d["inbox"] and all("EMERGENCY: Emergency 112" in m["body"] for m in d["inbox"]), "every SMS ends with emergency numbers")

# 9. Admin sees sessions with transcript and details.
a = requests.Session()
a.post(B + "/api/auth/login", json={"identifier": "selemani", "password": "1234"})
ph = a.get(B + "/api/admin/phones").json()
outs = {x["outcome"] for x in ph["sessions"]}
check({"safe", "help", "registered", "call_key_4"} <= outs, "admin sees all outcomes", outs)
ivr = next(x for x in ph["sessions"] if x["outcome"] == "call_key_4")
check(ivr["detail"].get("answers", {}).get("situation") == "Trapped or cut off" and ivr["ticket"]["people"] == 3, "follow-up answers on ticket", ivr["detail"])
help_s = next(x for x in ph["sessions"] if x["outcome"] == "help")
check(len(help_s["steps"]) == 7 and help_s["ticket"]["priority"] == "urgent", "help transcript + priority")
check(requests.get(B + "/api/admin/phones").status_code in (401, 403), "admin feed needs staff login")

# 10. Family (Thandi's app) sees Gogo's status.
t = requests.Session()
t.post(B + "/api/auth/login", json={"identifier": "thandi@stormshield.demo", "password": "Demo@2026"})
me = t.get(B + "/api/me").json()
g = next(f for f in me["family"] if f["name"].startswith("Gogo"))
check(g["status"] == "need_help" and g.get("basicPhone"), "family card synced", g)

print("\n%d failure(s)" % fails)
sys.exit(1 if fails else 0)
