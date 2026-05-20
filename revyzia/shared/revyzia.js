// ============================================================
// REVYZIA — Module partagé Firebase + Whitelist
// Inclus dans tous les fichiers HTML (hub + chapitres)
// ============================================================

// ---------- CONFIG FIREBASE ----------
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBnx_vlRm3rd1eNIAtMIHBFsxJHV7h8vKU",
  authDomain: "revyzia.firebaseapp.com",
  databaseURL: "https://revyzia-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "revyzia",
  storageBucket: "revyzia.firebasestorage.app",
  messagingSenderId: "447321876734",
  appId: "1:447321876734:web:b783846225faef221f5daf"
};

// ---------- WHITELIST CLASSES ----------
const CLASSES = {
  "3eA": [
    "Alexis", "Alice B", "Alice Y", "Amandine", "Anatole", "Antoine",
    "Antoinette", "Aya", "Azzurra", "Clara", "Cléa", "Dan", "Eléa",
    "Flora", "Hadrien", "Johan", "Juliet", "Marilou", "Misha", "Paul",
    "Riles", "Scarlett", "Timothée", "Viki", "Mayeul"
  ],
  "3eB": [
    // À compléter quand Mayeul donne la liste
  ]
};

// ---------- NORMALIZATION (accents, majuscules) ----------
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Cherche un prénom dans la whitelist (insensible accents/casse)
// Retourne { matches: [...], exact: string|null }
function findInWhitelist(typed, klass) {
  const normalized = normalizeName(typed);
  if (!normalized) return { matches: [], exact: null };

  const classList = CLASSES[klass] || [];
  // 1) Match exact (après normalisation)
  const exactMatches = classList.filter(name => normalizeName(name) === normalized);
  if (exactMatches.length === 1) return { matches: exactMatches, exact: exactMatches[0] };
  if (exactMatches.length > 1) return { matches: exactMatches, exact: null }; // doublon (Alice B/Y)

  // 2) Match par prénom de base (ex: "Alice" matche "Alice B" et "Alice Y")
  const baseMatches = classList.filter(name => {
    const nameBase = normalizeName(name.split(' ')[0]);
    return nameBase === normalized;
  });
  if (baseMatches.length > 0) return { matches: baseMatches, exact: null };

  // 3) Pas trouvé
  return { matches: [], exact: null };
}

// ---------- FIREBASE INIT ----------
let fbApp = null, fbDb = null, fbReady = false;
const fbCallbacks = [];

function initFirebase() {
  if (fbReady || typeof firebase === 'undefined') return;
  try {
    fbApp = firebase.initializeApp(FIREBASE_CONFIG);
    fbDb = firebase.database();
    fbReady = true;
    fbCallbacks.forEach(cb => { try { cb(); } catch(e) {} });
  } catch (e) {
    console.error('Firebase init error:', e);
  }
}
function onFirebaseReady(cb) {
  if (fbReady) cb();
  else fbCallbacks.push(cb);
}

// ---------- LOAD FIREBASE SDK (dynamic, avec fallback CDN) ----------
const FIREBASE_CDNS = [
  'https://www.gstatic.com/firebasejs/9.23.0',
  'https://cdn.jsdelivr.net/npm/firebase@9.23.0',
  'https://unpkg.com/firebase@9.23.0'
];

function loadScript(url) {
  return new Promise(function(resolve, reject) {
    const s = document.createElement('script');
    s.src = url;
    s.onload = function() { resolve(); };
    s.onerror = function() { reject(new Error('fail: ' + url)); };
    document.head.appendChild(s);
  });
}

function tryLoadFirebaseFromCDN(cdnIdx) {
  if (cdnIdx >= FIREBASE_CDNS.length) return Promise.reject(new Error('Tous les CDN ont échoué'));
  const base = FIREBASE_CDNS[cdnIdx];
  return loadScript(base + '/firebase-app-compat.js')
    .then(function() { return loadScript(base + '/firebase-database-compat.js'); })
    .then(function() { console.log('[Revyzia] ✅ CDN', cdnIdx + 1, 'OK'); })
    .catch(function() { return tryLoadFirebaseFromCDN(cdnIdx + 1); });
}

function loadFirebaseSDK(onReady, onError) {
  if (typeof firebase !== 'undefined') { initFirebase(); onReady && onReady(); return; }
  tryLoadFirebaseFromCDN(0)
    .then(function() { initFirebase(); onReady && onReady(); })
    .catch(function(err) {
      console.error('[Revyzia] ❌ Tous les CDN Firebase ont échoué:', err);
      onError && onError('all CDNs failed');
    });
}

