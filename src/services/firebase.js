import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, setDoc, deleteDoc, collection, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import { firebaseConfig } from './firebase-config.js';

let app = null;
let auth = null;
let firestore = null;
const FIREBASE_ENABLED = String(import.meta.env.VITE_FIREBASE_ENABLED ?? 'true').toLowerCase() !== 'false';

function ensureApp() {
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

function ensureAuth() {
  // Use the standard browser Auth instance. The previous custom IndexedDB
  // persistence layer could leave an incompatible session object behind and
  // trigger internal errors such as `self._setSession is not a function`.
  // Firebase's normal getAuth() path is the supported browser default.
  if (!auth) auth = getAuth(ensureApp());
  return auth;
}

function ensureDb() {
  if (!FIREBASE_ENABLED) return null;
  if (!firestore) {
    try {
      firestore = initializeFirestore(ensureApp(), {
        experimentalForceLongPolling: true,
        useFetchStreams: false,
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      });
    } catch (e) {
      firestore = getFirestore(ensureApp());
    }
  }
  return firestore;
}

function authAdapter() {
  const instance = ensureAuth();
  return {
    get currentUser() { return instance.currentUser; },
    setPersistence: (type) => setPersistence(instance, type === 'session' ? browserSessionPersistence : browserLocalPersistence),
    signInWithEmailAndPassword: (email, password) => signInWithEmailAndPassword(instance, email, password),
    createUserWithEmailAndPassword: (email, password) => createUserWithEmailAndPassword(instance, email, password),
    signOut: () => signOut(instance),
    reauthenticateWithPassword: (email, password) => reauthenticateWithCredential(instance, EmailAuthProvider.credential(email, password)),
    updatePassword: (user, password) => updatePassword(user, password),
    onAuthStateChanged: (next, error) => onAuthStateChanged(instance, next, error)
  };
}

function wrapDoc(ref) {
  return {
    ref,
    async get() { return getDoc(ref); },
    set(data, options = {}) { return setDoc(ref, data, { merge: Boolean(options.merge) }); },
    create(data) { return setDoc(ref, data, { merge: false }); },
    delete() { return deleteDoc(ref); },
    onSnapshot(next, error) { return onSnapshot(ref, snap => next(snap), error); },
    collection(name) { return wrapCollection(collection(ref, name)); }
  };
}

function wrapCollection(ref) {
  return {
    ref,
    async get() { return getDocs(ref); },
    onSnapshot(next, error) { return onSnapshot(ref, snap => next(snap), error); },
    doc(id) { return wrapDoc(doc(ref, id)); }
  };
}

function dbAdapter() {
  const db = ensureDb();
  return {
    collection(name) { return wrapCollection(collection(db, name)); },
    batch() {
      const batch = writeBatch(db);
      return {
        set(ref, data, options = {}) { batch.set(ref.ref || ref, data, { merge: Boolean(options.merge) }); return this; },
        delete(ref) { batch.delete(ref.ref || ref); return this; },
        commit() { return batch.commit(); }
      };
    }
  };
}

export function initFirebaseApp() { return FIREBASE_ENABLED ? dbAdapter() : null; }
export function isFirebaseEnabled() { return FIREBASE_ENABLED; }
export function getAuthService() { return authAdapter(); }
export function getFirestoreService() { return ensureDb(); }
export function getFirebaseConfig() { return firebaseConfig; }
export function getFirebaseProjectId() { return String(firebaseConfig.projectId || ''); }

export async function createSecondaryUser(email, password) {
  // Create a collaborator account through the Firebase Auth REST endpoint.
  // This keeps the administrator's current browser session untouched and
  // avoids creating a second Auth instance in the same tab.
  const apiKey = String(firebaseConfig.apiKey || '');
  if (!apiKey) throw Object.assign(new Error('Firebase API key ausente.'), { code: 'auth/invalid-api-key' });
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: String(email).trim(), password: String(password), returnSecureToken: true })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.localId) {
    const raw = data && data.error && data.error.message ? String(data.error.message) : 'AUTH_CREATE_FAILED';
    const map = { EMAIL_EXISTS: 'auth/email-already-in-use', INVALID_EMAIL: 'auth/invalid-email', WEAK_PASSWORD: 'auth/weak-password', OPERATION_NOT_ALLOWED: 'auth/operation-not-allowed' };
    throw Object.assign(new Error(raw), { code: map[raw] || 'auth/internal-error' });
  }
  return { uid: data.localId, email: data.email || email, idToken: data.idToken || '' };
}

export async function deleteSecondaryUser(idToken, localId) {
  const apiKey = String(firebaseConfig.apiKey || '');
  if (!apiKey || !idToken || !localId) return false;
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key=' + encodeURIComponent(apiKey), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: String(idToken) })
  });
  return response.ok;
}

export { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, browserLocalPersistence, browserSessionPersistence };

if (typeof window !== 'undefined') {
  window.FIREBASE_CONFIG = firebaseConfig;
  window.getFirebaseAuth = getAuthService;
  window.initFirebaseApp = initFirebaseApp;
}
