/* Revyzia · pages Brevet (fiches + révisions)
   Gère : thème jour/nuit (partagé via revyzia_theme), menu hamburger, déconnexion auto 5 min. */
(function () {
  // ---------- THÈME ----------
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var b = document.getElementById('themeToggle');
    if (b) b.textContent = (t === 'dark') ? '☀️' : '🌙';
  }
  try {
    var s = localStorage.getItem('revyzia_theme');
    applyTheme(s === 'dark' ? 'dark' : 'light');
  } catch (e) { applyTheme('light'); }

  window.rvToggleTheme = function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('revyzia_theme', cur); } catch (e) {}
    applyTheme(cur);
  };

  // ---------- MENU HAMBURGER (petit écran) ----------
  window.rvBurger = function () {
    var m = document.querySelector('.tb-center');
    if (m) m.classList.toggle('open');
  };
  // Referme le menu si on clique ailleurs
  document.addEventListener('click', function (e) {
    var m = document.querySelector('.tb-center.open');
    if (!m) return;
    if (e.target.closest('.tb-center') || e.target.closest('.tb-burger')) return;
    m.classList.remove('open');
  });

  // ---------- DÉCONNEXION AUTO (5 min d'inactivité) ----------
  function getUser() {
    try { var r = localStorage.getItem('revyzia_current_user'); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  var IDLE_MS = 5 * 60 * 1000, t = null;
  function fire() {
    if (!getUser() || document.getElementById('rvIdlePop')) return;
    var o = document.createElement('div');
    o.id = 'rvIdlePop';
    o.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);padding:20px;';
    o.innerHTML = '<div style="background:#fff;color:#13202b;max-width:380px;width:100%;border-radius:20px;padding:26px 24px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.3);">'
      + '<div style="font-size:30px;margin-bottom:8px;">🔒</div>'
      + '<h2 style="margin:0 0 8px;font-size:20px;font-weight:800;">Session déconnectée</h2>'
      + '<p style="margin:0 0 18px;font-size:14px;color:#5a6b7a;line-height:1.5;">Tu as été déconnecté après 5 minutes d\'inactivité. Ta progression est bien sauvegardée.</p>'
      + '<button id="rvIdleOk" style="border:none;cursor:pointer;font-family:inherit;font-weight:700;font-size:15px;padding:12px 28px;border-radius:100px;background:linear-gradient(135deg,var(--accent,#5e5cff),var(--accent-2,#ff3b80));color:#fff;">OK</button></div>';
    document.body.appendChild(o);
    document.getElementById('rvIdleOk').onclick = function () {
      try { localStorage.removeItem('revyzia_current_user'); } catch (e) {}
      window.location.href = '../index.html';
    };
  }
  function reset() { if (!getUser()) return; clearTimeout(t); t = setTimeout(fire, IDLE_MS); }
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'].forEach(function (ev) {
    window.addEventListener(ev, reset, { passive: true });
  });
  reset();
})();
