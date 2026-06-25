/*
 * Genies Speculation Market — local play-money simulation server.
 *
 * Zero dependencies. Uses only Node's standard library.
 *  - Serves the static front-end from /public
 *  - Provides a small JSON API backed by data/accounts.json
 *  - Accounts hold a balance of "Genies Gold" (virtual, play-money points)
 *
 * Run:  node server.js   (then open http://localhost:3000)
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

const STARTING_BALANCE = 1000;          // Genies Gold granted on signup
const DAILY_BONUS = 250;                // claimable once every 20 hours
const DAILY_COOLDOWN_MS = 20 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 *  Tiny JSON "database" (file-backed, synchronous, good enough local) *
 * ------------------------------------------------------------------ */

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify({ users: {}, sessions: {} }, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch (e) {
    return { users: {}, sessions: {} };
  }
}

function writeStore(store) {
  // write-to-temp + rename keeps the file from getting half-written on crash
  const tmp = ACCOUNTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, ACCOUNTS_FILE);
}

/* ------------------------------- *
 *  Auth helpers                   *
 * ------------------------------- */

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  // constant-time compare
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function newToken() {
  return crypto.randomBytes(24).toString('hex');
}

function publicUser(u) {
  return {
    username: u.username,
    displayName: u.displayName,
    balance: u.balance,
    createdAt: u.createdAt,
    stats: u.stats,
    lastDailyClaim: u.lastDailyClaim || 0,
    biggestWin: u.biggestWin || 0,
  };
}

/* ------------------------------- *
 *  HTTP plumbing                  *
 * ------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error('payload too large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function getToken(req) {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function userFromToken(store, token) {
  if (!token) return null;
  const username = store.sessions[token];
  if (!username) return null;
  return store.users[username] || null;
}

/* ------------------------------- *
 *  Validation                     *
 * ------------------------------- */

function validUsername(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(name);
}
function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 4 && pw.length <= 100;
}

/* ------------------------------- *
 *  API handlers                   *
 * ------------------------------- */

