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

const FIREBASE_CONFIG = {
  apiKey:            "COLLE_TON_API_KEY_ICI",
  authDomain:        "TON_PROJECT_ID.firebaseapp.com",
  projectId:         "TON_PROJECT_ID",
  storageBucket:     "TON_PROJECT_ID.appspot.com",
  messagingSenderId: "TON_SENDER_ID",
  appId:             "TON_APP_ID",
};

// ✅ Export pour firebase-sync.js
window.FIREBASE_CONFIG = FIREBASE_CONFIG;

// Vérifie si la config est remplie
window.FIREBASE_CONFIGURED = FIREBASE_CONFIG.apiKey !== "COLLE_TON_API_KEY_ICI";
