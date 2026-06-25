/* Fortune Wheel — 20 weighted wedges, EV ≈ 0.95 (house keeps an edge). */
(function () {
  'use strict';
  const G = window.Genies;
  const { toast } = G;
  G.mountTopbar('#topbar');

  // 20 wedges, arranged so high prizes are spread out. EV = 19/20 = 0.95.
  // counts: 8×1, 4×1, 2×1, 1×3, 0.5×4, 0×10
  const WEDGES = [
    0, 0.5, 0, 1, 0, 2, 0, 0.5, 1, 0,
    8, 0, 0.5, 0, 1, 0, 4, 0.5, 0, 0,
  ];
  const N = WEDGES.length;
  const SEG = 360 / N;

  const colorFor = (m) =>
    m === 0 ? '#202a40' :   // loss
    m >= 8 ? '#ffc432' :    // jackpot gold
    m >= 4 ? '#ff9d2f' :    // orange
    m >= 2 ? '#2f8bff' :    // blue
    m >= 1 ? '#2ee6a0' :    // green
    '#5b6a88';              // 0.5× muted

  const canvas = document.getElementById('wheel');
  const ctx = canvas.getContext('2d');
  const result = document.getElementById('result');
  const lastSpin = document.getElementById('lastSpin');

  let rotation = 0;
  let busy = false;

  function drawWheel() {
    const cx = canvas.width / 2, cy = canvas.height / 2, r = cx - 6;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < N; i++) {
      const a0 = (i * SEG - 90 - SEG / 2) * Math.PI / 180;
      const a1 = ((i + 1) * SEG - 90 - SEG / 2) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = colorFor(WEDGES[i]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // label
      const mid = (a0 + a1) / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * r * 0.72, cy + Math.sin(mid) * r * 0.72);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = WEDGES[i] >= 1 ? '#06101f' : '#cdd6ea';
      ctx.font = '700 22px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(WEDGES[i] === 0 ? '✕' : WEDGES[i] + '×', 0, 0);
      ctx.restore();
    }
  }

  const wager = G.WagerPanel({
    mount: document.getElementById('wagerMount'),
    payoutLabel: 'Top-prize payout',
    multiplier: () => 8,
    playLabel: 'Spin the wheel 🎡',
    onPlay: spin,
  });

  async function spin(bet) {
    if (busy) return;
    busy = true; wager.setEnabled(false);
    result.textContent = 'Spinning…';

    const k = Math.floor(Math.random() * N);     // landing wedge index
    const m = WEDGES[k];
    // rotate so wedge k's center sits under the top pointer
    const jitter = (Math.random() - 0.5) * (SEG - 6);
    const target = 360 * 6 + (360 - (k * SEG)) + jitter;
    rotation += (target - (rotation % 360));
    canvas.style.transform = `rotate(${rotation}deg)`;

    setTimeout(async () => {
      try {
        const res = await G.play({ wager: bet, multiplier: m, game: 'wheel', silent: true });
        lastSpin.textContent = (m === 0 ? '✕' : m + '×');
        if (m === 0) {
          result.innerHTML = `<span class="loss-text">Missed — lost ${G.fmt(bet)} 🪙. Spin again.</span>`;
        } else if (res.delta > 0) {
          result.innerHTML = `<span class="win-text">${m}× — won +${G.fmt(res.delta)} 🪙!</span>`;
          toast(`${m}× — +${G.fmt(res.delta)} Gold!`, m >= 8 ? 'gold' : 'win');
        } else {
          result.innerHTML = `<span class="muted">${m}× — stake returned.</span>`;
        }
      } catch (e) {
        if (e.message !== 'auth-required') toast(e.message, 'loss');
        result.textContent = 'Set your wager and spin.';
      } finally {
        busy = false; wager.setEnabled(true);
      }
    }, 4500);
  }

  drawWheel();
})();
