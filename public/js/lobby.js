/* ==========================================================================
   Lobby controller
   ========================================================================== */
(function () {
  'use strict';
  const { Auth, API, el, toast, fmt } = window.Genies;

  /* ----------------------------- Game catalog ----------------------------- */
  const GAMES = [
    {
      id: 'market', name: 'Prediction Market', icon: '📈', art: 'art-market',
      tag: { class: 'pill-hot', label: '🔥 Hot' },
      desc: 'Buy YES or NO on live event contracts. Price moves, you profit on the swing.',
      href: '/games/market.html', base: 312,
    },
    {
      id: 'crash', name: 'Genie Crash', icon: '🚀', art: 'art-crash',
      tag: { class: 'pill-live', label: 'Live' },
      desc: 'The multiplier climbs… cash out before it crashes. Nerve beats luck.',
      href: '/games/crash.html', base: 408,
    },
    {
      id: 'wheel', name: 'Fortune Wheel', icon: '🎡', art: 'art-wheel',
      tag: { class: 'pill-new', label: 'New' },
      desc: 'Spin the tiered wheel. Land the gold wedge for a 20× Gold blowout.',
      href: '/games/wheel.html', base: 221,
    },
    {
      id: 'flip', name: 'Lucky Flip', icon: '🪙', art: 'art-flip',
      tag: null,
      desc: 'Heads or tails, double or nothing. The fastest two-tap wager on the floor.',
      href: '/games/flip.html', base: 174,
    },
    {
      id: 'dice', name: 'Speculator Dice', icon: '🎲', art: 'art-dice',
      tag: null,
      desc: 'Set your target, drag the risk slider, roll. You pick the odds and the payout.',
      href: '/games/dice.html', base: 196,
    },
  ];

  function renderGames() {
    const grid = document.getElementById('gameGrid');
    grid.innerHTML = '';
    GAMES.forEach((g) => {
      const players = g.base + Math.floor(Math.random() * 90);
      const card = el('a', { class: 'game-card', href: g.href },
        el('div', { class: 'game-art ' + g.art },
          el('span', { class: 'shine' }),
          g.icon
        ),
        el('div', { class: 'game-badges' },
          g.tag ? el('span', { class: 'pill ' + g.tag.class },
            g.tag.class === 'pill-live' ? el('span', { class: 'dot' }) : '', ' ' + g.tag.label) : ''
        ),
        el('div', { class: 'game-body' },
          el('h3', null, g.name),
          el('p', null, g.desc),
          el('div', { class: 'game-meta' },
            el('span', { class: 'pill pill-new' }, 'Play now'),
            el('span', { class: 'players' }, '● ' + players + ' playing')
          )
        )
      );
      grid.append(card);
    });
  }

  /* ----------------------------- Live activity feed (social proof) ----------------------------- */
  const NAMES = ['Vega', 'Nova_7', 'KaiR', 'Mira', 'Zephyr', 'OracleX', 'Lumen', 'Bishop', 'Echo', 'Saint', 'Rook', 'Pixel', 'Drift', 'Cobalt', 'Ariq', 'Sable', 'Juno', 'Wren', 'Atlas', 'Indi'];
  const FEED_GAMES = ['Genie Crash', 'Fortune Wheel', 'Prediction Market', 'Lucky Flip', 'Speculator Dice'];
  function feedTick() {
    const list = document.getElementById('activityFeed');
    if (!list) return;
    const name = NAMES[Math.floor(Math.random() * NAMES.length)];
    const game = FEED_GAMES[Math.floor(Math.random() * FEED_GAMES.length)];
    const amt = [50, 75, 120, 240, 500, 750, 1200, 2400, 4800][Math.floor(Math.random() * 9)];
    const item = el('li', { class: 'activity-item' },
      el('span', { class: 'activity-avatar' }, name[0]),
      el('span', { class: 'who' }, name),
      el('span', { class: 'muted', style: 'font-size:.8rem' }, ' won on ' + game),
      el('span', { class: 'amt win-text' }, '+' + fmt(amt) + ' 🪙')
    );
    list.prepend(item);
    while (list.children.length > 6) list.lastChild.remove();
  }

  function livePlayersTick() {
    const node = document.getElementById('livePlayers');
    if (!node) return;
    const base = 1240 + Math.floor(Math.random() * 120);
    node.textContent = fmt(base);
  }

  /* ----------------------------- Daily bonus ----------------------------- */
  function fmtCountdown(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  }
  let dailyTimer = null;
  function renderDaily() {
    const btn = document.getElementById('dailyBtn');
    const msg = document.getElementById('dailyMsg');
    const u = Auth.user;
    if (dailyTimer) { clearInterval(dailyTimer); dailyTimer = null; }
    if (!u) {
      btn.textContent = 'Claim +250';
      btn.disabled = false;
      msg.innerHTML = 'Log in to claim a free <span class="gold-text">+250 Gold</span> top-up.';
      return;
    }
    const COOLDOWN = 20 * 60 * 60 * 1000;
    const since = Date.now() - (u.lastDailyClaim || 0);
    if (since >= COOLDOWN) {
      btn.textContent = 'Claim +250';
      btn.disabled = false;
      msg.innerHTML = 'Your <span class="gold-text">+250 Gold</span> drop is ready. Claim it before you play.';
    } else {
      btn.disabled = true;
      msg.innerHTML = 'Next free drop in <b id="dailyCd"></b>.';
      const tick = () => {
        const left = COOLDOWN - (Date.now() - (u.lastDailyClaim || 0));
        const cd = document.getElementById('dailyCd');
        if (cd) cd.textContent = fmtCountdown(left);
        if (left <= 0) renderDaily();
      };
      tick();
      dailyTimer = setInterval(tick, 30000);
      btn.textContent = 'Claimed ✓';
    }
  }
  document.getElementById('dailyBtn').addEventListener('click', async () => {
    if (!Auth.user) return window.Genies.openAuthModal('signup');
    try {
      const res = await API.daily();
      Auth.setUser(res.user);
      toast(`Daily drop claimed! +${fmt(res.awarded)} Gold`, 'gold');
      renderDaily();
    } catch (e) {
      if (e.status === 429) { toast('Bonus not ready yet.', ''); renderDaily(); }
      else toast(e.message, 'loss');
    }
  });

  /* ----------------------------- Tier / Genies Gold progression ----------------------------- */
  const TIERS = [
    { name: 'Drifter', min: 0, icon: '🌫️' },
    { name: 'Trader', min: 1500, icon: '📊' },
    { name: 'Speculator', min: 5000, icon: '🎯' },
    { name: 'High Roller', min: 15000, icon: '💎' },
    { name: 'Market Mover', min: 50000, icon: '👑' },
    { name: 'Genie', min: 150000, icon: '🧞' },
  ];
  function renderTier() {
    const u = Auth.user;
    const nameNode = document.getElementById('tierName');
    const balNode = document.getElementById('tierBalance');
    const fill = document.getElementById('tierFill');
    const prog = document.getElementById('tierProgress');
    const next = document.getElementById('tierNext');
    const badges = document.getElementById('tierBadges');

    badges.innerHTML = '';
    TIERS.forEach((t) => {
      const reached = u && u.balance >= t.min;
      badges.append(el('div', { class: 'tier-badge' + (reached ? ' reached' : '') },
        el('span', { class: 'ic' }, t.icon), t.name));
    });

    if (!u) {
      nameNode.textContent = 'Sign in to start your climb';
      balNode.textContent = '—';
      fill.style.width = '0%';
      prog.textContent = 'Reach the next tier to unlock a new badge.';
      next.textContent = '';
      return;
    }
    balNode.textContent = fmt(u.balance);
    let cur = TIERS[0], nxt = null;
    for (let i = 0; i < TIERS.length; i++) {
      if (u.balance >= TIERS[i].min) { cur = TIERS[i]; nxt = TIERS[i + 1] || null; }
    }
    nameNode.textContent = cur.icon + '  ' + cur.name;
    if (nxt) {
      const pct = Math.min(100, ((u.balance - cur.min) / (nxt.min - cur.min)) * 100);
      fill.style.width = pct.toFixed(1) + '%';
      prog.textContent = `${fmt(nxt.min - u.balance)} Gold to ${nxt.name}`;
      next.textContent = nxt.icon + ' ' + nxt.name;
    } else {
      fill.style.width = '100%';
      prog.textContent = 'Top tier reached — you are a Genie. 🧞';
      next.textContent = '';
    }
  }

  /* ----------------------------- Leaderboard ----------------------------- */
  async function renderBoard() {
    const body = document.getElementById('boardBody');
    try {
      const { leaderboard } = await API.leaderboard();
      if (!leaderboard.length) {
        body.innerHTML = '<tr><td colspan="4" class="center faint" style="padding:26px">Be the first on the board — sign up and play.</td></tr>';
        return;
      }
      body.innerHTML = '';
      const myName = Auth.user && Auth.user.displayName;
      leaderboard.forEach((r, i) => {
        const rank = i + 1;
        const tr = el('tr', { class: r.displayName === myName ? 'me' : '' },
          el('td', null, el('span', { class: 'rank r' + rank }, '' + rank)),
          el('td', null, el('strong', null, r.displayName)),
          el('td', { class: 'num win-text' }, r.biggestWin > 0 ? '+' + fmt(r.biggestWin) : '—'),
          el('td', { class: 'num gold-text' }, fmt(r.balance) + ' 🪙')
        );
        body.append(tr);
      });
    } catch (e) {
      body.innerHTML = '<tr><td colspan="4" class="center loss-text" style="padding:26px">Could not load standings.</td></tr>';
    }
  }

  /* ----------------------------- Wire up ----------------------------- */
  document.getElementById('loginBtn').addEventListener('click', () => window.Genies.openAuthModal('login'));
  document.getElementById('signupBtn').addEventListener('click', () => window.Genies.openAuthModal('signup'));
  document.getElementById('heroPlay').addEventListener('click', () => {
    if (Auth.user) document.getElementById('games').scrollIntoView();
    else window.Genies.openAuthModal('signup');
  });
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await Auth.logout(); toast('Logged out.'); renderDaily(); renderTier(); renderBoard();
  });

  Auth.onChange(() => { renderDaily(); renderTier(); renderBoard(); });
  document.addEventListener('genies:auth', () => { renderDaily(); renderTier(); renderBoard(); });

  // init
  renderGames();
  renderBoard();
  for (let i = 0; i < 5; i++) setTimeout(feedTick, i * 250);
  setInterval(feedTick, 3200);
  livePlayersTick();
  setInterval(livePlayersTick, 5000);
})();
