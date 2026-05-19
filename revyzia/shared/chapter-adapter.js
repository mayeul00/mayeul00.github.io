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
  });

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
  }

  function initFirebaseSync() {
    R.loadFirebaseSDK(
      () => { /* ready, le sync se fera automatiquement à chaque saveUserData */ },
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
    // Mettre à jour les XP de ce chapitre
    if (!globalData.chapters) globalData.chapters = {};
    const prev = globalData.chapters[CHAPTER.id] || { xp: 0 };
    const delta = chapterXp - (prev.xp || 0);
    globalData.chapters[CHAPTER.id] = {
      xp: chapterXp,
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
    // Synchroniser le streak (le chapitre a peut-être bougé son streak local, on le récupère)
    R.recomputeStreakOnLoad(globalData);
    if (delta > 0) {
      // Si XP gagné, tick le streak global
      R.tickStreakOnAction(globalData);
    }
    R.saveUserData(globalData, user);
  }
})();
