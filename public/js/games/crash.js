/* Genie Crash — rising multiplier, cash out before it busts. */
(function () {
  'use strict';
  const G = window.Genies;
  const { toast } = G;
  G.mountTopbar('#topbar');

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const multEl = document.getElementById('mult');
  const result = document.getElementById('result');
  const histEl = document.getElementById('hist');
  const autoCash = document.getElementById('autoCash');

  const RATE = 0.00033;     // multiplier growth per ms (e^(RATE*t))
  let state = 'idle';       // idle | running | done
  let crashAt = 0;
  let startT = 0;
  let curBet = 0;
  let cashedAt = 0;
  let raf = null;
  const history = [];

  // crash point: heavy tail, ~2% instant bust, 99% RTP
  function genCrash() {
    if (Math.random() < 0.02) return 1.0;
    const r = Math.random();
    return Math.max(1.01, Math.floor((0.99 / (1 - r)) * 100) / 100);
  }

  function multAt(ms) { return Math.exp(RATE * ms); }

  function drawCurve(progressMult, busted) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, (h / 4) * i); ctx.lineTo(w, (h / 4) * i); ctx.stroke(); }

    const maxM = Math.max(2, progressMult * 1.05);
    const tEnd = Math.log(progressMult) / RATE || 1;
    ctx.beginPath();
    for (let px = 0; px <= w; px++) {
      const t = (px / w) * tEnd;
      const m = multAt(t);
      const y = h - ((m - 1) / (maxM - 1)) * (h - 10) - 4;
      px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y);
    }
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#2f8bff');
    grad.addColorStop(1, busted ? '#ff5470' : '#ffc432');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // fill under curve
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = busted ? 'rgba(255,84,112,0.08)' : 'rgba(255,196,50,0.08)';
    ctx.fill();
  }

  function frame(now) {
    const ms = now - startT;
    const m = multAt(ms);
    if (m >= crashAt) return bust();
    multEl.textContent = m.toFixed(2) + '×';
    drawCurve(m, false);
    // auto cash-out
    const auto = Number(autoCash.value);
    if (auto >= 1.01 && m >= auto && state === 'running') return cashOut(true);
    raf = requestAnimationFrame(frame);
  }

  async function settle(multiplier, mLabel, busted) {
    state = 'done';
    cancelAnimationFrame(raf);
    drawCurve(Math.max(crashAt, multAt(performance.now() - startT)), busted);
    try {
      const res = await G.play({ wager: curBet, multiplier, game: 'crash', silent: true });
      if (multiplier > 0) {
        multEl.classList.add('cashed'); multEl.classList.remove('busted');
        result.innerHTML = `<span class="win-text">Cashed out at ${mLabel}× — +${G.fmt(res.delta)} 🪙</span>`;
        toast(`Cashed out +${G.fmt(res.delta)} Gold`, 'win');
      } else {
        multEl.classList.add('busted'); multEl.classList.remove('cashed');
        result.innerHTML = `<span class="loss-text">Busted at ${crashAt.toFixed(2)}× — lost ${G.fmt(curBet)} 🪙</span>`;
      }
    } catch (e) {
      if (e.message !== 'auth-required') toast(e.message, 'loss');
    } finally {
      pushHistory(crashAt);
      wager.setPlayLabel('Launch 🚀');
      wager.setEnabled(true);
      autoCash.disabled = false;
    }
  }

  function cashOut(isAuto) {
    if (state !== 'running') return;
    const m = multAt(performance.now() - startT);
    cashedAt = m;
    settle(m, m.toFixed(2), false);
  }

  function bust() {
    if (state === 'done') return;
    multEl.textContent = crashAt.toFixed(2) + '×';
    settle(0, crashAt.toFixed(2), true);
  }

  function pushHistory(m) {
    history.unshift(m);
    if (history.length > 10) history.pop();
    histEl.innerHTML = '';
    history.forEach((h) => {
      const cls = h < 1.5 ? 'low' : h < 3 ? 'mid' : 'high';
      const node = G.el('span', { class: 'h ' + cls }, h.toFixed(2) + '×');
      histEl.append(node);
    });
  }

  const wager = G.WagerPanel({
    mount: document.getElementById('wagerMount'),
    payoutLabel: 'At auto cash-out',
    multiplier: () => Number(autoCash.value) || 2,
    playLabel: 'Launch 🚀',
    onPlay: launch,
  });
  autoCash.addEventListener('input', () => wager.updatePayout());

  function launch(bet) {
    if (state === 'running') { cashOut(false); return; }
    curBet = bet;
    crashAt = genCrash();
    startT = performance.now();
    state = 'running';
    cashedAt = 0;
    multEl.classList.remove('cashed', 'busted');
    result.textContent = 'Climbing… tap to cash out!';
    wager.setPlayLabel('💰 Cash out');
    autoCash.disabled = true;
    raf = requestAnimationFrame(frame);
  }

  drawCurve(2, false);
})();
