/* ==========================================
   FITTRACK — FIREBASE CONFIG
   
   ⚠️  ÉTAPES DE CONFIGURATION :
   
   1. Va sur https://console.firebase.google.com
   2. Clique "Ajouter un projet" → nom: "fittrack"
   3. Active Google Analytics si tu veux (optionnel)
   4. Dans le projet → clique l'icône Web </> → enregistre l'app
   5. Copie la config ci-dessous et remplace les valeurs
   6. Dans Firebase Console :
      - Authentication → Sign-in method → Google → Activer
      - Firestore Database → Créer une base → Mode production
      - Firestore → Règles → copie les règles ci-dessous
   
   RÈGLES FIRESTORE À COLLER :
   
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ========================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDynO65Y8OXrPKLxLd1SmkekOTXpLkmOBQ",
  authDomain: "fittrack-dimitri.firebaseapp.com",
  projectId: "fittrack-dimitri",
  storageBucket: "fittrack-dimitri.firebasestorage.app",
  messagingSenderId: "366186170683",
  appId: "1:366186170683:web:441fb07c82928a4a124f1e"
};


// ✅ Export pour firebase-sync.js
window.FIREBASE_CONFIG = firebaseConfig;

// Vérifie si la config est remplie
window.FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "COLLE_TON_API_KEY_ICI";