// ---------- USER KEY MANAGEMENT ----------
// L'utilisateur est stocké dans localStorage sous "revyzia_current_user"
// Format: { name: "Alice B", klass: "3eA", key: "Alice B__3eA" }
function getCurrentUser() {
  try {
    const raw = localStorage.getItem('revyzia_current_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function setCurrentUser(user) {
  try { localStorage.setItem('revyzia_current_user', JSON.stringify(user)); } catch(e) {}
}
function clearCurrentUser() {
  try { localStorage.removeItem('revyzia_current_user'); } catch(e) {}
}

// ---------- USER DATA (globale, partagée entre chapitres) ----------
function defaultUserData() {
  return {
    name: '',
    userClass: '',
    totalXp: 0,
    streakDays: 0,
    streakValue: 0,
    lastReviewDate: null,
    bestStreakDays: 0,
    badges: [],
    morningRev: false,
    nightRev: false,
    lastFirstPlaceBonus: null,
    createdAt: Date.now(),
    chapters: {}  // { "histoire_1989": { xp: 120, lastSeen: ... }, ... }
  };
}

function localUserKey(user) {
  if (!user) return null;
  return 'revyzia_user_' + (user.key || (user.name + '__' + user.klass));
}

function loadUserData(user) {
  user = user || getCurrentUser();
  if (!user) return defaultUserData();
  try {
    const raw = localStorage.getItem(localUserKey(user));
    return raw ? { ...defaultUserData(), ...JSON.parse(raw) } : defaultUserData();
  } catch (e) { return defaultUserData(); }
}

function saveUserData(data, user) {
  user = user || getCurrentUser();
  if (!user) return;
  try {
    data.name = user.name;
    data.userClass = user.klass;
    localStorage.setItem(localUserKey(user), JSON.stringify(data));
    pushToFirebase(data, user);
  } catch(e) {}
}

// Fusionne 2 jeux de données utilisateur en gardant le max (anti-écrasement)
function mergeUserData(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const merged = {
    name: local.name || remote.name,
    userClass: local.userClass || remote.userClass,
    totalXp: Math.max(local.totalXp || 0, remote.totalXp || 0),
    streakDays: Math.max(local.streakDays || 0, remote.streakDays || 0),
    streakValue: Math.max(local.streakValue || 0, remote.streakValue || 0),
    bestStreakDays: Math.max(local.bestStreakDays || 0, remote.bestStreakDays || 0),
    badges: (local.badges && local.badges.length >= (remote.badges || []).length) ? local.badges : (remote.badges || []),
    chapters: {},
    lastReviewDate: local.lastReviewDate || remote.lastReviewDate,
    createdAt: Math.min(local.createdAt || Date.now(), remote.createdAt || Date.now()),
    lastSeen: Date.now()
  };
  const allKeys = new Set([...Object.keys(local.chapters || {}), ...Object.keys(remote.chapters || {})]);
  allKeys.forEach(k => {
    const l = (local.chapters || {})[k] || {};
    const r = (remote.chapters || {})[k] || {};
    merged.chapters[k] = {
      xp: Math.max(l.xp || 0, r.xp || 0),
      subject: l.subject || r.subject,
      title: l.title || r.title,
      lastSeen: Math.max(l.lastSeen || 0, r.lastSeen || 0)
    };
  });
  let chaptersSum = 0;
  for (const k in merged.chapters) chaptersSum += (merged.chapters[k].xp || 0);
  if (chaptersSum > merged.totalXp) merged.totalXp = chaptersSum;
  return merged;
}

function pushToFirebase(data, user) {
  if (!fbReady || !user) return;
  try {
    const key = (user.key || (user.name + '__' + user.klass)).replace(/[.#$\[\]\/]/g, '_');
    const ref = fbDb.ref('users/' + key);
    // ⚠️ FIX BUG : lire d'abord puis fusionner (pas d'écrasement par 0)
    ref.once('value').then(function(snap) {
      const remote = snap.val();
      const merged = mergeUserData(data, remote);
      try { localStorage.setItem(localUserKey(user), JSON.stringify(merged)); } catch(e) {}
      ref.set({
        name: merged.name || user.name,
        userClass: merged.userClass || user.klass,
        totalXp: merged.totalXp || 0,
        streakDays: merged.streakDays || 0,
        streakValue: merged.streakValue || 0,
        bestStreakDays: merged.bestStreakDays || 0,
        badges: merged.badges || [],
        chapters: merged.chapters || {},
        lastSeen: Date.now()
      }).catch(function(err) { console.error('[Revyzia chapter] Push fail:', err); });
    }).catch(function(err) { console.error('[Revyzia chapter] Read fail:', err); });
  } catch (e) { console.error('[Revyzia chapter] Exception:', e); }
}

// ---------- REQUEST JOIN (notification quand quelqu'un veut rejoindre) ----------
function requestJoin(name, klass, message) {
  if (!fbReady) return Promise.reject('Firebase non prêt');
  try {
    const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    return fbDb.ref('join_requests/' + id).set({
      name: name,
      klass: klass || 'inconnue',
      message: message || '',
      timestamp: Date.now(),
      status: 'pending'
    });
  } catch (e) { return Promise.reject(e); }
}

// ---------- STREAK SYSTEM ----------
function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysBetween(d1, d2) {
  const a = new Date(d1 + 'T00:00:00Z');
  const b = new Date(d2 + 'T00:00:00Z');
  return Math.round((b - a) / (24 * 3600 * 1000));
}
function recomputeStreakOnLoad(data) {
  if (!data.lastReviewDate) {
    data.streakDays = 0; data.streakValue = 0; return;
  }
  const diff = daysBetween(data.lastReviewDate, todayStr());
  if (diff === 0 || diff === 1) data.streakValue = data.streakDays;
  else if (diff === 2) data.streakValue = Math.floor(data.streakDays / 2);
  else if (diff >= 3) { data.streakDays = 0; data.streakValue = 0; }
}
function tickStreakOnAction(data) {
  const today = todayStr();
  if (data.lastReviewDate === today) return;
  if (!data.lastReviewDate) {
    data.streakDays = 1;
  } else {
    const diff = daysBetween(data.lastReviewDate, today);
    if (diff === 1) data.streakDays++;
    else if (diff === 2) data.streakDays = Math.max(1, Math.floor(data.streakDays / 2) + 1);
    else data.streakDays = 1;
  }
  data.streakValue = data.streakDays;
  data.lastReviewDate = today;
  if (data.streakDays > (data.bestStreakDays || 0)) data.bestStreakDays = data.streakDays;
}

// ---------- LEVELS ----------
const LEVELS = [
  { lvl: 1, xp: 0, title: 'Apprenti' },
  { lvl: 2, xp: 100, title: 'Curieux' },
  { lvl: 3, xp: 250, title: 'Studieux' },
  { lvl: 4, xp: 500, title: 'Élève sérieux' },
  { lvl: 5, xp: 800, title: 'Expert junior' },
  { lvl: 6, xp: 1200, title: 'Historien' },
  { lvl: 7, xp: 1700, title: 'Spécialiste' },
  { lvl: 8, xp: 2300, title: 'Stratège' },
  { lvl: 9, xp: 3000, title: 'Géopoliticien' },
  { lvl: 10, xp: 4000, title: 'Légende' }
];
function getLevel(xp) {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xp) {
      const next = LEVELS[i + 1] || { xp: LEVELS[i].xp + 2000, title: 'Mythique' };
      return { ...LEVELS[i], nextXp: next.xp, nextTitle: next.title };
    }
  }
  return { lvl: 1, xp: 0, title: 'Apprenti', nextXp: 100, nextTitle: 'Curieux' };
}

// ---------- BADGES ----------
const BADGES = [
  { id: 'first', emoji: '🎯', name: '1er pas', condition: 'Premier exo fait', check: u => (u.totalXp || 0) >= 1 },
  { id: 'xp100', emoji: '⚡', name: '100 XP', condition: 'Atteindre 100 XP', check: u => u.totalXp >= 100 },
  { id: 'xp500', emoji: '⭐', name: '500 XP', condition: 'Atteindre 500 XP', check: u => u.totalXp >= 500 },
  { id: 'xp1000', emoji: '🏆', name: '1000 XP', condition: 'Atteindre 1000 XP', check: u => u.totalXp >= 1000 },
  { id: 'streak3d', emoji: '🔥', name: '3 jours', condition: '3 jours d\'affilée', check: u => (u.bestStreakDays || 0) >= 3 || (u.streakDays || 0) >= 3 },
  { id: 'streak7d', emoji: '🚀', name: '7 jours', condition: '7 jours d\'affilée', check: u => (u.bestStreakDays || 0) >= 7 || (u.streakDays || 0) >= 7 },
  { id: 'streak30d', emoji: '💥', name: '30 jours', condition: '30 jours d\'affilée', check: u => (u.bestStreakDays || 0) >= 30 || (u.streakDays || 0) >= 30 },
  { id: 'morning', emoji: '🌅', name: 'Lève-tôt', condition: 'Réviser avant 9h', check: u => u.morningRev },
  { id: 'night', emoji: '🌙', name: 'Nocturne', condition: 'Réviser après 22h', check: u => u.nightRev },
  { id: 'multi', emoji: '🎓', name: 'Polyvalent', condition: '3 matières différentes', check: u => Object.keys(u.chapters || {}).length >= 3 }
];

// ---------- SAFE DOM HELPERS ----------
function $(id) { return document.getElementById(id); }
function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
function setHTML(id, html) { const el = $(id); if (el) el.innerHTML = html; }
function setStyle(id, prop, val) { const el = $(id); if (el) el.style[prop] = val; }
function show(id) { const el = $(id); if (el) el.style.display = ''; }
function hide(id) { const el = $(id); if (el) el.style.display = 'none'; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Expose globally
window.REVYZIA = {
  CLASSES, FIREBASE_CONFIG, LEVELS, BADGES,
  normalizeName, findInWhitelist,
  loadFirebaseSDK, onFirebaseReady,
  getCurrentUser, setCurrentUser, clearCurrentUser,
  loadUserData, saveUserData, defaultUserData, pushToFirebase, requestJoin,
  mergeUserData, localUserKey,
  todayStr, recomputeStreakOnLoad, tickStreakOnAction,
  getLevel,
  $, setText, setHTML, setStyle, show, hide, escapeHtml,
  get fbReady() { return fbReady; },
  get fbDb() { return fbDb; }
};