const api = {
  async 'POST /api/signup'(req, res) {
    const body = await readBody(req);
    const username = (body.username || '').trim();
    const password = body.password || '';
    const displayName = (body.displayName || username).trim().slice(0, 30);

    if (!validUsername(username))
      return sendJSON(res, 400, { error: 'Username must be 3-20 chars (letters, numbers, underscore).' });
    if (!validPassword(password))
      return sendJSON(res, 400, { error: 'Password must be at least 4 characters.' });

    const store = readStore();
    const key = username.toLowerCase();
    if (store.users[key])
      return sendJSON(res, 409, { error: 'That username is already taken.' });

    const { salt, hash } = hashPassword(password);
    const user = {
      username, displayName, salt, hash,
      balance: STARTING_BALANCE,
      createdAt: Date.now(),
      lastDailyClaim: 0,
      biggestWin: 0,
      stats: { played: 0, won: 0, lost: 0, wagered: 0, netProfit: 0 },
    };
    store.users[key] = user;

    const token = newToken();
    store.sessions[token] = key;
    writeStore(store);
    sendJSON(res, 201, { token, user: publicUser(user) });
  },

  async 'POST /api/login'(req, res) {
    const body = await readBody(req);
    const username = (body.username || '').trim();
    const password = body.password || '';
    const store = readStore();
    const key = username.toLowerCase();
    const user = store.users[key];
    if (!user || !verifyPassword(password, user.salt, user.hash))
      return sendJSON(res, 401, { error: 'Invalid username or password.' });

    const token = newToken();
    store.sessions[token] = key;
    writeStore(store);
    sendJSON(res, 200, { token, user: publicUser(user) });
  },

  async 'POST /api/logout'(req, res) {
    const token = getToken(req);
    const store = readStore();
    if (token && store.sessions[token]) {
      delete store.sessions[token];
      writeStore(store);
    }
    sendJSON(res, 200, { ok: true });
  },

  async 'GET /api/me'(req, res) {
    const store = readStore();
    const user = userFromToken(store, getToken(req));
    if (!user) return sendJSON(res, 401, { error: 'Not authenticated.' });
    sendJSON(res, 200, { user: publicUser(user) });
  },

  async 'POST /api/daily'(req, res) {
    const store = readStore();
    const user = userFromToken(store, getToken(req));
    if (!user) return sendJSON(res, 401, { error: 'Not authenticated.' });
    const now = Date.now();
    const elapsed = now - (user.lastDailyClaim || 0);
    if (elapsed < DAILY_COOLDOWN_MS) {
      return sendJSON(res, 429, {
        error: 'Bonus not ready yet.',
        readyInMs: DAILY_COOLDOWN_MS - elapsed,
      });
    }
    user.lastDailyClaim = now;
    user.balance += DAILY_BONUS;
    writeStore(store);
    sendJSON(res, 200, { user: publicUser(user), awarded: DAILY_BONUS });
  },

  /*
   * Settle a single game round on the server so balances can't be forged
   * client-side. The client sends the wager + the outcome multiplier that
   * the game logic produced; the server validates funds and records stats.
   *
   * Body: { wager:Number, multiplier:Number, game:String }
   *   multiplier 0   -> total loss
   *   multiplier 1   -> push (stake returned)
   *   multiplier 2   -> double, etc.
   */
  async 'POST /api/play'(req, res) {
    const store = readStore();
    const user = userFromToken(store, getToken(req));
    if (!user) return sendJSON(res, 401, { error: 'Not authenticated.' });

    const body = await readBody(req);
    const wager = Math.floor(Number(body.wager));
    const multiplier = Number(body.multiplier);
    const game = String(body.game || 'unknown').slice(0, 40);

    if (!Number.isFinite(wager) || wager <= 0)
      return sendJSON(res, 400, { error: 'Invalid wager.' });
    if (wager > user.balance)
      return sendJSON(res, 400, { error: 'Insufficient Genies Gold.' });
    if (!Number.isFinite(multiplier) || multiplier < 0 || multiplier > 1000)
      return sendJSON(res, 400, { error: 'Invalid multiplier.' });

    const payout = Math.floor(wager * multiplier);
    const delta = payout - wager;          // net change to balance

    user.balance += delta;
    user.stats.played += 1;
    user.stats.wagered += wager;
    user.stats.netProfit += delta;
    if (delta > 0) user.stats.won += 1;
    else if (delta < 0) user.stats.lost += 1;
    if (delta > (user.biggestWin || 0)) user.biggestWin = delta;

    writeStore(store);
    sendJSON(res, 200, {
      user: publicUser(user),
      payout,
      delta,
    });
  },

  async 'GET /api/leaderboard'(req, res) {
    const store = readStore();
    const rows = Object.values(store.users)
      .map((u) => ({
        displayName: u.displayName,
        balance: u.balance,
        biggestWin: u.biggestWin || 0,
        netProfit: (u.stats && u.stats.netProfit) || 0,
      }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 25);
    sendJSON(res, 200, { leaderboard: rows });
  },
};

/* ------------------------------- *
 *  Static file serving            *
 * ------------------------------- */

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  // prevent path traversal
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA-ish fallback for /games/* pretty paths
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404 — Not found</h1><p><a href="/">Back to lobby</a></p>');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ------------------------------- *
 *  Router                         *
 * ------------------------------- */

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const route = `${req.method} ${url.split('?')[0]}`;

  if (url.startsWith('/api/')) {
    const handler = api[route];
    if (!handler) return sendJSON(res, 404, { error: 'Unknown endpoint.' });
    try {
      await handler(req, res);
    } catch (e) {
      sendJSON(res, 400, { error: e.message || 'Bad request.' });
    }
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405); return res.end('Method Not Allowed');
  }
  serveStatic(req, res, url);
});

server.listen(PORT, () => {
  ensureStore();
  console.log(`\n  🎰  Genies Speculation Market running`);
  console.log(`      → http://localhost:${PORT}\n`);
});
