import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const enabled = !firebaseConfig.apiKey.startsWith('YOUR_');
let auth, db, user = null, unsub = null;

// onSongs(songsArray) -> bulut verisi değişince çağrılır; onUser(user|null) -> giriş durumu
export function initCloud({ onSongs, onUser, getLocal }) {
  if (!enabled) return;
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  onAuthStateChanged(auth, u => {
    user = u; onUser(u);
    if (unsub) { unsub(); unsub = null; }
    if (!u) return;
    let first = true;
    unsub = onSnapshot(collection(db, 'users', u.uid, 'songs'), snap => {
      const cloud = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (first) { // ilk eşitleme: bulutta olmayan yerel şarkıları yükle
        first = false;
        const ids = new Set(cloud.map(s => s.id));
        getLocal().filter(s => !ids.has(s.id)).forEach(s => { pushSong(s); cloud.push(s); });
      }
      onSongs(cloud);
    });
  });
}
export const login = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logout = () => signOut(auth);
export function pushSong(s) {
  if (!user) return;
  const { id, ...data } = s;
  setDoc(doc(db, 'users', user.uid, 'songs', id), data);
}
export function removeSong(id) {
  if (user) deleteDoc(doc(db, 'users', user.uid, 'songs', id));
}
