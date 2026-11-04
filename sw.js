const C = 'chords-v10';
const FILES = ['./', 'index.html', 'app.js', 'chords.js', 'metronome.js', 'cloud.js', 'firebase-config.js', 'style.css',
  'songs.json', 'manifest.json', 'convert.html', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(FILES))));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== C).map(k => caches.delete(k))))
));
self.addEventListener('fetch', e => e.respondWith(
  fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request))
));
