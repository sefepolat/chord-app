const C = 'chords-v7';
const FILES = ['./', 'index.html', 'app.js', 'cloud.js', 'firebase-config.js', 'style.css', 'songs.json', 'manifest.json'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(FILES))));
self.addEventListener('fetch', e => e.respondWith(
  fetch(e.request).then(r => { const copy = r.clone(); caches.open(C).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request))
));
