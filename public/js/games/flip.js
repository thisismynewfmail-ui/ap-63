/* Lucky Flip — 50/50 coin flip, 1.96× on a correct call. */
(function () {
  'use strict';
  const G = window.Genies;
  const { el, toast } = G;
  G.mountTopbar('#topbar');

  const PAYOUT = 1.96;       // multiplier on a win (slight house edge, play-money)
  let side = 'H';
  let streak = 0;
  let busy = false;

  const coin = document.getElementById('coin');
  const result = document.getElementById('result');
  const streakEl = document.getElementById('streak');
  const pickH = document.getElementById('pickH');
  const pickT = document.getElementById('pickT');

  function setSide(s) {
    side = s;
    pickH.classList.toggle('sel', s === 'H');
    pickT.classList.toggle('sel', s === 'T');
  }
  pickH.addEventListener('click', () => !busy && setSide('H'));
  pickT.addEventListener('click', () => !busy && setSide('T'));

  const wager = G.WagerPanel({
    mount: document.getElementById('wagerMount'),
    payoutLabel: 'If you call it right',
    multiplier: () => PAYOUT,
    playLabel: 'Flip the coin',
    onPlay: flip,
  });

  async function flip(bet) {
    if (busy) return;
    busy = true; wager.setEnabled(false);
    result.textContent = 'Flipping…';

    const win = Math.random() < 0.5; // fair 50/50 — the edge lives in the 1.96× payout
    // Decide the landed face: if win, it equals the picked side; else the other.
    const landed = win ? side : (side === 'H' ? 'T' : 'H');

    // animate
    coin.classList.remove('spin', 'land-tails');
    void coin.offsetWidth; // reflow
    coin.classList.add('spin');

    setTimeout(async () => {
      coin.classList.remove('spin');
      coin.classList.toggle('land-tails', landed === 'T');
      try {
        const res = await G.play({ wager: bet, multiplier: win ? PAYOUT : 0, game: 'flip' });
        if (res.delta > 0) {
          streak++;
          result.innerHTML = `<span class="win-text">${landed === 'H' ? 'Heads' : 'Tails'} — you won +${G.fmt(res.delta)} 🪙</span>`;
        } else {
          streak = 0;
          result.innerHTML = `<span class="loss-text">${landed === 'H' ? 'Heads' : 'Tails'} — not your call this time.</span>`;
        }
        streakEl.textContent = streak;
        if (streak >= 3) toast(`🔥 ${streak} in a row!`, 'gold');
      } catch (e) {
        if (e.message !== 'auth-required') toast(e.message, 'loss');
        result.textContent = 'Pick a side and flip.';
      } finally {
        busy = false; wager.setEnabled(true);
      }
    }, 1100);
  }
})();
