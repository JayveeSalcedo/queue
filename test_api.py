import urllib.request
import json
import sys

BASE = "http://127.0.0.1:8000"

def post(url, data, token=None):
    req = urllib.request.Request(f"{BASE}{url}", data=json.dumps(data).encode('utf-8'))
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def get(url, token=None):
    req = urllib.request.Request(f"{BASE}{url}")
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def main():
    print("--- 1. Testing Root SPA Serving ---")
    with urllib.request.urlopen(f"{BASE}/") as resp:
        content = resp.read().decode('utf-8')
        print(f"SPA Status: {resp.status}, Content Length: {len(content)}, Title in HTML: {'Queue Management' in content}")

    print("\n--- 2. Testing Network Info ---")
    net = get("/api/network-info")
    print(f"Hostname: {net['hostname']}, Primary IP: {net['primary_ip']}, Port: {net['port']}")

    print("\n--- 3. Testing Admin Login ---")
    auth = post("/api/auth/login", {"username": "admin", "password": "admin123"})
    token = auth["access_token"]
    print(f"Logged in: {auth['user']['full_name']} ({auth['user']['role']})")

    print("\n--- 4. Testing Ticket Generation ---")
    r = post("/api/tickets/generate", {"queue_type": "REGULAR"})
    p = post("/api/tickets/generate", {"queue_type": "PRIORITY"})
    c = post("/api/tickets/generate", {"queue_type": "COMPLAINT"})
    print(f"Generated tickets: {r['queue_number']}, {p['queue_number']}, {c['queue_number']}")

    print("\n--- 5. Testing Counter Calling ---")
    c1_call = post("/api/counters/1/call-next", {}, token=token)
    print(f"Counter 1 called: {c1_call['ticket']['queue_number']} to {c1_call['ticket']['counter_name']}")

    c2_call = post("/api/counters/2/call-next", {}, token=token)
    print(f"Counter 2 called: {c2_call['ticket']['queue_number']} to {c2_call['ticket']['counter_name']}")

    c3_call = post("/api/counters/3/call-next", {}, token=token)
    print(f"Counter 3 called: {c3_call['ticket']['queue_number']} to {c3_call['ticket']['counter_name']}")

    print("\n--- 6. Testing Counter Recall & Complete ---")
    recall = post("/api/counters/1/recall", {}, token=token)
    print(f"Recall response: {recall['message']}")
    comp = post("/api/counters/1/complete", {}, token=token)
    print(f"Complete response: {comp['message']}")

    print("\n--- 7. Testing Waiting Queue List on Side ---")
    # Generate 2 additional regular tickets
    r2 = post("/api/tickets/generate", {"queue_type": "REGULAR"})
    r3 = post("/api/tickets/generate", {"queue_type": "REGULAR"})
    print(f"Generated extra tickets: {r2['queue_number']}, {r3['queue_number']}")
    status_snap = get("/api/tickets/status")
    waiting_list = status_snap.get("waiting_tickets", [])
    print(f"Waiting tickets in side queue list: {len(waiting_list)}")
    for wt in waiting_list:
        print(f"  In Queue: #{wt['number_seq']} {wt['queue_number']} ({wt['queue_type']})")

    print("\n--- 8. Testing Call Specific Ticket from Side List ---")
    call_spec = post("/api/counters/1/call-ticket", {"ticket_id": r3["id"]}, token=token)
    print(f"Called specific ticket {r3['queue_number']} directly: {call_spec['ticket']['queue_number']}")

    print("\n--- 9. Testing Admin Metrics ---")
    metrics = get("/api/admin/metrics", token=token)
    print(f"Today total tickets: {metrics['status_counts']['TOTAL']}, Completed: {metrics['status_counts']['COMPLETED']}")

    print("\n--- 10. Testing Database Backup ---")
    bk = post("/api/admin/backup-db", {}, token=token)
    print(f"Backup created: {bk['filename']} ({bk['size_kb']} KB)")

    print("\n[ALL TESTS PASSED SUCCESSFULLY!]")

if __name__ == "__main__":
    main()
