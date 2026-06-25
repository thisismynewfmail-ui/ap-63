/* ==========================================================================
   Shared game shell — topbar + reusable wager panel
   Every game page calls Genies.mountTopbar() and (usually) builds a WagerPanel.
   ========================================================================== */
(function () {
  'use strict';
  const G = window.Genies;
  const { Auth, el, toast, fmt } = G;

  /* Inject the same topbar used on the lobby so balance stays in view. */
  function mountTopbar(target) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    host.innerHTML = `
      <div class="topbar-inner">
        <a class="brand" href="/">
          <img src="/club.svg" alt="" />
          <div><b>Genies <span>Speculation</span></b><small>Play-money market sim</small></div>
        </a>
        <div class="topbar-spacer"></div>
        <div class="balance-chip" data-balance data-value="0" title="Your Genies Gold">
          <span class="coin">🪙</span><span data-balance-num>—</span>
        </div>
        <div class="row" data-guest-actions>
          <button class="btn btn-ghost" data-login>Log in</button>
          <button class="btn btn-gold pulse" data-signup>Play free</button>
        </div>
        <div class="user-menu hidden" data-user-actions>
          <div class="avatar" data-avatar>?</div>
          <button class="btn btn-ghost" data-logout>Log out</button>
        </div>
      </div>`;
    host.querySelector('[data-login]').addEventListener('click', () => G.openAuthModal('login'));
    host.querySelector('[data-signup]').addEventListener('click', () => G.openAuthModal('signup'));
    host.querySelector('[data-logout]').addEventListener('click', async () => {
      await Auth.logout(); toast('Logged out.');
    });
    G.renderTopbar();
  }

  /*
   * WagerPanel
   *  opts: {
   *    mount,            // element to render into
   *    min, max,         // wager bounds (max defaults to balance)
   *    payoutLabel,      // text before the potential payout value
   *    multiplier,       // fn() -> current potential multiplier (for payout preview)
   *    playLabel,        // CTA text
   *    onPlay,           // fn(wager) -> called when user commits
   *  }
   */
  function WagerPanel(opts) {
    const mount = opts.mount;
    const min = opts.min || 1;

    const input = el('input', {
      class: 'bet-input', type: 'number', min: min, value: 50, inputmode: 'numeric',
    });
    const box = el('div', { class: 'bet-input-box' }, el('span', { class: 'coin' }, '🪙'), input);

    const chipRow = el('div', { class: 'chips' });
    [
      { label: '+50', fn: (v) => v + 50 },
      { label: '+250', fn: (v) => v + 250 },
      { label: '½', fn: (v, bal) => Math.max(min, Math.floor((Auth.user ? Auth.user.balance : v) / 2)) },
      { label: 'Max', fn: (v, bal) => (Auth.user ? Auth.user.balance : v) },
    ].forEach((c) => {
      chipRow.append(el('button', { class: 'chip', type: 'button', onclick: () => {
        const cur = Number(input.value) || 0;
        input.value = Math.max(min, Math.floor(c.fn(cur)));
        updatePayout();
      } }, c.label));
    });

    const payoutVal = el('span', { class: 'val' }, '—');
    const payoutRow = el('div', { class: 'potential' },
      el('span', { class: 'muted' }, opts.payoutLabel || 'Potential payout'),
      payoutVal
    );

    const playBtn = el('button', { class: 'btn btn-gold btn-lg play-btn pulse' }, opts.playLabel || 'Place wager');

    function getWager() {
      let w = Math.floor(Number(input.value) || 0);
      if (w < min) w = min;
      return w;
    }
    function updatePayout() {
      const w = getWager();
      const m = opts.multiplier ? opts.multiplier() : 2;
      payoutVal.textContent = fmt(w * m) + ' 🪙  (' + m.toFixed(2) + '×)';
    }
    input.addEventListener('input', updatePayout);

    playBtn.addEventListener('click', () => {
      if (!Auth.user) { G.openAuthModal('signup'); return; }
      const w = getWager();
      if (w > Auth.user.balance) { toast('Not enough Gold — claim your daily drop.', 'loss'); return; }
      opts.onPlay(w);
    });

    const panel = el('div', { class: 'wager' },
      el('div', { class: 'wager-row' },
        el('span', { class: 'wager-label' }, 'Your wager'),
        box
      ),
      chipRow,
      payoutRow,
      playBtn,
      el('p', { class: 'guest-note', 'data-guest-note': '' }, 'Playing as a guest — sign up to keep your Gold.')
    );
    mount.append(panel);

    function refreshGuestNote() {
      const note = panel.querySelector('[data-guest-note]');
      note.classList.toggle('hidden', !!Auth.user);
    }
    Auth.onChange(refreshGuestNote);
    updatePayout();

    return {
      getWager, updatePayout,
      setEnabled(on) { playBtn.disabled = !on; input.disabled = !on; },
      setPlayLabel(t) { playBtn.textContent = t; },
      el: panel,
    };
  }

  /* Convenience: settle a round and surface a juicy win/loss toast. */
  async function play({ wager, multiplier, game, silent }) {
    const res = await G.settleRound({ wager, multiplier, game });
    if (!silent) {
      if (res.delta > 0) toast(`You won +${fmt(res.delta)} Gold!`, 'win');
      else if (res.delta < 0) toast(`Lost ${fmt(-res.delta)} Gold.`, 'loss');
      else toast('Push — stake returned.', '');
    }
    return res;
  }

  G.mountTopbar = mountTopbar;
  G.WagerPanel = WagerPanel;
  G.play = play;
})();
