/* Speculator Dice — roll under target on 0–99.99. Player sets odds via slider. */
(function () {
  'use strict';
  const G = window.Genies;
  const { toast } = G;
  G.mountTopbar('#topbar');

  const HOUSE = 0.99;            // 99% RTP — payout = HOUSE * 100 / target
  let target = 50;              // win if roll < target
  let busy = false;

  const slider = document.getElementById('targetSlider');
  const targetVal = document.getElementById('targetVal');
  const targetLabel = document.getElementById('targetLabel');
  const winChance = document.getElementById('winChance');
  const payoutMult = document.getElementById('payoutMult');
  const rollResult = document.getElementById('rollResult');
  const result = document.getElementById('result');
  const marker = document.getElementById('marker');

  function mult() { return (HOUSE * 100) / target; }

  function refresh() {
    targetVal.textContent = target.toFixed(2);
    targetLabel.textContent = target.toFixed(2);
    winChance.textContent = target.toFixed(0) + '%';
    payoutMult.textContent = mult().toFixed(2) + '×';
    if (wager) wager.updatePayout();
  }

  slider.addEventListener('input', () => {
    if (busy) return;
    target = Number(slider.value);
    refresh();
  });

  const wager = G.WagerPanel({
    mount: document.getElementById('wagerMount'),
    payoutLabel: 'On a winning roll',
    multiplier: () => mult(),
    playLabel: 'Roll the dice',
    onPlay: roll,
  });

  async function roll(bet) {
    if (busy) return;
    busy = true; wager.setEnabled(false); slider.disabled = true;
    result.textContent = 'Rolling…';

    const outcome = Math.random() * 100;          // 0–100
    const win = outcome < target;
    const m = win ? mult() : 0;

    // animate the number ticking to the outcome
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / 700);
      const shown = win ? outcome : (Math.random() * 100);
      rollResult.textContent = (p < 1 ? Math.random() * 100 : outcome).toFixed(2);
      if (p < 1) requestAnimationFrame(tick);
      else finish();
    }
    async function finish() {
      rollResult.textContent = outcome.toFixed(2);
      rollResult.style.color = win ? 'var(--win)' : 'var(--loss)';
      marker.style.left = Math.min(100, outcome) + '%';
      try {
        const res = await G.play({ wager: bet, multiplier: m, game: 'dice' });
        result.innerHTML = win
          ? `<span class="win-text">Rolled ${outcome.toFixed(2)} — under ${target}! +${G.fmt(res.delta)} 🪙</span>`
          : `<span class="loss-text">Rolled ${outcome.toFixed(2)} — needed under ${target}.</span>`;
      } catch (e) {
        if (e.message !== 'auth-required') toast(e.message, 'loss');
        result.textContent = 'Set a target and roll.';
      } finally {
        busy = false; wager.setEnabled(true); slider.disabled = false;
      }
    }
    requestAnimationFrame(tick);
  }

  refresh();
})();
