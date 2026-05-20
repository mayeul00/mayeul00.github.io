# 🎓 Revyzia — Plateforme de révision pour la classe

## 📁 Structure du dossier

```
revyzia/
├── index.html                      ← Hub principal (login + dashboard)
├── shared/
│   ├── revyzia.js                  ← Module partagé (Firebase + whitelist)
│   └── chapter-adapter.js          ← Adaptateur pour les chapitres
├── histoire/
│   └── 1989.html                   ← Chapitre 8 histoire
├── francais/
│   └── antigone.html               ← Antigone d'Anouilh
├── espagnol/
│   └── preterit.html               ← Prétérit irrégulier
├── physique/
│   └── poids-gravitation.html      ← Poids et gravitation
├── emc/                            ← Vide (à remplir plus tard)
├── maths/                          ← Vide (à remplir plus tard)
├── techno/                         ← Vide (à remplir plus tard)
└── svt/                            ← Vide (à remplir plus tard)
```

## ✅ Ce qui est déjà fait

- ✅ Firebase intégré avec ta config (`revyzia` projet, asia-southeast1)
- ✅ Whitelist 3eA avec les 25 prénoms
- ✅ Normalisation accents/majuscules (Eléa = elea = ELÉA)
- ✅ Désambiguïsation Alice B / Alice Y
- ✅ Bouton "demander à rejoindre" si quelqu'un n'est pas dans la liste
- ✅ Podium classe global (XP cumulé toutes matières)
- ✅ Bouton "← retour au hub" dans chaque chapitre
- ✅ XP synchronisé entre chapitres et hub
- ✅ Dark/light mode partagé

## 🚀 Mise en ligne sur GitHub Pages

### 1. Créer le repo
1. Va sur https://github.com/ → connecte-toi
2. **"+" en haut à droite → "New repository"**
3. Nom : `revyzia` (ou ce que tu veux)
4. Coche **"Public"**
5. **NE COCHE PAS** "Add README" (on en a déjà un)
6. Clique **"Create repository"**

### 2. Uploader les fichiers
Méthode simple :
1. Sur la page de ton nouveau repo, clique **"uploading an existing file"**
2. Glisse-dépose **TOUT LE CONTENU** du dossier `revyzia/` (PAS le dossier lui-même, son contenu)
3. ⚠️ Important : GitHub doit voir `index.html` à la racine
4. Commit changes

### 3. Activer GitHub Pages
1. **Settings** (en haut du repo) → **Pages** (menu de gauche)
2. Source : **"Deploy from a branch"**
3. Branch : **main** → **/(root)** → **Save**
4. Attends ~1 min
5. Recharge la page Settings → Pages
6. Tu vois : `Your site is live at https://TON-USERNAME.github.io/revyzia/`
7. **C'est ton lien à partager à la classe !** 🎉

## 🔥 Règles Firebase (À FAIRE PLUS TARD, pas maintenant)

⚠️ **Pour l'instant garde le "mode test"** pour pouvoir débugger.

Une fois que tout marche en classe (~1 semaine), va dans :
- **Firebase Console → Realtime Database → Règles**

Et remplace par :
```json
{
  "rules": {
    "users": {
      ".read": true,
      "$uid": {
        ".write": "!data.exists() || data.child('totalXp').val() <= newData.child('totalXp').val()"
      }
    },
    "join_requests": {
      ".read": true,
      ".write": true
    }
  }
}
```

Ça empêche quelqu'un de **baisser** son XP ou ceux des autres (anti-troll).

## 👀 Comment voir les demandes de rejoindre

Si quelqu'un de pas dans la liste demande à rejoindre :
1. Va sur **Firebase Console → Realtime Database**
2. Tu verras un nœud `join_requests/` avec les demandes
3. Si tu veux ajouter la personne, édite `shared/revyzia.js` et ajoute son prénom dans `CLASSES`

## 📝 Ajouter un nouveau chapitre

1. Créer le fichier HTML (par exemple `svt/respiration.html`)
2. **AVANT** la balise `</head>`, ajouter :
```html
<script>
window.REVYZIA_CHAPTER = {
  id: "svt_respiration",        // identifiant unique
  subject: "svt",
  title: "La respiration",
  depth: 1
};
</script>
<script src="../shared/revyzia.js"></script>
<script src="../shared/chapter-adapter.js"></script>
```
3. Dans `index.html`, dans le tableau `SUBJECTS`, ajouter le chapitre dans la section SVT :
```javascript
{ id: 'svt', name: 'SVT', icon: '🌱', color: '#34c759', chapters: [
  { id: 'respiration', title: 'La respiration', sub: 'Chapitre X', file: 'svt/respiration.html', ready: true }
]},
```
4. Upload sur GitHub, c'est en ligne en 1 min.

## ➕ Ajouter la 3eB

Édite `shared/revyzia.js`, ligne ~20, et remplis le tableau `3eB` :
```javascript
"3eB": [
  "Prénom1", "Prénom2", ...
]
```

## 🐛 Si quelque chose plante

- Ouvre la console du navigateur (F12 sur PC, ou Inspect sur Mac)
- Les erreurs s'affichent en rouge
- Le bouton "← retour au hub" en haut à gauche de chaque chapitre est ta porte de sortie
- Le bouton "Me déconnecter" en bas du hub nettoie tout

## 🆘 En cas de souci HK / VPN

Firebase passe normalement à Hong Kong sans VPN. Si jamais ça bloque :
- Le site continuera de marcher en local sur l'appareil
- Le podium ne se mettra juste pas à jour
- Le message "Connexion au podium en cours..." restera affiché

---

Bonne révision la classe ! 🎓🔥
