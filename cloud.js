import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const enabled = !firebaseConfig.apiKey.startsWith('YOUR_');
let auth, db, user = null, unsubs = [], reportError = console.error;

// Her koleksiyon (songs, setlists) için: bulut verisi değişince onData(liste) çağrılır.
// getLocal(): cihazdaki veriler; ilk eşitlemede bulutta olmayanlar yüklenir.
export function initCloud({ onSongs, onSetlists, onUser, getLocalSongs, getLocalSetlists, onError = console.error }) {
  if (!enabled) return;
  reportError = onError;
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

  const listen = (name, getLocal, onData) => {
    let first = true;
    return onSnapshot(collection(db, 'users', user.uid, name), snap => {
      const cloud = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (first) { // ilk eşitleme: bulutta olmayan yerel kayıtları yükle
        first = false;
        const ids = new Set(cloud.map(s => s.id));
        getLocal().filter(s => !ids.has(s.id)).forEach(s => { push(name, s); cloud.push(s); });
      }
      onData(cloud);
    }, err => reportError(err));
  };

  onAuthStateChanged(auth, u => {
    user = u; onUser(u);
    unsubs.forEach(f => f()); unsubs = [];
    if (!u) return;
    unsubs.push(listen('songs', getLocalSongs, onSongs));
    unsubs.push(listen('setlists', getLocalSetlists, onSetlists));
  });
}

export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);

function push(name, item) {
  if (!user) return;
  const { id, ...data } = item;
  setDoc(doc(db, 'users', user.uid, name, id), data).catch(e => reportError(e));
}
function remove(name, id) {
  if (user) deleteDoc(doc(db, 'users', user.uid, name, id)).catch(e => reportError(e));
}
export const pushSong = s => push('songs', s);
export const removeSong = id => remove('songs', id);
export const pushSetlist = s => push('setlists', s);
export const removeSetlist = id => remove('setlists', id);
