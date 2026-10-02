# FitTrack — Suivi Santé & Fitness

Application web PWA de suivi de poids, tour de taille, calories et activités sportives.

## Fonctionnalités
- 📊 Dashboard avec courbes d'évolution
- ⚖️ Suivi poids & tour de taille
- 🍽️ Journal alimentaire (petit-déjeuner, déjeuner, dîner, collations)
- 🔥 Calculateur de calories brûlées (musculation, footing, trail, basketball...)
- 🧬 Calcul IMC, BMR, TDEE
- 📱 PWA installable sur téléphone
- 🔄 Synchronisation Firebase entre appareils
- 🌙 Mode sombre premium

## Configuration Firebase

1. Crée un projet sur [console.firebase.google.com](https://console.firebase.google.com)
2. Active **Authentication** → Sign-in method → **Google**
3. Active **Firestore Database** → mode production
4. Dans **Paramètres du projet** → Apps Web → copie la config
5. Colle la config dans `firebase-config.js`

## Déploiement GitHub Pages

```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TON-USERNAME/fittrack.git
git push -u origin main
```

Puis dans Settings → Pages → Source: `main` / `root`

## Structure des fichiers

```
suivi poids/
├── index.html          # Structure principale
├── style.css           # Design premium dark mode
├── mobile.css          # Optimisations mobile & PWA
├── app.js              # Logique principale
├── firebase-config.js  # ← Ta config Firebase (à remplir)
├── firebase-sync.js    # Synchronisation Firestore
├── sw.js               # Service Worker (offline)
├── manifest.json       # PWA manifest
└── icon-512.png        # Icône de l'app
```
