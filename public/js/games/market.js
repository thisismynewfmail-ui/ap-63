/* Prediction Market — buy YES/NO on a binary contract; payout scales with odds.
   Fair pricing with a small spread fee (FEE) so the market keeps an edge. */
(function () {
  'use strict';
  const G = window.Genies;
  const { toast } = G;
  G.mountTopbar('#topbar');

  const FEE = 0.96;   // 4% market spread -> house edge
  const QUESTIONS = [
    'Will GENIE token close green today?',
    'Will the Oasis index break its all-time high this hour?',
    'Will the next block come in under 10 seconds?',
    'Will "Lamp Fund" beat the market this round?',
    'Will rainfall hit the Dune City sensor before noon?',
    'Will the underdog cover the spread tonight?',
    'Will the carpet rally past resistance?',
    'Will the desert convoy arrive ahead of schedule?',
  ];

  let yesPrice = 60;       // 0..100, probability YES resolves true
  let side = 'YES';
  let busy = false;
  const series = [];

  const qEl = document.getElementById('question');
  const probYes = document.getElementById('probYes');
  const probNo = document.getElementById('probNo');
  const yesPayEl = document.getElementById('yesPay');
  const noPayEl = document.getElementById('noPay');
  const sideYes = document.getElementById('sideYes');
  const sideNo = document.getElementById('sideNo');
  const result = document.getElementById('result');
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');

  function yesMult() { return (100 / yesPrice) * FEE; }
  function noMult() { return (100 / (100 - yesPrice)) * FEE; }

  function setSide(s) {
    side = s;
    sideYes.classList.toggle('sel', s === 'YES');
    sideNo.classList.toggle('sel', s === 'NO');
    wager.updatePayout();
  }
  sideYes.addEventListener('click', () => !busy && setSide('YES'));
  sideNo.addEventListener('click', () => !busy && setSide('NO'));

  function newContract() {
    qEl.textContent = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    yesPrice = Math.round(28 + Math.random() * 44);   // 28..72
    series.length = 0;
    for (let i = 0; i < 40; i++) series.push(yesPrice + (Math.random() - 0.5) * 6);
    renderPrice();
    drawChart();
  }

  function renderPrice() {
    probYes.style.width = yesPrice + '%';
    probNo.style.width = (100 - yesPrice) + '%';
    probYes.textContent = 'YES ' + yesPrice + '%';
    probNo.textContent = 'NO ' + (100 - yesPrice) + '%';
    yesPayEl.textContent = yesMult().toFixed(2) + '×';
    noPayEl.textContent = noMult().toFixed(2) + '×';
  }

  function drawChart(flashColor) {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...series) - 2, max = Math.max(...series) + 2;
    ctx.beginPath();
    series.forEach((v, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - ((v - min) / (max - min)) * (h - 8) - 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = flashColor || '#4ea3ff';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  const wager = G.WagerPanel({
    mount: document.getElementById('wagerMount'),
    payoutLabel: 'If your side resolves true',
    multiplier: () => (side === 'YES' ? yesMult() : noMult()),
    playLabel: 'Buy contract',
    onPlay: buy,
  });

  async function buy(bet) {
    if (busy) return;
    busy = true; wager.setEnabled(false);
    result.textContent = 'Market resolving…';

    // brief random-walk animation toward resolution
    const yesWins = Math.random() * 100 < yesPrice;
    let frames = 0;
    const drift = ((yesWins ? 100 : 0) - yesPrice) / 30;
    const anim = setInterval(() => {
      frames++;
      series.shift();
      series.push(series[series.length - 1] + drift + (Math.random() - 0.5) * 5);
      drawChart(yesWins ? '#2ee6a0' : '#ff5470');
      if (frames >= 30) { clearInterval(anim); resolve(bet, yesWins); }
    }, 33);
  }

  async function resolve(bet, yesWins) {
    const win = (side === 'YES' && yesWins) || (side === 'NO' && !yesWins);
    const m = win ? (side === 'YES' ? yesMult() : noMult()) : 0;
    try {
      const res = await G.play({ wager: bet, multiplier: m, game: 'market', silent: true });
      const verdict = yesWins ? 'YES' : 'NO';
      if (res.delta > 0) {
        result.innerHTML = `<span class="win-text">Resolved ${verdict} — your ${side} hit! +${G.fmt(res.delta)} 🪙</span>`;
        toast(`+${G.fmt(res.delta)} Gold`, 'win');
      } else {
        result.innerHTML = `<span class="loss-text">Resolved ${verdict} — your ${side} missed. −${G.fmt(bet)} 🪙</span>`;
      }
    } catch (e) {
      if (e.message !== 'auth-required') toast(e.message, 'loss');
      result.textContent = 'Pick a side and buy in.';
    } finally {
      busy = false; wager.setEnabled(true);
      setTimeout(newContract, 1400);
    }
  }

  newContract();
  setSide('YES');
})();
