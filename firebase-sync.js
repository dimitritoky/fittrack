/* ==========================================
   FITTRACK — FIREBASE SYNC
   Authentification Google + Firestore sync
   ========================================== */

'use strict';

// ---- Firebase SDK (modules CDN) ----
// Chargement dynamique des SDK Firebase
const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.14.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore-compat.js',
];

// ---- STATE SYNC ----
let db = null;
let auth = null;
let currentUser = null;
let syncTimeout = null;
let isSyncing = false;

// ==========================================
// INITIALISATION FIREBASE
// ==========================================
async function initFirebase() {
  if (!window.FIREBASE_CONFIGURED) {
    console.info('Firebase non configuré — mode local uniquement');
    renderAuthUI(null);
    return;
  }

  // Charge les scripts SDK
  await loadScripts(FIREBASE_SCRIPTS);

  // Initialise l'app Firebase (garde contre double init)
  const app = firebase.apps.length === 0
    ? firebase.initializeApp(window.FIREBASE_CONFIG)
    : firebase.app();
  auth = firebase.auth();
  db   = firebase.firestore();


  // Active la persistence offline (Firestore cache local)
  db.enablePersistence({ synchronizeTabs: true })
    .catch(err => {
      if (err.code === 'failed-precondition') console.warn('Persistence: multi-onglets');
      else if (err.code === 'unimplemented')  console.warn('Persistence non supportée');
    });

  // Écoute l'état de connexion
  auth.onAuthStateChanged(user => {
    currentUser = user;
    renderAuthUI(user);
    if (user) {
      loadFromFirestore();
      startRealtimeSync();
    }
  });
}

function loadScripts(urls) {
  return Promise.all(urls.map(url => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  })));
}

// ==========================================
// AUTHENTIFICATION GOOGLE
// ==========================================
async function signInWithGoogle() {
  if (!auth) {
    console.error('Firebase Auth non initialisé');
    return;
  }
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    await auth.signInWithPopup(provider);
  } catch(e) {
    console.error('Erreur connexion popup:', e.code, e.message);
    // Si popup bloquée → utilise la redirection
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/cancelled-popup-request') {
      try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithRedirect(provider);
      } catch(e2) {
        console.error('Erreur connexion redirect:', e2);
        if (typeof toast === 'function') toast('❌ Erreur : ' + e2.message, 'error');
      }
    } else {
      if (typeof toast === 'function') toast('❌ ' + (e.message || e.code), 'error');
    }
  }
}


async function signOut() {
  if (!auth) return;
  await auth.signOut();
  showToastSync('👋 Déconnecté');
}

// ==========================================
// FIRESTORE — LECTURE & ÉCRITURE
// ==========================================
function getUserDoc() {
  if (!db || !currentUser) return null;
  return db.collection('users').doc(currentUser.uid);
}

async function saveToFirestore(stateToSave) {
  const userDoc = getUserDoc();
  if (!userDoc) return;
  if (isSyncing) return;
  isSyncing = true;
  updateSyncStatus('syncing');

  try {
    // Firestore limite les tailles de documents — on découpe en sous-collections
    const batch = db.batch();
    const ref = userDoc;

    // Profil + metadata
    batch.set(ref, {
      profil: stateToSave.profil || {},
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      device: navigator.userAgent.split(')')[0].split('(')[1] || 'unknown',
    }, { merge: true });

    await batch.commit();

    // Mesures (en sous-collection pour les grands datasets)
    await syncSubcollection(userDoc, 'mesures', stateToSave.mesures || []);

    // Activités
    await syncSubcollection(userDoc, 'activites', stateToSave.activites || []);

    // Aliments (par date)
    const alimEntries = Object.entries(stateToSave.aliments || {});
    for (const [date, dayData] of alimEntries) {
      await userDoc.collection('aliments').doc(date).set(dayData, { merge: false });
    }

    updateSyncStatus('ok');
    showToastSync('☁️ Synchronisé !', 'success');
  } catch(e) {
    console.error('Erreur sync Firestore:', e);
    updateSyncStatus('error');
    showToastSync('⚠️ Erreur sync : ' + e.message, 'error');
  } finally {
    isSyncing = false;
  }
}

async function syncSubcollection(userDoc, name, items) {
  const colRef = userDoc.collection(name);
  // Simple upsert : delete all + re-insert (optimisable avec des IDs)
  const snapshot = await colRef.get();
  const deleteBatch = db.batch();
  snapshot.docs.forEach(d => deleteBatch.delete(d.ref));
  await deleteBatch.commit();

  if (items.length === 0) return;
  // Découpe en batches de 500 (limite Firestore)
  const chunks = chunkArray(items, 400);
  for (const chunk of chunks) {
    const writeBatch = db.batch();
    chunk.forEach((item, i) => {
      writeBatch.set(colRef.doc(String(i)), item);
    });
    await writeBatch.commit();
  }
}

