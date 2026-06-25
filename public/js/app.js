/* ==========================================================================
   Genies — shared front-end runtime
   - thin API client (token kept in localStorage)
   - global auth state + balance chip
   - reusable toast / modal / count-up helpers used by every game
   ========================================================================== */
(function () {
  'use strict';

  const TOKEN_KEY = 'genies_token';

  /* ----------------------------- API client ----------------------------- */
  const API = {
    token() { return localStorage.getItem(TOKEN_KEY); },
    setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); },

    async call(method, path, body) {
      const headers = { 'Content-Type': 'application/json' };
      const tok = API.token();
      if (tok) headers['Authorization'] = 'Bearer ' + tok;
      const res = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data = {};
      try { data = await res.json(); } catch (e) {}
      if (!res.ok) {
        const err = new Error(data.error || 'Request failed');
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },
    signup(p) { return API.call('POST', '/api/signup', p); },
    login(p) { return API.call('POST', '/api/login', p); },
    logout() { return API.call('POST', '/api/logout'); },
    me() { return API.call('GET', '/api/me'); },
    daily() { return API.call('POST', '/api/daily'); },
    play(p) { return API.call('POST', '/api/play', p); },
    leaderboard() { return API.call('GET', '/api/leaderboard'); },
  };

  /* ----------------------------- Auth state ----------------------------- */
  const Auth = {
    user: null,
    listeners: [],
    onChange(fn) { this.listeners.push(fn); if (this.user !== undefined) fn(this.user); },
    _emit() { this.listeners.forEach((fn) => fn(this.user)); },

    async refresh() {
      if (!API.token()) { this.user = null; this._emit(); return null; }
      try {
        const { user } = await API.me();
        this.user = user; this._emit(); return user;
      } catch (e) {
        if (e.status === 401) { API.setToken(null); this.user = null; this._emit(); }
        return null;
      }
    },
    setUser(user) { this.user = user; this._emit(); },
    async logout() {
      try { await API.logout(); } catch (e) {}
      API.setToken(null); this.user = null; this._emit();
    },
  };

  /* ----------------------------- UI helpers ----------------------------- */
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach((k) => n.append(k && k.nodeType ? k : document.createTextNode(k)));
    return n;
  }

  function toastHost() {
    let h = document.getElementById('toast-host');
    if (!h) { h = el('div', { id: 'toast-host' }); document.body.append(h); }
    return h;
  }
  function toast(msg, kind) {
    const t = el('div', { class: 'toast ' + (kind || '') }, msg);
    toastHost().append(t);
    setTimeout(() => t.remove(), 3100);
  }

  function fmt(n) {
    return Math.round(n).toLocaleString('en-US');
  }

  // animated count-up on a numeric element
  function countTo(node, from, to, ms) {
    const start = performance.now();
    ms = ms || 600;
    function step(now) {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(step);
      else node.textContent = fmt(to);
    }
    requestAnimationFrame(step);
  }

  /* ----------------------------- Balance chip + topbar ----------------------------- */
  function renderTopbar() {
    const chip = document.querySelector('[data-balance]');
    const guestBtns = document.querySelector('[data-guest-actions]');
    const userBox = document.querySelector('[data-user-actions]');
    const u = Auth.user;

    if (chip) {
      const prev = Number(chip.dataset.value || 0);
      const next = u ? u.balance : 0;
      chip.dataset.value = next;
      const numNode = chip.querySelector('[data-balance-num]') || chip;
      if (u) {
        countTo(numNode, prev, next, 600);
        chip.classList.add('bump');
        chip.classList.toggle('flash-win', next > prev && prev !== 0);
        chip.classList.toggle('flash-loss', next < prev);
        setTimeout(() => { chip.classList.remove('bump', 'flash-win', 'flash-loss'); }, 700);
      } else {
        numNode.textContent = '—';
      }
    }
    if (guestBtns) guestBtns.classList.toggle('hidden', !!u);
    if (userBox) {
      userBox.classList.toggle('hidden', !u);
      if (u) {
        const av = userBox.querySelector('[data-avatar]');
        const nm = userBox.querySelector('[data-username]');
        if (av) av.textContent = (u.displayName || u.username || '?')[0].toUpperCase();
        if (nm) nm.textContent = u.displayName || u.username;
      }
    }
  }
  Auth.onChange(renderTopbar);

  /* ----------------------------- Auth modal ----------------------------- */
  function openAuthModal(initialTab) {
    let tab = initialTab || 'login';
    const backdrop = el('div', { class: 'modal-backdrop' });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

    const errBox = el('p', { class: 'form-error' });
    const form = el('form');

    function build() {
      form.innerHTML = '';
      const isSignup = tab === 'signup';
      const fields = [];
      fields.push(el('div', { class: 'field' },
        el('label', null, 'Username'),
        el('input', { class: 'input', name: 'username', autocomplete: 'username', placeholder: 'e.g. high_roller' })
      ));
      if (isSignup) {
        fields.push(el('div', { class: 'field' },
          el('label', null, 'Display name (optional)'),
          el('input', { class: 'input', name: 'displayName', placeholder: 'Shown on the leaderboard' })
        ));
      }
      fields.push(el('div', { class: 'field' },
        el('label', null, 'Password'),
        el('input', { class: 'input', name: 'password', type: 'password', autocomplete: isSignup ? 'new-password' : 'current-password', placeholder: '••••••••' })
      ));
      const submit = el('button', { class: 'btn btn-primary btn-block btn-lg pulse', type: 'submit' },
        isSignup ? '🎁 Create account + claim 1,000 Gold' : 'Log in');
      form.append(...fields, errBox, submit);
      if (isSignup) {
        form.append(el('p', { class: 'faint center', style: 'margin:12px 0 0;font-size:.8rem' },
          'New players start with 1,000 Genies Gold — free play money.'));
      }
    }

    const tabs = el('div', { class: 'modal-tabs' },
      el('button', { type: 'button', onclick: () => switchTab('login') }, 'Log in'),
      el('button', { type: 'button', onclick: () => switchTab('signup') }, 'Sign up')
    );
    function switchTab(t) {
      tab = t; errBox.textContent = '';
      [...tabs.children].forEach((b, i) =>
        b.classList.toggle('active', (i === 0 && t === 'login') || (i === 1 && t === 'signup')));
      build();
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = '';
      const fd = new FormData(form);
      const payload = {
        username: (fd.get('username') || '').trim(),
        password: fd.get('password') || '',
      };
      if (tab === 'signup') payload.displayName = (fd.get('displayName') || '').trim();
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Please wait…';
      try {
        const res = tab === 'signup' ? await API.signup(payload) : await API.login(payload);
        API.setToken(res.token);
        Auth.setUser(res.user);
        backdrop.remove();
        toast(tab === 'signup' ? `Welcome, ${res.user.displayName}! +1,000 Gold` : `Welcome back, ${res.user.displayName}!`, 'gold');
        document.dispatchEvent(new CustomEvent('genies:auth'));
      } catch (err) {
        errBox.textContent = err.message;
        btn.disabled = false;
        build();
      }
    });

    const modal = el('div', { class: 'modal' },
      el('h2', null, 'Genies ', el('span', { class: 'gold-text' }, 'Speculation Market')),
      el('p', { class: 'sub' }, 'Play-money prediction & chance games. No real currency — ever.'),
      tabs, form
    );
    backdrop.append(modal);
    document.body.append(backdrop);
    switchTab(tab);
    setTimeout(() => form.querySelector('input')?.focus(), 50);
  }

  /* ----------------------------- Game settlement ----------------------------- */
  /*
   * settleRound: the single entry point games use to commit a result.
   * Returns { user, payout, delta } or throws. Updates global balance UI.
   * If the player isn't logged in, prompts auth instead.
   */
  async function settleRound({ wager, multiplier, game }) {
    if (!Auth.user) { openAuthModal('signup'); throw new Error('auth-required'); }
    const res = await API.play({ wager, multiplier, game });
    Auth.setUser(res.user);
    return res;
  }

  function requireAuth(action) {
    if (Auth.user) return true;
    openAuthModal(action === 'signup' ? 'signup' : 'login');
    return false;
  }

  /* ----------------------------- expose ----------------------------- */
  window.Genies = {
    API, Auth, el, toast, fmt, countTo, countUp: countTo,
    openAuthModal, settleRound, requireAuth, renderTopbar,
  };

  // boot
  document.addEventListener('DOMContentLoaded', () => {
    Auth.refresh();
  });
})();
