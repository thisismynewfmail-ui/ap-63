#!/usr/bin/env python3
"""
Genies Speculation Market — Python server.

Zero dependencies (stdlib only).  Serves the static front-end from ./public
and provides a small JSON API backed by ./data/accounts.json.

Usage:
    python3 server.py              # default port 3000
    python3 server.py 8080         # custom port

Binds to 0.0.0.0 so it is reachable over the local network.
"""
import http.server
import socketserver
import json
import os
import hashlib
import hmac
import secrets
import time
import mimetypes
import threading
import math
import sys
import socket
from urllib.parse import urlparse

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PORT            = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
ROOT            = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR      = os.path.join(ROOT, "public")
DATA_DIR        = os.path.join(ROOT, "data")
ACCOUNTS_FILE   = os.path.join(DATA_DIR, "accounts.json")

STARTING_BALANCE    = 1_000
DAILY_BONUS         = 250
DAILY_COOLDOWN_S    = 20 * 60 * 60   # 20 hours

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg":  "image/svg+xml",
    ".png":  "image/png",
    ".ico":  "image/x-icon",
    ".woff2":"font/woff2",
}

# ---------------------------------------------------------------------------
# Thread-safe JSON store
# ---------------------------------------------------------------------------
_store_lock = threading.Lock()

def _ensure_store():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(ACCOUNTS_FILE):
        with open(ACCOUNTS_FILE, "w") as f:
            json.dump({"users": {}, "sessions": {}}, f, indent=2)

def read_store():
    _ensure_store()
    with open(ACCOUNTS_FILE, "r") as f:
        return json.load(f)

def write_store(store):
    tmp = ACCOUNTS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(store, f, indent=2)
    os.replace(tmp, ACCOUNTS_FILE)

# ---------------------------------------------------------------------------
# Auth / crypto helpers
# ---------------------------------------------------------------------------
def hash_password(password: str, salt: str = None):
    if salt is None:
        salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), salt.encode(), 260_000
    )
    return salt, dk.hex()

def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    _, h = hash_password(password, salt)
    return hmac.compare_digest(h, expected_hash)

def new_token() -> str:
    return secrets.token_hex(24)

def public_user(u: dict) -> dict:
    return {
        "username":      u["username"],
        "displayName":   u["displayName"],
        "balance":       u["balance"],
        "createdAt":     u["createdAt"],
        "stats":         u["stats"],
        "lastDailyClaim":u.get("lastDailyClaim", 0),
        "biggestWin":    u.get("biggestWin", 0),
    }

def valid_username(name: str) -> bool:
    import re
    return bool(re.fullmatch(r"[a-zA-Z0-9_]{3,20}", name or ""))

def valid_password(pw: str) -> bool:
    return isinstance(pw, str) and 4 <= len(pw) <= 100

# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------
class GenieHandler(http.server.BaseHTTPRequestHandler):

    # suppress standard access log — we print our own minimal version
    def log_message(self, fmt, *args):
        pass

    def log_request_line(self):
        print(f"  {self.command} {self.path}")

    # ------------------------------------------------------------------ #
    # Helpers                                                              #
    # ------------------------------------------------------------------ #
    def send_json(self, status: int, obj: dict):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(min(length, 1_000_000))
        return json.loads(raw)

    def get_token(self) -> str | None:
        auth = self.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            return auth[7:].strip()
        return None

    def user_from_token(self, store: dict) -> dict | None:
        token = self.get_token()
        if not token:
            return None
        username = store["sessions"].get(token)
        if not username:
            return None
        return store["users"].get(username)

    # ------------------------------------------------------------------ #
    # Routing                                                              #
    # ------------------------------------------------------------------ #
    def do_GET(self):
        self.log_request_line()
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self._dispatch_api("GET", path)
        else:
            self._serve_static(path)

    def do_POST(self):
        self.log_request_line()
        path = urlparse(self.path).path
        self._dispatch_api("POST", path)

    def _dispatch_api(self, method: str, path: str):
        route = f"{method} {path}"
        handler = {
            "POST /api/signup":      self._api_signup,
            "POST /api/login":       self._api_login,
            "POST /api/logout":      self._api_logout,
            "GET /api/me":           self._api_me,
            "POST /api/daily":       self._api_daily,
            "POST /api/play":        self._api_play,
            "GET /api/leaderboard":  self._api_leaderboard,
        }.get(route)

        if handler is None:
            self.send_json(404, {"error": "Unknown endpoint."})
            return
        try:
            with _store_lock:
                handler()
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON."})
        except Exception as e:
            self.send_json(400, {"error": str(e) or "Bad request."})

    # ------------------------------------------------------------------ #
    # API endpoints                                                        #
    # ------------------------------------------------------------------ #
    def _api_signup(self):
        body = self.read_body()
        username    = (body.get("username") or "").strip()
        password    = body.get("password") or ""
        display     = (body.get("displayName") or username).strip()[:30]

        if not valid_username(username):
            return self.send_json(400, {"error": "Username must be 3-20 chars (letters, numbers, underscore)."})
        if not valid_password(password):
            return self.send_json(400, {"error": "Password must be at least 4 characters."})

        store = read_store()
        key = username.lower()
        if key in store["users"]:
            return self.send_json(409, {"error": "That username is already taken."})

        salt, pw_hash = hash_password(password)
        user = {
            "username":      username,
            "displayName":   display,
            "salt":          salt,
            "hash":          pw_hash,
            "balance":       STARTING_BALANCE,
            "createdAt":     int(time.time() * 1000),
            "lastDailyClaim":0,
            "biggestWin":    0,
            "stats": {"played": 0, "won": 0, "lost": 0, "wagered": 0, "netProfit": 0},
        }
        store["users"][key] = user
        token = new_token()
        store["sessions"][token] = key
        write_store(store)
        self.send_json(201, {"token": token, "user": public_user(user)})

    def _api_login(self):
        body = self.read_body()
        username = (body.get("username") or "").strip()
        password = body.get("password") or ""
        store = read_store()
        key = username.lower()
        user = store["users"].get(key)
        if not user or not verify_password(password, user["salt"], user["hash"]):
            return self.send_json(401, {"error": "Invalid username or password."})
        token = new_token()
        store["sessions"][token] = key
        write_store(store)
        self.send_json(200, {"token": token, "user": public_user(user)})

    def _api_logout(self):
        token = self.get_token()
        store = read_store()
        if token and token in store["sessions"]:
            del store["sessions"][token]
            write_store(store)
        self.send_json(200, {"ok": True})

    def _api_me(self):
        store = read_store()
        user = self.user_from_token(store)
        if not user:
            return self.send_json(401, {"error": "Not authenticated."})
        self.send_json(200, {"user": public_user(user)})

    def _api_daily(self):
        store = read_store()
        user = self.user_from_token(store)
        if not user:
            return self.send_json(401, {"error": "Not authenticated."})
        now_ms = int(time.time() * 1000)
        elapsed_ms = now_ms - user.get("lastDailyClaim", 0)
        cooldown_ms = DAILY_COOLDOWN_S * 1000
        if elapsed_ms < cooldown_ms:
            return self.send_json(429, {
                "error": "Bonus not ready yet.",
                "readyInMs": cooldown_ms - elapsed_ms,
            })
        user["lastDailyClaim"] = now_ms
        user["balance"] += DAILY_BONUS
        write_store(store)
        self.send_json(200, {"user": public_user(user), "awarded": DAILY_BONUS})

    def _api_play(self):
        store = read_store()
        user = self.user_from_token(store)
        if not user:
            return self.send_json(401, {"error": "Not authenticated."})

        body = self.read_body()
        try:
            wager      = int(float(body.get("wager", 0)))
            multiplier = float(body.get("multiplier", 0))
            game       = str(body.get("game", "unknown"))[:40]
        except (TypeError, ValueError):
            return self.send_json(400, {"error": "Invalid wager or multiplier."})

        if wager <= 0 or not math.isfinite(wager):
            return self.send_json(400, {"error": "Invalid wager."})
        if wager > user["balance"]:
            return self.send_json(400, {"error": "Insufficient Genies Gold."})
        if not (math.isfinite(multiplier) and 0 <= multiplier <= 1000):
            return self.send_json(400, {"error": "Invalid multiplier."})

        payout = int(wager * multiplier)
        delta  = payout - wager

        user["balance"] += delta
        user["stats"]["played"] += 1
        user["stats"]["wagered"] += wager
        user["stats"]["netProfit"] += delta
        if delta > 0:
            user["stats"]["won"] += 1
        elif delta < 0:
            user["stats"]["lost"] += 1
        if delta > user.get("biggestWin", 0):
            user["biggestWin"] = delta

        write_store(store)
        self.send_json(200, {"user": public_user(user), "payout": payout, "delta": delta})

    def _api_leaderboard(self):
        store = read_store()
        rows = sorted(
            [
                {
                    "displayName": u["displayName"],
                    "balance":     u["balance"],
                    "biggestWin":  u.get("biggestWin", 0),
                    "netProfit":   u.get("stats", {}).get("netProfit", 0),
                }
                for u in store["users"].values()
            ],
            key=lambda r: r["balance"],
            reverse=True,
        )[:25]
        self.send_json(200, {"leaderboard": rows})

    # ------------------------------------------------------------------ #
    # Static file serving                                                  #
    # ------------------------------------------------------------------ #
    def _serve_static(self, url_path: str):
        if url_path == "/":
            url_path = "/index.html"

        # prevent path traversal
        rel  = os.path.normpath(url_path.lstrip("/"))
        full = os.path.realpath(os.path.join(PUBLIC_DIR, rel))
        if not full.startswith(os.path.realpath(PUBLIC_DIR)):
            self.send_response(403)
            self.end_headers()
            return

        if not os.path.isfile(full):
            body = b"<h1>404 \xe2\x80\x94 Not found</h1><p><a href='/'>Back to lobby</a></p>"
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        ext  = os.path.splitext(full)[1].lower()
        mime = MIME.get(ext, "application/octet-stream")
        size = os.path.getsize(full)
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(size))
        self.end_headers()
        with open(full, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)


# ---------------------------------------------------------------------------
# Threaded server so concurrent requests don't queue
# ---------------------------------------------------------------------------
class ThreadedServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


# ---------------------------------------------------------------------------
# Local-network IP discovery
# ---------------------------------------------------------------------------
def local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    _ensure_store()
    server = ThreadedServer(("0.0.0.0", PORT), GenieHandler)
    ip = local_ip()
    print()
    print("  🎰  Genies Speculation Market")
    print(f"      Local   → http://localhost:{PORT}")
    print(f"      Network → http://{ip}:{PORT}")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Shutting down.")
        server.shutdown()