async function loadFromFirestore() {
  const userDoc = getUserDoc();
  if (!userDoc) return;
  updateSyncStatus('loading');

  try {
    const docSnap = await userDoc.get();
    if (!docSnap.exists) {
      // Première connexion : upload les données locales
      updateSyncStatus('ok');
      showToastSync('✅ Nouveau compte — données locales conservées', 'info');
      scheduleSave(window.state);
      return;
    }

    // Charge le profil
    const remote = docSnap.data();
    const newState = { ...window.state };
    if (remote.profil) newState.profil = remote.profil;

    // Charge les mesures
    const mesuresSnap = await userDoc.collection('mesures').get();
    newState.mesures = mesuresSnap.docs.map(d => d.data());

    // Charge les activités
    const activitesSnap = await userDoc.collection('activites').get();
    newState.activites = activitesSnap.docs.map(d => d.data());

    // Charge les aliments
    const alimSnap = await userDoc.collection('aliments').get();
    newState.aliments = {};
    alimSnap.docs.forEach(d => { newState.aliments[d.id] = d.data(); });

    // Met à jour le state global et recharge l'UI
    window.state = newState;
    window.saveState();
    window.refreshAllUI();

    updateSyncStatus('ok');
    showToastSync('☁️ Données chargées depuis le cloud !', 'success');
  } catch(e) {
    console.error('Erreur chargement Firestore:', e);
    updateSyncStatus('error');
  }
}

// ==========================================
// SYNC EN TEMPS RÉEL
// ==========================================
function startRealtimeSync() {
  const userDoc = getUserDoc();
  if (!userDoc) return;

  // Écoute les changements depuis d'autres appareils
  userDoc.onSnapshot(snap => {
    if (!snap.exists) return;
    const data = snap.data();
    // Recharge si modifié depuis un autre appareil
    if (data?.updatedAt && currentUser) {
      const lastLocal = window._lastSaveTime || 0;
      const remoteTime = data.updatedAt?.toMillis?.() || 0;
      if (remoteTime > lastLocal + 2000) {
        showToastSync('🔄 Mise à jour depuis un autre appareil...', 'info');
        loadFromFirestore();
      }
    }
  }, err => console.warn('onSnapshot error:', err));
}

// Debounce : attend 2s après le dernier changement avant de sauvegarder
function scheduleSave(stateToSave) {
  if (!currentUser || !db) return;
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    window._lastSaveTime = Date.now();
    saveToFirestore(stateToSave);
  }, 2000);
}

// ==========================================
// UI — AUTH & SYNC STATUS
// ==========================================
function renderAuthUI(user) {
  const containers = document.querySelectorAll('.firebase-auth-container');
  if (containers.length === 0) return;

  containers.forEach(container => {

  if (!window.FIREBASE_CONFIGURED) {
    container.innerHTML = `
      <div class="auth-unconfigured">
        <span class="auth-icon">⚙️</span>
        <span class="auth-text">Firebase non configuré</span>
        <a href="#" class="auth-link" onclick="showFirebaseHelp()">Comment faire ?</a>
      </div>`;
    return;
  }

  if (user) {
    const photo = user.photoURL
      ? `<img src="${user.photoURL}" class="auth-avatar" alt="avatar" />`
      : `<div class="auth-avatar-letter">${user.displayName?.[0] || '?'}</div>`;

    container.innerHTML = `
      <div class="auth-logged-in">
        ${photo}
        <div class="auth-user-info">
          <span class="auth-name">${user.displayName || user.email}</span>
          <span class="auth-sync-status" id="sync-status">☁️ Synchronisé</span>
        </div>
        <button class="auth-signout-btn" onclick="signOut()">Déconnexion</button>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="auth-logged-out">
        <div class="auth-info-text">
          <span class="auth-icon">🔄</span>
          <div>
            <strong>Synchronisation cloud</strong>
            <span>Accès depuis tous vos appareils</span>
          </div>
        </div>
        <button class="auth-google-btn" onclick="signInWithGoogle()">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Se connecter avec Google
        </button>
      </div>`;
  }
  });
}

function updateSyncStatus(status) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const states = {
    ok:      '☁️ Synchronisé',
    syncing: '🔄 Synchronisation...',
    loading: '⬇️ Chargement...',
    error:   '⚠️ Erreur sync',
  };
  el.textContent = states[status] || '';
  el.style.color = status === 'error' ? '#ff5e7a' : status === 'ok' ? '#3dffa0' : '#ffd54f';
}

function showToastSync(msg, type = 'info') {
  if (typeof toast === 'function') toast(msg, type);
}


function showFirebaseHelp() {
  const el = document.getElementById('firebase-help-modal');
  if (el) el.classList.add('open');
}

// ==========================================
// UTILS
// ==========================================
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ==========================================
// EXPORTS GLOBAUX (pour app.js)
// ==========================================
window.firebaseSync = {
  init: initFirebase,
  save: scheduleSave,
  signIn: signInWithGoogle,
  signOut,
  getCurrentUser: () => currentUser,
};
