# 🔒 Sécuriser Firebase (Realtime Database) — Revyzia

Firebase a envoyé un avertissement : tes règles actuelles autorisent la **lecture et l'écriture publiques**
(`".read": true` / `".write": true`). C'est pour ça que la base risque d'être **désactivée dans 5 jours**.
Voici la vraie solution, qui garde ton UX (juste un prénom) : l'**authentification anonyme**.

> Le code de `index.html` a déjà été mis à jour pour se connecter en **anonyme** automatiquement
> (un identifiant unique est généré en arrière-plan, l'utilisateur ne voit rien de plus).
> Il te reste **2 choses à faire dans la console Firebase** ⬇️

---

## Étape 1 — Activer l'authentification anonyme (1 min)
1. Console Firebase → projet **revyzia**
2. Menu **Authentication** → onglet **Sign-in method** (Méthode de connexion)
3. Dans la liste, clique sur **Anonyme** → **Activer** → **Enregistrer**

⚠️ **Indispensable** : sans cette étape, l'app ne pourra plus lire/écrire (les règles ci-dessous
exigent une connexion). Active l'anonyme AVANT de publier les règles, ou fais les deux à la suite.

---

## Étape 2 — Publier les règles sécurisées
**Realtime Database** → onglet **Règles** → remplace tout par ceci → **Publier** :

```json
{
  "rules": {
    "users": {
      ".read": "auth != null",
      "$uid": {
        ".write": "auth != null",
        ".validate": "newData.hasChildren(['name'])",
        "name":           { ".validate": "newData.isString() && newData.val().length <= 40" },
        "userClass":      { ".validate": "newData.isString() && newData.val().length <= 20" },
        "totalXp":        { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 1000000" },
        "streakDays":     { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000" },
        "streakValue":    { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000" },
        "bestStreakDays": { ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000" },
        "lastReviewDate": { ".validate": "newData.isString() && newData.val().length <= 10" },
        "lastSeen":       { ".validate": "newData.isNumber()" },
        "pinsUpdatedAt":  { ".validate": "newData.isNumber()" },
        "badges":         { ".validate": "newData.hasChildren() || newData.val() == null" },
        "pinnedChapters": { ".validate": "newData.hasChildren() || newData.val() == null" },
        "chapters":       { ".validate": "true" },
        "tutoDone":       { ".validate": "newData.isBoolean()" },
        "noUpdatePopup":  { ".validate": "newData.isBoolean()" },
        "seenUpdate":     { ".validate": "newData.isString() && newData.val().length <= 60" },
        "$other": { ".validate": false }
      }
    },
    "$other": { ".read": false, ".write": false }
  }
}
```

### Ce que ça change
- ✅ **Plus d'accès public** → Firebase ne désactivera plus ta base (l'avertissement disparaît).
- ✅ Seuls les visiteurs **authentifiés** (donc passés par ton site, qui les connecte en anonyme)
  peuvent lire le podium et écrire. **Les bots / scripts / robots d'indexation sont bloqués.**
- ✅ Les écritures restent **validées** (tailles et types contrôlés) → pas de spam géant ni de données cassées.
- ✅ Le **podium** fonctionne toujours (lecture de `users` autorisée aux utilisateurs connectés).

---

## Honnêteté : la limite de cette approche
Comme ton app identifie les élèves par leur **prénom** (et pas par leur identifiant anonyme, pour que
la progression suive l'élève d'un appareil à l'autre), un utilisateur connecté pourrait techniquement
encore modifier la fiche d'un autre. Mais l'essentiel est réglé : **fini l'accès public**, donc fini les
attaques de bots, le vandalisme de masse et le risque de saturation du forfait gratuit — c'est ce qui
déclenchait l'alerte de Firebase.

### (Optionnel, plus tard) Verrouiller chaque fiche à son propriétaire
Pour que chacun ne modifie QUE sa propre fiche, il faudrait stocker les données sous l'identifiant
anonyme (`auth.uid`) au lieu du prénom. Mais l'identité anonyme **change si on efface ses cookies ou
qu'on change d'appareil** → l'élève perdrait sa progression et le lien prénom↔classe. C'est pour ça
qu'on garde l'identification par prénom ici. Si un jour tu veux ce niveau de sécurité, il faudra
ajouter une vraie connexion (e-mail ou Google) pour rattacher durablement un compte à un élève.

---

## Note technique
Le SDK **firebase-auth-compat.js** est désormais chargé par le site, et `signInAnonymously()` est
appelé au démarrage. Si tu vois dans la console du navigateur « Auth anonyme échec », c'est que
l'étape 1 (activer Anonyme) n'a pas encore été faite.
