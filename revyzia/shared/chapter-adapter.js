// ============================================================
// REVYZIA — Adapter de chapitre v2 (clean)
// ============================================================
// Corrige :
// - Bug nom "—" : on injecte le pseudo dans le state du chapitre + DOM
// - Bug Firebase H24 : on ne push QUE si l'XP a vraiment augmenté (debounce 3s)
// - Bug explosion XP : on sync UNIQUEMENT le delta depuis l'ouverture
// ============================================================

(function() {
  const R = window.REVYZIA;
  if (!R) {
    console.warn('[chapter-adapter] REVYZIA non chargé');
    return;
  }

  const CHAPTER = window.REVYZIA_CHAPTER || { id: 'unknown', subject: 'unknown', title: 'Chapitre' };

  const user = R.getCurrentUser();
  if (!user) {
    const depth = (CHAPTER.depth || 1);
    window.location.href = '../'.repeat(depth) + 'index.html';
    return;
  }

  // === État interne ===
  let chapterBaselineXp = null;
  let lastSyncedDelta = 0;
  let firebaseSyncTimer = null;
  let chapterLocalKey = null;

  document.addEventListener('DOMContentLoaded', function() {
    injectChapterUI();
    initFirebaseSync();
    setupChapterWatcher();
    autoSkipChapterOnboarding();
  });

  // ============================================================
  // AUTO-SKIP + INJECTION DU NOM
  // ============================================================
  function autoSkipChapterOnboarding() {
    const u = R.getCurrentUser();
    if (!u) return;

    function patchState() {
      try {
        if (typeof state !== 'undefined' && state && typeof state === 'object') {
          if ('user' in state) state.user = u.name;
          if ('userName' in state) state.userName = u.name;
          if ('userClass' in state) state.userClass = u.klass;
          if ('pendingName' in state) state.pendingName = u.name;
          if ('currentUser' in state) state.currentUser = u.name;
        }
      } catch(e) {}
    }
    patchState();

    setTimeout(function() {
      patchState();
      const ob = document.getElementById('onboarding-view');
      if (ob && ob.style.display !== 'none') {
        let handled = false;
        try {
          if (typeof showHome === 'function') {
            ob.style.display = 'none';
            showHome();
            handled = true;
          }
        } catch(e) {}
        if (!handled) {
          try { if (typeof startApp === 'function') { startApp(); ob.style.display = 'none'; handled = true; } } catch(e) {}
        }
        if (!handled) {
          try { if (typeof goHome === 'function') { goHome(); ob.style.display = 'none'; handled = true; } } catch(e) {}
        }
        if (!handled) {
          ob.style.display = 'none';
          const main = document.getElementById('home-view') ||
                        document.getElementById('main-view') ||
                        document.getElementById('mainContent') ||
                        document.getElementById('home');
          if (main) main.style.display = 'block';
        }
      }

      patchState();
      replaceNameInDom(u.name);

      // Re-patch plusieurs fois pour les chapitres qui rendent en async
      setTimeout(function() { patchState(); replaceNameInDom(u.name); }, 500);
      setTimeout(function() { patchState(); replaceNameInDom(u.name); }, 1500);
    }, 200);
  }

  function replaceNameInDom(name) {
    const namePlaceholders = ['userName', 'userBadgeName', 'greetingName', 'heroName', 'nomUtilisateur'];
    namePlaceholders.forEach(function(id) {
      const el = document.getElementById(id);
      if (el) {
        const t = (el.textContent || '').trim();
        if (!t || t === '—' || t === '-') el.textContent = name;
      }
    });

    try {
      const greetEls = document.querySelectorAll('.greeting, .hero h1, .welcome');
      greetEls.forEach(function(el) {
        const ems = el.querySelectorAll('em');
        ems.forEach(function(emEl) {
          const t = (emEl.textContent || '').trim();
          if (!t || t === '—' || t === '-') emEl.textContent = name;
        });
        // Si pas d'em : remplacer les "—" dans le texte
        const html = el.innerHTML;
        if (html.indexOf('—') !== -1) {
          el.innerHTML = html.replace(/—/g, name);
        }
      });
    } catch(e) {}
  }

  // ============================================================
  // INJECTION UI
  // ============================================================
  function injectChapterUI() {
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return;

    const brand = topBar.querySelector('.brand');
    if (brand && !document.getElementById('backToHubBtn')) {
      const btn = document.createElement('button');
      btn.id = 'backToHubBtn';
      btn.innerHTML = '←';
      btn.title = 'Retour au hub';
      btn.style.cssText = 'background:var(--glass-bg);border:1px solid var(--glass-border);width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px;color:var(--ink);font-family:inherit;font-weight:700;margin-right:6px;transition:all 0.2s;display:inline-flex;align-items:center;justify-content:center;';
      btn.onclick = function() {
        syncDeltaToGlobal();
        const depth = (CHAPTER.depth || 1);
        window.location.href = '../'.repeat(depth) + 'index.html';
      };
      brand.insertBefore(btn, brand.firstChild);
    }

    if (!document.getElementById('chLogoutBtn')) {
      const rightSide = topBar.querySelector('.top-right') || topBar;
      const lbtn = document.createElement('button');
      lbtn.id = 'chLogoutBtn';
      lbtn.innerHTML = '🚪';
      lbtn.title = 'Se déconnecter';
      lbtn.style.cssText = 'background:var(--glass-bg);border:1px solid var(--glass-border);width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:14px;font-family:inherit;font-weight:500;margin-left:6px;transition:all 0.2s;display:inline-flex;align-items:center;justify-content:center;';
      lbtn.onclick = function() {
        if (confirm('Tu veux te déconnecter ?')) {
          try { localStorage.removeItem('revyzia_current_user'); } catch(e) {}
          const depth = (CHAPTER.depth || 1);
          window.location.href = '../'.repeat(depth) + 'index.html';
        }
      };
      const themeToggle = rightSide.querySelector('.theme-toggle, [onclick*="toggleTheme"]');
      if (themeToggle) rightSide.insertBefore(lbtn, themeToggle);
      else rightSide.appendChild(lbtn);
    }
  }

  // ============================================================
  // FIREBASE : 1 SEUL push initial
  // ============================================================
  function initFirebaseSync() {
    R.loadFirebaseSDK(
      function() {
        const u = R.getCurrentUser();
        if (!u || !R.fbReady || !R.fbDb) return;
        const key = (u.key || u.name + '__' + u.klass).replace(/[.#$\[\]\/]/g, '_');
        R.fbDb.ref('users/' + key).once('value').then(function(snap) {
          const remote = snap.val();
          const local = R.loadUserData(u);
          const merged = R.mergeUserData(local, remote);
          try { localStorage.setItem(R.localUserKey(u), JSON.stringify(merged)); } catch(e) {}
          R.pushToFirebase(merged, u);
          console.log('[chapter-adapter] ✅ Fusion init OK (XP:', merged.totalXp, ')');
        }).catch(function(err) {
          console.warn('[chapter-adapter] Fusion fail:', err);
        });
      },
      function() { /* offline OK */ }
    );
  }

  // ============================================================
  // WATCHER : sync UNIQUEMENT le DELTA (pas le total !)
  // ============================================================
  function setupChapterWatcher() {
    chapterLocalKey = findChapterLocalKey();
    if (!chapterLocalKey) {
      console.log('[chapter-adapter] Pas de clé locale détectée');
      return;
    }
    chapterBaselineXp = getChapterXp(chapterLocalKey);
    console.log('[chapter-adapter] Baseline:', chapterBaselineXp, '/ key:', chapterLocalKey);

    // Sync toutes les 10 secondes SEULEMENT si delta nouveau
    setInterval(function() {
      const cur = getChapterXp(chapterLocalKey);
      const delta = cur - chapterBaselineXp;
      if (delta > lastSyncedDelta) {
        scheduleSync();
      }
    }, 10000);

    window.addEventListener('beforeunload', syncDeltaToGlobal);
    window.addEventListener('blur', syncDeltaToGlobal);
  }

  function scheduleSync() {
    if (firebaseSyncTimer) clearTimeout(firebaseSyncTimer);
    firebaseSyncTimer = setTimeout(syncDeltaToGlobal, 3000);
  }

  function syncDeltaToGlobal() {
    if (!chapterLocalKey) return;
    const cur = getChapterXp(chapterLocalKey);
    const delta = cur - chapterBaselineXp;
    if (delta <= lastSyncedDelta) return;

    const newDelta = delta - lastSyncedDelta;
    lastSyncedDelta = delta;

    const u = R.getCurrentUser();
    if (!u) return;

    const g = R.loadUserData(u);
    if (!g.chapters) g.chapters = {};
    const prev = g.chapters[CHAPTER.id] || { xp: 0 };
    g.chapters[CHAPTER.id] = {
      xp: (prev.xp || 0) + newDelta,
      subject: CHAPTER.subject,
      title: CHAPTER.title,
      lastSeen: Date.now()
    };
    let total = 0;
    for (const k in g.chapters) total += (g.chapters[k].xp || 0);
    g.totalXp = total;
    R.recomputeStreakOnLoad(g);
    R.tickStreakOnAction(g);
    R.saveUserData(g, u);
    console.log('[chapter-adapter] 🔄 Sync +' + newDelta + ' XP');
  }

  function findChapterLocalKey() {
    const u = R.getCurrentUser();
    if (!u) return null;
    const knownPrefixes = ['antigone_v1_user_', 'eh1989_v2_user_', 'espagnol_preterit_v1_user_', 'physique_poids_v1_user_'];
    const candidates = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      for (const pfx of knownPrefixes) {
        if (k.startsWith(pfx)) candidates.push(k);
      }
    }
    if (candidates.length === 0) return null;
    const lower = u.name.toLowerCase();
    return candidates.find(function(k) { return k.toLowerCase().includes(lower); }) || candidates[0];
  }

  function getChapterXp(localKey) {
    try {
      const raw = localStorage.getItem(localKey);
      if (!raw) return 0;
      const d = JSON.parse(raw);
      return d.totalXp || 0;
    } catch (e) { return 0; }
  }
})();
