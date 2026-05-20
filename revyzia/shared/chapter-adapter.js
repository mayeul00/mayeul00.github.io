// ============================================================
// REVYZIA — Adapter de chapitre
// À inclure dans chaque page chapitre APRÈS revyzia.js
// Synchronise XP local du chapitre avec le compte global
// ============================================================

(function() {
  const R = window.REVYZIA;
  if (!R) return;

  // Récupérer la config du chapitre (doit être définie dans la page : REVYZIA_CHAPTER)
  const CHAPTER = window.REVYZIA_CHAPTER || { id: 'unknown', subject: 'unknown', title: 'Chapitre' };

  // ---- 1. Vérifier qu'on est connecté ----
  const user = R.getCurrentUser();
  if (!user) {
    // Redirection vers le hub
    const depth = (CHAPTER.depth || 1);
    const prefix = '../'.repeat(depth);
    window.location.href = prefix + 'index.html';
    return;
  }

  // ---- 2. Injecter le bouton "Retour au hub" ----
  document.addEventListener('DOMContentLoaded', () => {
    injectBackToHub();
    initFirebaseSync();
    setupChapterSync();
    autoSkipChapterOnboarding();
  });

  // 🔥 FIX BUG : auto-skip l'onboarding local du chapitre si on est connecté au hub
  function autoSkipChapterOnboarding() {
    const u = R.getCurrentUser();
    if (!u) return;

    // Préfixer le state du chapitre avec les infos du hub
    try {
      if (typeof state !== 'undefined' && state && typeof state === 'object') {
        if ('user' in state) state.user = u.name;
        if ('userName' in state) state.userName = u.name;
        if ('userClass' in state) state.userClass = u.klass;
        if ('pendingName' in state) state.pendingName = u.name;
      }
    } catch(e) {}

    setTimeout(function() {
      const ob = document.getElementById('onboarding-view');
      if (!ob) return;
      if (ob.style.display === 'none') return;

      // ⭐ STRATÉGIE 1 : si le chapitre a une fonction showHome(), startApp() etc, on l'appelle
      try {
        if (typeof showHome === 'function') {
          // Forcer le state avant
          if (typeof state !== 'undefined' && state) {
            state.user = u.name;
            state.userName = u.name;
            state.userClass = u.klass;
          }
          ob.style.display = 'none';
          showHome();
          return;
        }
      } catch(e) { console.warn('[autoSkip] showHome err:', e); }
      try {
        if (typeof startApp === 'function') { startApp(); ob.style.display = 'none'; return; }
      } catch(e) {}
      try {
        if (typeof goHome === 'function') { goHome(); ob.style.display = 'none'; return; }
      } catch(e) {}

      // ⭐ STRATÉGIE 2 : remplir l'input + cliquer suivant
      const inp = document.getElementById('nameInput');
      if (inp && !inp.value) {
        inp.value = u.name;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const buttons = ob.querySelectorAll('button');
      let clicked = false;
      for (let i = 0; i < buttons.length; i++) {
        const b = buttons[i];
        if (b.disabled) continue;
        const txt = (b.textContent || '').toLowerCase();
        if (txt.includes('suivant') || txt.includes('parti') || txt.includes('commencer') || txt.includes('démarrer') || txt.includes('go')) {
          b.click();
          clicked = true;
          break;
        }
      }
      if (clicked) {
        setTimeout(function() {
          const step2 = document.getElementById('onboardingStep2') || document.getElementById('step2');
          if (step2 && step2.style.display !== 'none') {
            const classBtns = step2.querySelectorAll('button');
            for (let j = 0; j < classBtns.length; j++) {
              const bt = classBtns[j];
              const t = (bt.textContent || '').replace(/\s/g, '');
              if (t.includes(u.klass) || t.includes(u.klass.replace('3e', '3'))) {
                bt.click();
                break;
              }
            }
          }
          if (ob) ob.style.display = 'none';
          const main = document.getElementById('home-view') || document.getElementById('mainContent') || document.getElementById('main-view') || document.getElementById('home');
          if (main) main.style.display = 'block';
        }, 200);
      } else {
        ob.style.display = 'none';
        const main = document.getElementById('home-view') || document.getElementById('mainContent') || document.getElementById('main-view') || document.getElementById('home');
        if (main) main.style.display = 'block';
      }
    }, 300);
  }

  function injectBackToHub() {
    // Chercher la top-bar existante du chapitre
    const topBar = document.querySelector('.top-bar');
    if (!topBar) return;
    // Ajouter un bouton "← Hub" au début du brand
    const brand = topBar.querySelector('.brand');
    if (brand && !document.getElementById('backToHubBtn')) {
      const btn = document.createElement('button');
      btn.id = 'backToHubBtn';
      btn.innerHTML = '←';
      btn.title = 'Retour au hub Revyzia';
      btn.style.cssText = `
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        width: 32px; height: 32px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 16px;
        color: var(--ink);
        font-family: inherit; font-weight: 700;
        margin-right: 6px;
        transition: all 0.2s;
        display: inline-flex; align-items: center; justify-content: center;
      `;
      btn.onmouseover = () => { btn.style.background = 'var(--accent-soft)'; btn.style.color = 'var(--accent)'; };
      btn.onmouseout = () => { btn.style.background = 'var(--glass-bg)'; btn.style.color = 'var(--ink)'; };
      btn.onclick = () => {
        const depth = (CHAPTER.depth || 1);
        const prefix = '../'.repeat(depth);
        window.location.href = prefix + 'index.html';
      };
      brand.insertBefore(btn, brand.firstChild);
    }

    // Bouton 🚪 Déconnexion à droite
    if (!document.getElementById('chLogoutBtn')) {
      const rightSide = topBar.querySelector('.top-right') || topBar;
      const lbtn = document.createElement('button');
      lbtn.id = 'chLogoutBtn';
      lbtn.innerHTML = '🚪';
      lbtn.title = 'Se déconnecter';
      lbtn.style.cssText = `
        background: var(--glass-bg);
        border: 1px solid var(--glass-border);
        width: 36px; height: 36px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 14px;
        font-family: inherit; font-weight: 500;
        margin-left: 6px;
        transition: all 0.2s;
        display: inline-flex; align-items: center; justify-content: center;
      `;
      lbtn.onmouseover = () => { lbtn.style.background = 'rgba(255,69,58,0.12)'; lbtn.style.borderColor = '#ff453a'; };
      lbtn.onmouseout = () => { lbtn.style.background = 'var(--glass-bg)'; lbtn.style.borderColor = 'var(--glass-border)'; };
      lbtn.onclick = () => {
        if (confirm('Tu veux te déconnecter ?')) {
          try { localStorage.removeItem('revyzia_current_user'); } catch(e) {}
          const depth = (CHAPTER.depth || 1);
          const prefix = '../'.repeat(depth);
          window.location.href = prefix + 'index.html';
        }
      };
      // Insérer juste avant le theme-toggle s'il existe
      const themeToggle = rightSide.querySelector('.theme-toggle, [onclick*="toggleTheme"]');
      if (themeToggle) {
        rightSide.insertBefore(lbtn, themeToggle);
      } else {
        rightSide.appendChild(lbtn);
      }
    }
  }

  function initFirebaseSync() {
    R.loadFirebaseSDK(
      () => {
        // ⚠️ FIX BUG : à la connexion Firebase, on rapatrie d'abord les données
        const u = R.getCurrentUser();
        if (!u || !R.fbReady || !R.fbDb) return;
        const key = (u.key || u.name + '__' + u.klass).replace(/[.#$\[\]\/]/g, '_');
        R.fbDb.ref('users/' + key).once('value').then(function(snap) {
          const remote = snap.val();
          const local = R.loadUserData(u);
          const merged = R.mergeUserData(local, remote);
          // Sauvegarde locale fusionnée
          try { localStorage.setItem(R.localUserKey(u), JSON.stringify(merged)); } catch(e) {}
          // Push pour sécuriser Firebase
          R.pushToFirebase(merged, u);
          console.log('[Revyzia chapter] 🔄 Fusion local+Firebase OK (XP:', merged.totalXp, ')');
        }).catch(function(err) {
          console.warn('[Revyzia chapter] Fusion impossible:', err);
        });
      },
      () => { /* offline, ça marchera quand même en local */ }
    );
  }

  // ---- 3. Sync XP du chapitre avec le compte global ----
  // Stratégie : on intercepte les modifications du localStorage du chapitre
  // À chaque changement de l'XP du chapitre, on recalcule l'XP total global
  function setupChapterSync() {
    // Cherche la clé localStorage du chapitre (commence par "antigone_v1_user_" ou "eh1989_v2_user_" etc.)
    const localKey = findChapterLocalKey();
    if (!localKey) return;

    let lastChapterXp = getChapterXp(localKey);
    syncToGlobal(lastChapterXp);

    // Observer les changements toutes les 2 secondes (simple et robuste)
    setInterval(() => {
      const currentXp = getChapterXp(localKey);
      if (currentXp !== lastChapterXp) {
        const delta = currentXp - lastChapterXp;
        lastChapterXp = currentXp;
        if (delta > 0) syncToGlobal(currentXp);
      }
    }, 2000);

    // Aussi sync au déchargement de page
    window.addEventListener('beforeunload', () => {
      const currentXp = getChapterXp(localKey);
      syncToGlobal(currentXp);
    });
  }

  function findChapterLocalKey() {
    // Pattern : recherche la clé du chapitre actuel (peut être "antigone_v1_user_X" ou "eh1989_v2_user_X")
    const user = R.getCurrentUser();
    if (!user) return null;
    // Le chapitre stocke avec son propre préfixe + le pseudo (qui était basé sur prénom__classe ou juste prénom)
    // On va chercher TOUTES les clés du chapitre et prendre la plus récente
    const candidates = [];
    const knownPrefixes = ['antigone_v1_user_', 'eh1989_v2_user_'];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      for (const pfx of knownPrefixes) {
        if (k.startsWith(pfx)) candidates.push(k);
      }
    }
    if (candidates.length === 0) return null;
    // Prendre celle qui correspond le mieux à l'utilisateur (par nom)
    const userNameLower = user.name.toLowerCase();
    const best = candidates.find(k => k.toLowerCase().includes(userNameLower)) || candidates[0];
    return best;
  }

  function getChapterXp(localKey) {
    try {
      const raw = localStorage.getItem(localKey);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      return data.totalXp || 0;
    } catch (e) { return 0; }
  }

  function syncToGlobal(chapterXp) {
    const user = R.getCurrentUser();
    if (!user) return;
    // Charger les données globales
    const globalData = R.loadUserData(user);
    // Mettre à jour les XP de ce chapitre — prendre le MAX (anti-écrasement)
    if (!globalData.chapters) globalData.chapters = {};
    const prev = globalData.chapters[CHAPTER.id] || { xp: 0 };
    const prevXp = prev.xp || 0;
    const newXp = Math.max(prevXp, chapterXp);  // 🔒 anti-écrasement local
    const delta = newXp - prevXp;
    globalData.chapters[CHAPTER.id] = {
      xp: newXp,
      subject: CHAPTER.subject,
      title: CHAPTER.title,
      lastSeen: Date.now()
    };
    // Recalculer le totalXp global = somme de tous les chapitres
    let total = 0;
    for (const k in globalData.chapters) {
      total += (globalData.chapters[k].xp || 0);
    }
    globalData.totalXp = total;
    // Streak
    R.recomputeStreakOnLoad(globalData);
    if (delta > 0) {
      R.tickStreakOnAction(globalData);
    }
    R.saveUserData(globalData, user);
  }
})();
