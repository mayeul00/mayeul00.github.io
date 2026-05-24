<!--
=== REVYZIA — Template de chapitre modulaire ===
À utiliser pour chaque nouveau chapitre.
Tout le contenu se met dans une variable globale CHAPTER_DATA avant de charger ce fichier.
-->

<!--
EXEMPLE D'UTILISATION dans une page chapitre :

<script>
window.CHAPTER_DATA = {
  id: "histoire_1989",
  subject: "histoire",
  subjectName: "Histoire",
  subjectIcon: "🌍",
  title: "Le monde après 1989",
  subtitle: "Chapitre 8 · Enjeux et conflits depuis 1989",
  badge: "📚 Histoire · 3e",
  accentColor: "#ff3b80",
  accent2Color: "#5e5cff",
  tabs: [
    {
      id: "guerre_froide",
      icon: "🧊",
      label: "Fin de la Guerre froide",
      lessons: [ { chapter, title, body }, ... ],
      flashcards: [ { front, back }, ... ],
      qcm: [ { q, options, correct, exp }, ... ]
    },
    ...
  ]
};
</script>
<script src="../shared/chapter-engine.js"></script>
-->
