# 🎰 Genies Speculation Market

A **local, play-money** speculation-market simulator. Trade live prediction
contracts, ride the crash multiplier, spin the wheel, flip and roll — all with
virtual **Genies Gold**. There is **no real currency**: nothing can be
deposited, purchased, or cashed out. It's a self-contained entertainment sim.

> Built for fans of the markets who want the thrill of speculation with zero
> financial risk.

---

## Quick start

No dependencies. You just need Node.js (v18+):

```bash
npm start          # or: node server.js
```

Then open **http://localhost:3000**.

Sign up (you get **1,000 Genies Gold** free), claim your daily **+250** drop,
and play. Accounts and balances persist locally in `data/accounts.json`.

---

## What's inside

### Local accounts + points system
- **`data/accounts.json`** is a tiny file-backed "database" — users, hashed
  passwords (Node `crypto.scryptSync` + per-user salt), and session tokens.
- Each account carries a **Genies Gold** balance plus lifetime stats
  (games played, won/lost, wagered, net profit, biggest win).
- All wagers settle **server-side** (`POST /api/play`) so balances can't be
  forged from the browser. The client never writes its own balance.

### The games (all mobile-friendly)
| Game | Mechanic | House edge |
|------|----------|-----------|
| 📈 **Prediction Market** | Buy YES/NO on a binary contract; payout scales with the odds you take | ~4% spread |
| 🚀 **Genie Crash** | Multiplier climbs from 1×; cash out before it busts (manual or auto) | ~1% |
| 🎡 **Fortune Wheel** | 20 weighted wedges, rare 8× jackpot | EV 0.95 |
| 🪙 **Lucky Flip** | Heads/tails, 1.96× on a correct call | ~2% |
| 🎲 **Speculator Dice** | Roll under your target; you set the odds & payout via a slider | ~1% |

Every game keeps an EV below 1, so balances can't be farmed infinitely — but the
free daily drop and starting stack keep the play money flowing.

### Lobby / conversion design
- High-saturation **electric-blue + gold** palette reserved for calls to action;
  muted neutral chrome everywhere else to keep attention on the action zones.
- Always-visible **balance chip** with animated count-ups on every win/loss.
- **Genies Gold tier ladder** (Drifter → Genie) with a live progress bar and
  badges — clear, constant feedback on advancement.
- **Live activity feed**, **online-player** counts, **daily bonus** countdown,
  and a real **leaderboard** fed by the API.

---

## Project layout

```
server.js               Zero-dependency Node HTTP server + JSON API
data/accounts.json      Local account & points store (seeded empty)
public/
  index.html            Lobby
  css/                  style.css (design system) + lobby.css + games.css
  js/
    app.js              API client, auth state, balance UI, toasts, modal
    game-shell.js       Shared topbar + reusable wager panel
    lobby.js            Lobby controller (games, feed, tiers, leaderboard)
    games/*.js          One controller per game
  games/*.html          One page per game
```

## API

| Method & path | Purpose |
|---|---|
| `POST /api/signup` | Create account (`{username, password, displayName?}`) → token + 1,000 Gold |
| `POST /api/login` | Authenticate → session token |
| `POST /api/logout` | Invalidate the current token |
| `GET  /api/me` | Current account (requires `Authorization: Bearer <token>`) |
| `POST /api/daily` | Claim the +250 daily drop (20h cooldown) |
| `POST /api/play` | Settle one round `{wager, multiplier, game}` → new balance |
| `GET  /api/leaderboard` | Top 25 by balance |

---

## A note on responsibility

This is a **simulation**. Genies Gold has **no monetary value**, there is no way
to deposit or withdraw, and the app is for entertainment only. The "conversion"
and engagement framing is applied to a harmless play-money loop — no real stakes
are ever involved.
