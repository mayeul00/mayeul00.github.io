/* ============================================================
   REVYZIA — Chapter Engine (Universal)
   ============================================================
   Construit dynamiquement toute la page d'un chapitre à partir
   de la variable globale window.CHAPTER_DATA.

   Gère :
   - Navigation 3 niveaux : onglets thèmes → modes → contenu
   - Cours / Flashcards / QCM
   - Anti-farm XP (1 fois par item)
   - Sync localStorage + Firebase avec MERGE (anti-écrasement)
   - Streak : tique au login + à chaque action
   - Boutons retour hub + déconnexion
   - Theme light/dark
============================================================ */

(function() {
  'use strict';

  // ============================================================
  // CONFIG (basique - sera surchargée par CHAPTER_DATA)
  // ============================================================
  const D = window.CHAPTER_DATA;
  if (!D) {
    console.error('[chapter-engine] window.CHAPTER_DATA manquant !');
    return;
  }

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBnx_vlRm3rd1eNIAtMIHBFsxJHV7h8vKU",
    authDomain: "revyzia.firebaseapp.com",
    databaseURL: "https://revyzia-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "revyzia",
    storageBucket: "revyzia.firebasestorage.app",
    messagingSenderId: "447321876734",
    appId: "1:447321876734:web:b783846225faef221f5daf"
  };

  const STORAGE_KEY = 'revyzia_chapter_' + D.id + '_user_';
  const XP_BY_MODE = { lesson: 3, flashcards: 5, qcm: 10 };
  const DEPTH = D.depth || 1;

  // ============================================================
  // ÉTAT
  // ============================================================
  let currentUser = null;
  let userData = null;
  let state = { tabIdx: 0, mode: null, idx: 0, items: [], score: 0, answered: false };

  let fbApp = null, fbDb = null, fbReady = false;
  let lastFirebasePushTime = 0;
  let pushDebounceTimer = null;

  // ============================================================
  // UTILITAIRES
  // ============================================================
  const $ = id => document.getElementById(id);
  const setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };
  const setHTML = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };
  const setStyle = (id, p, v) => { const e = $(id); if (e) e.style[p] = v; };
  const escHtml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function todayStr() { return new Date().toISOString().slice(0,10); }
  function daysBetween(d1, d2) {
    const a = new Date(d1 + 'T00:00:00Z');
    const b = new Date(d2 + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  }

  // ============================================================
  // USER + STORAGE
  // ============================================================
  function getCurrentUser() {
    try { const r = localStorage.getItem('revyzia_current_user'); return r ? JSON.parse(r) : null; }
    catch(e) { return null; }
  }
  function logout() {
    if (!confirm('Tu veux te déconnecter ?')) return;
    try { localStorage.removeItem('revyzia_current_user'); } catch(e) {}
    window.location.href = '../'.repeat(DEPTH) + 'index.html';
  }
  function navAway(suffix) {
    // 🚀 Forcer un push immédiat avant de quitter (annuler le debounce)
    if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
    lastFirebasePushTime = 0;  // bypass la limite "1 push / 3s"
    try {
      const h = JSON.parse(localStorage.getItem(hubKey()) || '{}');
      pushToFirebase(h);
    } catch(e) {}
    // Petit délai pour laisser Firebase répondre, puis on redirige
    setTimeout(function() {
      window.location.href = '../'.repeat(DEPTH) + 'index.html' + (suffix || '');
    }, 300);
  }
  // ← Retour à la LISTE DES CHAPITRES de la matière
  function backToChapters() { navAway('?subject=' + encodeURIComponent(D.subject || '')); }
  // 🏠 Retour à l'ACCUEIL (choix de la matière)
  function backToHub() { navAway(''); }
  // 🔤 Génère TOUJOURS la clé normalisée (sans accents, lowercase)
  function normalizeName(name) {
    if (!name) return '';
    return String(name).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  function getStableUserKey(u) {
    return normalizeName(u.name) + '__' + u.klass;
  }
  function userKey() { return STORAGE_KEY + getStableUserKey(currentUser); }
  function hubKey() { return 'revyzia_user_' + getStableUserKey(currentUser); }

  function loadUserData() {
    try { const r = localStorage.getItem(userKey()); if (r) return JSON.parse(r); } catch(e) {}
    return { totalXp: 0, completedItems: {}, createdAt: Date.now() };
  }
  function saveUserData() {
    try { localStorage.setItem(userKey(), JSON.stringify(userData)); } catch(e) {}
    syncWithHub();
  }

  // ============================================================
  // STREAK
  // ============================================================
  function recomputeStreakOnLoad(d) {
    if (!d.lastReviewDate) { d.streakValue = 0; return; }
    const diff = daysBetween(d.lastReviewDate, todayStr());
    if (diff <= 1) d.streakValue = d.streakDays || 0;
    else d.streakValue = 0;
  }
  function tickStreak(d) {
    const today = todayStr();
    if (typeof d.streakDays !== 'number') d.streakDays = 0;
    if (!d.lastReviewDate) {
      d.streakDays = 1; d.lastReviewDate = today; d.streakValue = 1;
      if (d.streakDays > (d.bestStreakDays || 0)) d.bestStreakDays = d.streakDays;
      return true;
    }
    const diff = daysBetween(d.lastReviewDate, today);
    if (diff <= 0) { d.streakValue = d.streakDays; return false; }
    if (diff === 1) d.streakDays = d.streakDays + 1;
    else d.streakDays = 1;
    d.lastReviewDate = today;
    d.streakValue = d.streakDays;
    if (d.streakDays > (d.bestStreakDays || 0)) d.bestStreakDays = d.streakDays;
    return true;
  }

  // ============================================================
  // SYNC AVEC HUB + FIREBASE
  // ============================================================
  // Calcule le nombre total d'items du chapitre (lessons + flashcards + qcm)
  function getTotalItems() {
    let total = 0;
    (D.tabs || []).forEach(function(t) {
      total += (t.lessons || []).length + (t.flashcards || []).length + (t.qcm || []).length + (t.exercises || []).length;
    });
    return total;
  }
  // Calcule le nombre de QCM total et le nombre réussi (pour les étoiles)
  function getQcmStats() {
    let totalQcm = 0, doneQcm = 0;
    (D.tabs || []).forEach(function(t) {
      (t.qcm || []).forEach(function(q, idx) {
        totalQcm++;
        const key = t.id + '__qcm__' + idx;
        if (userData.completedItems && userData.completedItems[key]) doneQcm++;
      });
    });
    return { totalQcm: totalQcm, doneQcm: doneQcm };
  }

  function syncWithHub() {
    if (!currentUser) return;
    try {
      let h = {};
      try { const r = localStorage.getItem(hubKey()); if (r) h = JSON.parse(r); } catch(e) {}
      if (!h.chapters) h.chapters = {};

      // Progression : nb d'items complétés / total
      const totalItems = getTotalItems();
      const doneItems = userData.completedItems ? Object.keys(userData.completedItems).length : 0;
      const progress = totalItems > 0 ? Math.min(100, Math.round(doneItems / totalItems * 100)) : 0;
      // Score QCM pour les étoiles (réussis = ceux qui ont donné de l'XP = bonnes réponses)
      const qcmStats = getQcmStats();
      const qcmScore = qcmStats.totalQcm > 0 ? (qcmStats.doneQcm / qcmStats.totalQcm) : 0;

      // 🔒 ANTI-ÉCRASEMENT : on prend le MAX
      const prev = h.chapters[D.id] || { xp: 0 };
      const newXp = Math.max(prev.xp || 0, userData.totalXp || 0);
      h.chapters[D.id] = {
        xp: newXp,
        subject: D.subject,
        title: D.title,
        progress: Math.max(prev.progress || 0, progress),
        qcmScore: Math.max(prev.qcmScore || 0, qcmScore),
        lastSeen: Date.now()
      };

      // Recalculer total
      let total = 0;
      for (const k in h.chapters) total += (h.chapters[k].xp || 0);
      h.totalXp = Math.max(h.totalXp || 0, total);
      h.name = currentUser.name;
      h.userClass = currentUser.klass;

      // Streak : on recalcule juste l'affichage (le tick se fait à l'ouverture de la page)
      recomputeStreakOnLoad(h);

      localStorage.setItem(hubKey(), JSON.stringify(h));

      // Update UI
      setText('xpNum', h.totalXp || 0);
      setText('streakNum', h.streakValue || 0);
      const sm = $('streakMini');
      if (sm) sm.classList.toggle('zero', (h.streakValue || 0) === 0);

      // 🔥 Push to Firebase (avec debounce pour éviter spam)
      schedulePush(h);
    } catch(e) { console.error('[engine] syncWithHub:', e); }
  }

  function schedulePush(hubData) {
    if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
    pushDebounceTimer = setTimeout(() => pushToFirebase(hubData), 2000);
  }

  function pushToFirebase(data) {
    if (!fbReady || !fbDb || !currentUser) return;
    // 🔒 Limite : 1 push toutes les 3 secondes max
    const now = Date.now();
    if (now - lastFirebasePushTime < 3000) {
      if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
      pushDebounceTimer = setTimeout(() => pushToFirebase(data), 3000);
      return;
    }
    lastFirebasePushTime = now;
    try {
      const key = getStableUserKey(currentUser).replace(/[.#$\[\]\/]/g, '_');
      const ref = fbDb.ref('users/' + key);
      ref.once('value').then(function(snap) {
        const remote = snap.val();
        const merged = mergeUserData(data, remote);
        try { localStorage.setItem(hubKey(), JSON.stringify(merged)); } catch(e) {}

        // 🛡️ PROTECTION : si local=0 mais Firebase a des XP, on ne push pas (on rapatrie)
        const localXp = data.totalXp || 0;
        const remoteXp = (remote && remote.totalXp) || 0;
        if (localXp === 0 && remoteXp > 0) {
          console.log('[engine] 🛡️ Local=0 vs Firebase=' + remoteXp + ' → rapatriement');
          setText('xpNum', merged.totalXp || 0);
          setText('streakNum', merged.streakValue || 0);
          return;
        }

        // Ne push QUE si vraiment différent
        if (remote &&
            (merged.totalXp || 0) === (remote.totalXp || 0) &&
            (merged.streakDays || 0) === (remote.streakDays || 0) &&
            (merged.lastReviewDate || '') === (remote.lastReviewDate || '')) {
          return;  // Identique, skip
        }
        ref.set({
          name: merged.name || currentUser.name,
          userClass: merged.userClass || currentUser.klass,
          totalXp: merged.totalXp || 0,
          streakDays: merged.streakDays || 0,
          streakValue: merged.streakValue || 0,
          bestStreakDays: merged.bestStreakDays || 0,
          lastReviewDate: merged.lastReviewDate || null,
          badges: merged.badges || [],
          pinnedChapters: merged.pinnedChapters || [],
          pinsUpdatedAt: merged.pinsUpdatedAt || 0,
          chapters: merged.chapters || {},
          lastSeen: Date.now()
        }).then(() => {
          // Update UI avec valeurs fusionnées
          setText('xpNum', merged.totalXp || 0);
          setText('streakNum', merged.streakValue || 0);
        }).catch(err => console.warn('[engine] push fail:', err));
      }).catch(err => console.warn('[engine] read fail:', err));
    } catch(e) { console.warn('[engine] push exception:', e); }
  }

  function mergeUserData(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    const localDate = local.lastReviewDate || '';
    const remoteDate = remote.lastReviewDate || '';
    // Streak cohérent : on prend celui de la date la plus récente (pas le max aveugle)
    let streakDays, streakValue, latestReviewDate;
    if (localDate > remoteDate) {
      latestReviewDate = localDate; streakDays = local.streakDays || 0; streakValue = local.streakValue || 0;
    } else if (remoteDate > localDate) {
      latestReviewDate = remoteDate; streakDays = remote.streakDays || 0; streakValue = remote.streakValue || 0;
    } else {
      latestReviewDate = localDate || null;
      streakDays = Math.max(local.streakDays || 0, remote.streakDays || 0);
      streakValue = Math.max(local.streakValue || 0, remote.streakValue || 0);
    }
    const merged = {
      name: local.name || remote.name,
      userClass: local.userClass || remote.userClass,
      totalXp: Math.max(local.totalXp || 0, remote.totalXp || 0),
      streakDays: streakDays,
      streakValue: streakValue,
      bestStreakDays: Math.max(local.bestStreakDays || 0, remote.bestStreakDays || 0),
      lastReviewDate: latestReviewDate || null,
      badges: (local.badges && local.badges.length >= (remote.badges || []).length) ? local.badges : (remote.badges || []),
      pinnedChapters: (local.pinsUpdatedAt || 0) >= (remote.pinsUpdatedAt || 0) ? (local.pinnedChapters || remote.pinnedChapters || []) : (remote.pinnedChapters || []),
      pinsUpdatedAt: Math.max(local.pinsUpdatedAt || 0, remote.pinsUpdatedAt || 0),
      chapters: {}
    };
    const allKeys = new Set([...Object.keys(local.chapters || {}), ...Object.keys(remote.chapters || {})]);
    allKeys.forEach(k => {
      const l = (local.chapters || {})[k] || {};
      const r = (remote.chapters || {})[k] || {};
      merged.chapters[k] = {
        xp: Math.max(l.xp || 0, r.xp || 0),
        subject: l.subject || r.subject,
        title: l.title || r.title,
        progress: Math.max(l.progress || 0, r.progress || 0),
        qcmScore: Math.max(l.qcmScore || 0, r.qcmScore || 0),
        lastSeen: Math.max(l.lastSeen || 0, r.lastSeen || 0)
      };
    });
    let sum = 0;
    for (const k in merged.chapters) sum += (merged.chapters[k].xp || 0);
    if (sum > merged.totalXp) merged.totalXp = sum;
    return merged;
  }

  // ============================================================
  // XP — Anti-farm
  // ============================================================
  function addXpForItem(itemKey, amount) {
    if (!userData.completedItems) userData.completedItems = {};
    // 🐛 DEBUG : log pour comprendre ce qui se passe
    console.log('[engine] addXpForItem', itemKey, '| déjà fait?', !!userData.completedItems[itemKey], '| total avant:', userData.totalXp || 0);
    if (userData.completedItems[itemKey]) {
      console.log('[engine] ⏭️ Skip XP (déjà gagné):', itemKey);
      return false;
    }
    userData.completedItems[itemKey] = { xp: amount, when: Date.now() };
    userData.totalXp = (userData.totalXp || 0) + amount;
    console.log('[engine] ✨ +' + amount + ' XP gagnés ! Nouveau total:', userData.totalXp);
    saveUserData();
    showToast('+' + amount + ' XP ⚡', 'success');
    return true;
  }
  function itemKey(tabId, mode, idx) {
    return tabId + '__' + mode + '__' + idx;
  }

  // ============================================================
  // THEME
  // ============================================================
  function toggleTheme() {
    const c = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', c);
    setText('themeToggle', c === 'light' ? '🌙' : '☀️');
    try { localStorage.setItem('revyzia_theme', c); } catch(e) {}
  }
  function loadTheme() {
    try {
      const s = localStorage.getItem('revyzia_theme');
      if (s) {
        document.documentElement.setAttribute('data-theme', s);
        setText('themeToggle', s === 'light' ? '🌙' : '☀️');
      }
    } catch(e) {}
  }

  // ============================================================
  // BUILD UI : construit toute la page
  // ============================================================
  function buildUI() {
    // CSS variables selon couleur du chapitre
    document.documentElement.style.setProperty('--ch-accent', D.accentColor || '#5e5cff');
    document.documentElement.style.setProperty('--ch-accent-2', D.accent2Color || '#ff3b80');

    document.body.innerHTML = `
<div class="orb orb-1"></div>
<div class="orb orb-2"></div>

<header class="top-bar glass">
  <div class="brand">
    <button class="back-btn" onclick="window.__rev_backToChapters()" title="Retour aux chapitres">←</button>
    <button class="back-btn" onclick="window.__rev_backToHub()" title="Accueil (choix de la matière)">🏠</button>
    <div class="brand-icon">${D.subjectIcon || '📚'}</div>
    <span class="brand-name">${escHtml(D.subjectName || D.subject)}</span>
  </div>
  <div class="top-right">
    <div class="streak-mini zero" id="streakMini">🔥 <span id="streakNum">0</span></div>
    <div class="xp-mini">⚡ <span id="xpNum">0</span></div>
    <button class="logout-btn" onclick="window.__rev_logout()">🚪 Déconnexion</button>
    <button class="theme-toggle" onclick="window.__rev_toggleTheme()" id="themeToggle">🌙</button>
  </div>
</header>

<main>

<div id="home-view">
  <div class="hero">
    <span class="badge">${escHtml(D.badge || (D.subjectIcon + ' ' + D.subject))}</span>
    <h1>${escHtml(D.title)}</h1>
    <p class="subtitle">${escHtml(D.subtitle || '')}</p>
  </div>

  <div class="tabs" id="tabsContainer"></div>

  <div id="modesContainer"></div>

  <div style="text-align:center; margin-top:24px; font-size:13px; color:var(--ink-faint);">
    💡 Conseil : commence par "Le cours", puis "Flashcards" pour mémoriser, et termine par les "QCM" !
  </div>
</div>

<div id="study-view" class="study-view">
  <button class="study-back" onclick="window.__rev_backHome()">← Retour aux modes</button>
  <div class="study-header">
    <h2 id="study-title">Mode</h2>
    <div class="topic" id="study-topic">Topic</div>
  </div>
  <div class="progress-bar"><div class="fill" id="progressFill" style="width:0%"></div></div>
  <div class="stats-row">
    <div class="stats-pill" id="statsCount">1/1</div>
    <div class="stats-pill" id="statsScore" style="display:none">✅ 0</div>
  </div>
  <div id="study-content"></div>
</div>

</main>

<div class="toast" id="toast"></div>
    `;

    renderTabs();
    renderModes(0);
  }

  function renderTabs() {
    const container = $('tabsContainer');
    container.innerHTML = D.tabs.map((t, i) =>
      `<button class="tab-btn ${i === state.tabIdx ? 'active' : ''}" onclick="window.__rev_switchTab(${i})">${t.icon || ''} ${escHtml(t.label)}</button>`
    ).join('');
  }

  function renderModes(tabIdx) {
    state.tabIdx = tabIdx;
    renderTabs();
    const tab = D.tabs[tabIdx];
    if (!tab) return;
    const c = $('modesContainer');
    const colors = ['#5e5cff', '#ff3b80', '#00c2ff', '#ff9f0a'];
    let html = '<div class="modes-grid">';
    if (tab.lessons && tab.lessons.length) {
      html += `<div class="mode-card glass" style="--mc:${colors[0]}" onclick="window.__rev_startMode('lesson')">
        <span class="icon">📖</span><h3>Le cours</h3><p>Tout comprendre</p><div class="meta">${tab.lessons.length} leçons</div></div>`;
    }
    if (tab.flashcards && tab.flashcards.length) {
      html += `<div class="mode-card glass" style="--mc:${colors[1]}" onclick="window.__rev_startMode('flashcards')">
        <span class="icon">🃏</span><h3>Flashcards</h3><p>Mémoriser</p><div class="meta">${tab.flashcards.length} cartes</div></div>`;
    }
    if (tab.qcm && tab.qcm.length) {
      html += `<div class="mode-card glass" style="--mc:${colors[2]}" onclick="window.__rev_startMode('qcm')">
        <span class="icon">🎯</span><h3>QCM</h3><p>Tester</p><div class="meta">${tab.qcm.length} questions</div></div>`;
    }
    if (tab.exercises && tab.exercises.length) {
      html += `<div class="mode-card glass" style="--mc:${colors[3]}" onclick="window.__rev_startMode('exercises')">
        <span class="icon">📝</span><h3>Exos type Brevet</h3><p>S'entraîner</p><div class="meta">${tab.exercises.length} exercices</div></div>`;
    }
    html += '</div>';
    c.innerHTML = html;
  }

  // ============================================================
  // STUDY MODE
  // ============================================================
  function startMode(mode) {
    const tab = D.tabs[state.tabIdx];
    state.mode = mode;
    state.idx = 0;
    state.score = 0;
    state.answered = false;
    state.answers = [];  // 🆕 historique des réponses QCM pour le récap
    if (mode === 'lesson') state.items = tab.lessons;
    else if (mode === 'flashcards') state.items = tab.flashcards;
    else if (mode === 'qcm') state.items = tab.qcm;
    else if (mode === 'exercises') state.items = tab.exercises;

    $('home-view').style.display = 'none';
    $('study-view').classList.add('active');
    $('study-view').style.display = 'block';

    const labels = { lesson: '📖 Le cours', flashcards: '🃏 Flashcards', qcm: '🎯 QCM', exercises: '📝 Exos type Brevet' };
    setText('study-title', labels[mode]);
    setText('study-topic', (tab.icon || '') + ' ' + tab.label);
    $('statsScore').style.display = (mode === 'qcm') ? 'inline-block' : 'none';
    renderItem();
  }

  function backHome() {
    state.mode = null;
    $('study-view').classList.remove('active');
    $('study-view').style.display = 'none';
    $('home-view').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderItem() {
    const total = state.items.length;
    setText('statsCount', (state.idx + 1) + '/' + total);
    setText('statsScore', '✅ ' + state.score);
    $('progressFill').style.width = ((state.idx + 1) / total * 100) + '%';
    const item = state.items[state.idx];
    if (state.mode === 'lesson') renderLesson(item);
    else if (state.mode === 'flashcards') renderFlashcard(item);
    else if (state.mode === 'exercises') renderExercise(item);
    else renderQcm(item);
  }

  // Exercice type brevet : énoncé + bouton "voir correction" + correction détaillée
  function renderExercise(item) {
    setHTML('study-content', `
      <div class="lesson-card glass">
        <div class="lesson-chapter">${escHtml(item.source || 'Exercice type Brevet')} ${item.points ? '· ' + item.points + ' pts' : ''}</div>
        <h3 class="lesson-title">${escHtml(item.title || 'Exercice')}</h3>
        <div class="lesson-body">${item.statement}</div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="window.__rev_toggleCorrection()">👁️ Voir la correction</button>
        <div id="correction" style="display:none; margin-top:16px;">
          <div class="qcm-exp exp-ok"><strong>✅ Correction</strong>${item.correction}</div>
        </div>
      </div>
      <div class="controls">
        <button class="btn btn-ghost" onclick="window.__rev_prevItem()" ${state.idx===0?'disabled':''}>← Précédent</button>
        <button class="btn btn-primary" onclick="window.__rev_nextItem(true)">${state.idx===state.items.length-1?'Terminer ✓':'Suivant →'}</button>
      </div>
    `);
  }

  function renderLesson(item) {
    setHTML('study-content', `
      <div class="lesson-card glass">
        <div class="lesson-chapter">${escHtml(item.chapter || '')}</div>
        <h3 class="lesson-title">${escHtml(item.title)}</h3>
        <div class="lesson-body">${item.body}</div>
      </div>
      <div class="controls">
        <button class="btn btn-ghost" onclick="window.__rev_prevItem()" ${state.idx===0?'disabled':''}>← Précédent</button>
        <button class="btn btn-primary" onclick="window.__rev_nextItem(true)">${state.idx===state.items.length-1?'Terminer ✓':'Suivant →'}</button>
      </div>
    `);
  }

  function renderFlashcard(item) {
    setHTML('study-content', `
      <div class="flashcard" id="fc" onclick="document.getElementById('fc').classList.toggle('flipped')">
        <div class="flashcard-inner">
          <div class="flashcard-face glass">
            <div class="fc-label">📚 Question</div>
            <div class="fc-content">${escHtml(item.front)}</div>
            <div class="fc-hint">Clique pour retourner</div>
          </div>
          <div class="flashcard-face flashcard-back glass">
            <div class="fc-label">💡 Réponse</div>
            <div class="fc-content sm">${escHtml(item.back)}</div>
          </div>
        </div>
      </div>
      <div class="controls">
        <button class="btn btn-ghost" onclick="window.__rev_prevItem()" ${state.idx===0?'disabled':''}>← Précédent</button>
        <button class="btn btn-primary" onclick="window.__rev_nextItem(true)">${state.idx===state.items.length-1?'Terminer ✓':'Suivant →'}</button>
      </div>
    `);
  }

  function renderQcm(item) {
    state.answered = false;
    const opts = item.options.map((o, i) =>
      `<button class="qcm-option" id="qcmOpt${i}" onclick="window.__rev_answerQcm(${i})">${escHtml(o)}</button>`
    ).join('');
    setHTML('study-content', `
      <div class="qcm-card glass">
        <div class="qcm-q">${escHtml(item.q)}</div>
        <div class="qcm-options">${opts}</div>
        <div id="exp"></div>
        <div id="continueHint" class="continue-hint" style="display:none">👆 Touche pour continuer</div>
      </div>
    `);
  }

  function answerQcm(picked) {
    if (state.answered) return;
    state.answered = true;
    const item = state.items[state.idx];
    const ok = picked === item.correct;

    // Animation : entoure les bonnes/mauvaises réponses
    document.querySelectorAll('.qcm-option').forEach((b, i) => {
      b.disabled = true;
      if (i === item.correct) b.classList.add('correct');
      else if (i === picked) b.classList.add('wrong');
      else b.classList.add('dimmed');
    });

    const tab = D.tabs[state.tabIdx];
    if (ok) {
      state.score++;
      addXpForItem(itemKey(tab.id, 'qcm', state.idx), XP_BY_MODE.qcm);
    }

    // 🆕 Enregistrer la réponse pour le récap final
    state.answers[state.idx] = { picked: picked, correct: item.correct, ok: ok };

    // Afficher la justification avec fondu
    setHTML('exp', `<div class="qcm-exp ${ok ? 'exp-ok' : 'exp-no'}"><strong>${ok ? '✅ Correct !' : '❌ Faux — la bonne réponse : ' + escHtml(item.options[item.correct])}</strong>${item.exp ? '<br>' + escHtml(item.exp) : ''}</div>`);
    setText('statsScore', '✅ ' + state.score);

    // ⏱️ Auto-advance après 2,5s (le temps de lire la correction)
    // Petite barre de progression visuelle pendant l'attente
    const hint = $('continueHint');
    if (hint) {
      hint.style.display = 'block';
      hint.innerHTML = '<div class="autobar"><div class="autobar-fill"></div></div>';
    }
    state.autoTimer = setTimeout(function() {
      advanceQcm();
    }, 2500);
  }

  // Avance dans le QCM (auto après délai)
  function advanceQcm() {
    if (state.autoTimer) { clearTimeout(state.autoTimer); state.autoTimer = null; }
    if (!state.answered) return;
    if (state.idx < state.items.length - 1) {
      state.idx++;
      state.answered = false;
      renderItem();
    } else {
      showCompletion();
    }
  }

  function prevItem() {
    if (state.idx > 0) {
      state.idx--;
      state.answered = false;
      renderItem();
    }
  }
  function nextItem(xpFlag) {
    const tab = D.tabs[state.tabIdx];
    if (state.idx < state.items.length - 1) {
      if (xpFlag) addXpForItem(itemKey(tab.id, state.mode, state.idx), XP_BY_MODE[state.mode] || 5);
      state.idx++;
      state.answered = false;
      renderItem();
    } else {
      if (xpFlag) addXpForItem(itemKey(tab.id, state.mode, state.idx), XP_BY_MODE[state.mode] || 5);
      showCompletion();
    }
  }

  function showCompletion() {
    const total = state.items.length;
    const pct = state.mode === 'qcm' ? Math.round(state.score / total * 100) : 100;
    const msg = pct >= 80 ? '🏆 Excellent ! Tu maîtrises !' : pct >= 60 ? '💪 Bien joué !' : '📚 Reprends le cours !';

    let recapHtml = '';
    if (state.mode === 'qcm') {
      recapHtml = '<div class="qcm-recap"><h3 class="recap-title">📋 Correction détaillée</h3>';
      state.items.forEach(function(item, i) {
        const ans = state.answers[i];
        const userPick = ans ? ans.picked : -1;
        const ok = ans ? ans.ok : false;
        recapHtml += `
          <div class="recap-item ${ok ? 'recap-ok' : 'recap-no'}">
            <div class="recap-q"><span class="recap-num">${i + 1}</span> ${escHtml(item.q)}</div>
            <div class="recap-answers">
              ${userPick >= 0 && !ok ? `<div class="recap-line your-wrong">❌ Ta réponse : ${escHtml(item.options[userPick])}</div>` : ''}
              <div class="recap-line correct-ans">✅ Bonne réponse : ${escHtml(item.options[item.correct])}</div>
              ${item.exp ? `<div class="recap-exp">💡 ${escHtml(item.exp)}</div>` : ''}
            </div>
          </div>`;
      });
      recapHtml += '</div>';
    }

    setHTML('study-content', `
      <div class="completion glass">
        <span class="icon">${pct>=80?'🏆':pct>=60?'🎯':'💪'}</span>
        <h2>Terminé !</h2>
        ${state.mode === 'qcm' ? `<div class="score-big">${state.score}/${total}</div>` : ''}
        <p>${msg}</p>
        <div class="controls" style="margin-top:22px">
          <button class="btn btn-ghost" onclick="window.__rev_backHome()">← Retour</button>
          <button class="btn btn-primary" onclick="window.__rev_startMode('${state.mode}')">🔄 Recommencer</button>
        </div>
      </div>
      ${recapHtml}
    `);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================================
  // TOAST
  // ============================================================
  function showToast(msg, type) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' '+type : '');
    setTimeout(() => t.classList.remove('show'), 2500);
  }

  // ============================================================
  // FIREBASE
  // ============================================================
  function loadFirebaseSDK(onReady) {
    if (typeof firebase !== 'undefined') { initFirebase(); onReady && onReady(); return; }
    const CDNS = [
      'https://cdn.jsdelivr.net/npm/firebase@9.23.0',
      'https://unpkg.com/firebase@9.23.0',
      'https://www.gstatic.com/firebasejs/9.23.0'
    ];
    function loadScr(url) {
      return new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = url; s.onload = res; s.onerror = () => rej(new Error(url));
        document.head.appendChild(s);
      });
    }
    function tryCDN(i) {
      if (i >= CDNS.length) return Promise.reject(new Error('all failed'));
      const b = CDNS[i];
      return loadScr(b + '/firebase-app-compat.js')
        .then(() => loadScr(b + '/firebase-database-compat.js'))
        .catch(() => tryCDN(i + 1));
    }
    tryCDN(0).then(() => { initFirebase(); onReady && onReady(); }).catch(err => console.warn('[engine] FB CDN fail:', err));
  }
  function initFirebase() {
    if (fbReady || typeof firebase === 'undefined') return;
    try {
      fbApp = firebase.initializeApp(FIREBASE_CONFIG);
      fbDb = firebase.database();
      fbReady = true;
      console.log('[engine] ✅ Firebase ready');
      // Première lecture pour fusionner
      if (currentUser) {
        const key = getStableUserKey(currentUser).replace(/[.#$\[\]\/]/g, '_');
        fbDb.ref('users/' + key).once('value').then(snap => {
          const remote = snap.val();
          let h = {}; try { h = JSON.parse(localStorage.getItem(hubKey()) || '{}'); } catch(e) {}
          const merged = mergeUserData(h, remote);
          try { localStorage.setItem(hubKey(), JSON.stringify(merged)); } catch(e) {}
          setText('xpNum', merged.totalXp || 0);
          setText('streakNum', merged.streakValue || 0);
          const sm = $('streakMini');
          if (sm) sm.classList.toggle('zero', (merged.streakValue || 0) === 0);
        }).catch(err => console.warn('[engine] fb read fail:', err));
      }
    } catch(e) { console.error('[engine] FB init:', e); }
  }

  // ============================================================
  // GLOBAL HANDLERS (pour onclick)
  // ============================================================
  window.__rev_backToHub = backToHub;
  window.__rev_backToChapters = backToChapters;
  window.__rev_logout = logout;
  window.__rev_toggleTheme = toggleTheme;
  window.__rev_switchTab = (i) => { renderModes(i); };
  window.__rev_startMode = startMode;
  window.__rev_backHome = backHome;
  window.__rev_prevItem = prevItem;
  window.__rev_nextItem = nextItem;
  window.__rev_answerQcm = answerQcm;
  window.__rev_advanceQcm = advanceQcm;
  window.__rev_toggleCorrection = function() {
    const el = $('correction');
    if (el) el.style.display = (el.style.display === 'none') ? 'block' : 'none';
  };

  // ============================================================
  // INIT
  // ============================================================
  document.addEventListener('DOMContentLoaded', function() {
    loadTheme();
    currentUser = getCurrentUser();
    if (!currentUser) {
      window.location.href = '../'.repeat(DEPTH) + 'index.html';
      return;
    }
    userData = loadUserData();
    buildUI();
    // Tique le streak à l'ouverture
    let h = {}; try { h = JSON.parse(localStorage.getItem(hubKey()) || '{}'); } catch(e) {}
    recomputeStreakOnLoad(h);
    tickStreak(h);
    try { localStorage.setItem(hubKey(), JSON.stringify(h)); } catch(e) {}
    setText('xpNum', h.totalXp || 0);
    setText('streakNum', h.streakValue || 0);
    const sm = $('streakMini');
    if (sm) sm.classList.toggle('zero', (h.streakValue || 0) === 0);
    // Firebase
    loadFirebaseSDK();
  });
})();
