// Firebase yüklenemezse (dosya eksik, CDN erişilemiyor vb.) uygulama yerel modda çalışmaya devam eder.
let cloud = { enabled: false, pushSong() {}, removeSong() {} };
const $ = id => document.getElementById(id);
const KEY = 'chord-songs-v1';
let songs = JSON.parse(localStorage.getItem(KEY) || 'null');
let current = null, transpose = 0, fontSize = 16, timer = null, signedIn = false;

const save = () => localStorage.setItem(KEY, JSON.stringify(songs));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// İlk açılışta repodaki songs.json'u yükle
async function init() {
  if (!songs) {
    try { songs = await (await fetch('songs.json')).json(); } catch { songs = []; }
    save();
  }
  renderList();
  try { cloud = await import('./cloud.js'); }
  catch (e) { console.error('Firebase yüklenemedi:', e); }
  if (cloud.enabled) {
    $('authBtn').hidden = false;
    cloud.initCloud({
      getLocal: () => songs,
      onError: e => { console.error(e); alert('Firebase hatası: ' + (e.code || e.message) + '\nFirestore kurallarını ve yetkili alan adlarını kontrol et.'); },
      onUser: u => { signedIn = !!u; $('authBtn').textContent = u ? 'Çıkış (' + (u.displayName || u.email) + ')' : 'Giriş yap'; },
      onSongs: list => {
        songs = list; save();
        if (!$('listView').hidden) renderList();
        else if (!$('viewView').hidden && current) {
          const fresh = songs.find(s => s.id === current.id);
          if (fresh) { current = fresh; draw(); }
        }
      }
    });
    $('authBtn').onclick = () => (signedIn ? cloud.logout() : cloud.login()).catch(e => alert('Giriş hatası: ' + (e.code || e.message)));
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}

// ---- Transpoze ----
const SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
function transChord(ch, n) {
  return ch.replace(/[A-G][#b]?/g, m => {
    let i = SHARP.indexOf(m); if (i < 0) i = FLAT.indexOf(m);
    if (i < 0) return m;
    const j = ((i + n) % 12 + 12) % 12;
    return (m.includes('b') ? FLAT : SHARP)[j];
  });
}

// ---- Render ----
const esc = s => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
// [Am]söz satırını: üstte akor satırı, altta söz satırı olacak şekilde çevir
// Hizalı (akor satırı üstte, söz altta) düz metin için: akor satırlarını bulur, renklendirir ve
// transpoze ederken sütun hizasını korur.
const CHORD_RE = /^[A-G][#b]?(?:maj|min|m|M|dim|aug|sus|add)?\d*(?:\([^)]*\))?(?:sus\d|add\d+)?(?:\/[A-G][#b]?)?$/;
const isChordLine = line => {
  const t = line.trim().split(/\s+/);
  return line.trim() !== '' && t.every(x => CHORD_RE.test(x));
};
function renderRaw(text, n) {
  return text.split('\n').map(line => {
    if (!isChordLine(line)) return esc(line);
    let out = '', len = 0;
    for (const m of line.matchAll(/\S+/g)) {
      let pad = m.index - len;
      if (pad < 1 && len > 0) pad = 1;
      pad = Math.max(pad, 0);
      const c = transChord(m[0], n);
      out += ' '.repeat(pad) + `<span class="chord">${esc(c)}</span>`;
      len += pad + c.length;
    }
    return out;
  }).join('\n');
}
function renderBody(text, n, raw) {
  if (raw) return renderRaw(text, n); // hizalı metin: yerleşimi değiştirmeden göster
  return text.split('\n').map(line => {
    if (/^\s*\{.*\}\s*$/.test(line) || /^\s*(\[?(Verse|Chorus|Bridge|Intro|Solo|Nakarat|Kıta)[^\]]*\]?:?)\s*$/i.test(line))
      return `<span class="sec">${esc(line.replace(/[{}]/g, ''))}</span>`;
    if (!/\[[^\]]+\]/.test(line)) return esc(line);
    // Satırda sadece akor + boşluk varsa (söz yok): tek satır olarak, sütunları koruyarak yaz
    if (line.replace(/\[[^\]]+\]/g, '').trim() === '')
      return line.replace(/\[([^\]]+)\]/g, (_, c) => ` <span class="chord">${esc(transChord(c, n))}</span> `);
    return buildTwoLines(line.split(/(\[[^\]]+\])/), n);
  }).join('\n');
}
function buildTwoLines(parts, n) {
  let chordLine = '', plain = 0, lyric = '', chordPlain = 0;
  for (const p of parts) {
    const m = p.match(/^\[([^\]]+)\]$/);
    if (m) {
      const c = transChord(m[1], n);
      if (chordPlain < plain) { chordLine += ' '.repeat(plain - chordPlain); chordPlain = plain; }
      else if (chordPlain > 0 && chordPlain >= plain) { chordLine += ' '; chordPlain++; }
      chordLine += `<span class="chord">${esc(c)}</span>`;
      chordPlain += c.length;
    } else { lyric += p; plain += p.length; }
  }
  return chordLine + '\n' + esc(lyric);
}

// ---- Görünümler ----
function show(v) {
  for (const id of ['listView','viewView','editView']) $(id).hidden = id !== v;
  $('backBtn').hidden = v === 'listView';
  if (v !== 'viewView') stopScroll();
}
function renderList() {
  const q = $('search').value.toLowerCase();
  $('songList').innerHTML = '';
  songs.filter(s => (s.title + s.artist).toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'))
    .forEach(s => {
      const li = document.createElement('li');
      li.innerHTML = `${esc(s.title)}<small>${esc(s.artist || '')}</small>`;
      li.onclick = () => openSong(s.id);
      $('songList').appendChild(li);
    });
  $('title').textContent = 'Akor Defteri';
  show('listView');
}
function openSong(id) {
  current = songs.find(s => s.id === id);
  transpose = 0; draw(); show('viewView');
  $('title').textContent = current.title;
}
function draw() {
  $('songBody').innerHTML = renderBody(current.body, transpose, current.raw);
  $('songBody').style.fontSize = fontSize + 'px';
  $('trLabel').textContent = (transpose > 0 ? '+' : '') + transpose;
}
function stopScroll() { clearInterval(timer); timer = null; $('scrollBtn').textContent = '▶ Kaydır'; }

$('search').oninput = renderList;
$('backBtn').onclick = renderList;
$('trUp').onclick = () => { transpose++; draw(); };
$('trDown').onclick = () => { transpose--; draw(); };
$('fontUp').onclick = () => { fontSize += 2; draw(); };
$('fontDown').onclick = () => { fontSize = Math.max(10, fontSize - 2); draw(); };
$('scrollBtn').onclick = () => {
  if (timer) return stopScroll();
  $('scrollBtn').textContent = '⏸ Dur';
  timer = setInterval(() => window.scrollBy(0, 1), 120 / $('speed').value * 2);
};
$('speed').oninput = () => { if (timer) { stopScroll(); $('scrollBtn').click(); } };
$('editBtn').onclick = () => edit(current);
$('newBtn').onclick = () => edit(null);

function edit(s) {
  current = s;
  $('eTitle').value = s ? s.title : '';
  $('eArtist').value = s ? s.artist : '';
  $('eBody').value = s ? s.body : '';
  $('eRaw').checked = s ? !!s.raw : true;
  $('deleteBtn').hidden = !s;
  show('editView');
}
$('saveBtn').onclick = () => {
  const title = $('eTitle').value.trim() || 'Adsız';
  const data = { title, artist: $('eArtist').value.trim(), body: $('eBody').value, raw: $('eRaw').checked };
  if (current) Object.assign(current, data);
  else { current = { id: uid(), ...data }; songs.push(current); }
  save(); cloud.pushSong(current); openSong(current.id);
};
$('deleteBtn').onclick = () => {
  if (!confirm('Silinsin mi?')) return;
  const id = current.id; songs = songs.filter(s => s !== current); save(); cloud.removeSong(id); renderList();
};

$('exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(songs, null, 2)], { type: 'application/json' }));
  a.download = 'songs.json'; a.click();
};
$('importFile').onchange = async e => {
  const files = [...e.target.files]; if (!files.length) return;
  let added = 0;
  try {
    for (const f of files) {
      const text = await f.text();
      if (/\.json$/i.test(f.name)) { // yedek dosyası
        JSON.parse(text).forEach(s => { addSong({ ...s, id: s.id || uid() }); added++; });
      } else { // düz metin (.txt): dosya adı = şarkı adı, hizalı metin olarak eklenir
        const body = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
          .split('\n').map(l => { // sekmeleri 8'lik duraklarla boşluğa çevir
            let o = ''; for (const ch of l) o += ch === '\t' ? ' '.repeat(8 - o.length % 8) : ch; return o;
          }).join('\n');
        const name = f.name.replace(/\.[^.]+$/, '');
        const [artist, title] = name.includes(' - ') ? name.split(' - ', 2) : ['', name];
        addSong({ id: uid(), title: (title || name).trim(), artist: artist.trim(), body, raw: true });
        added++;
      }
    }
    save(); renderList();
    alert(added + ' şarkı eklendi.');
  } catch { alert('Geçersiz dosya'); }
  e.target.value = '';
};
function addSong(song) {
  const i = songs.findIndex(s => s.id === song.id);
  if (i >= 0) songs[i] = song; else songs.push(song);
  cloud.pushSong(song);
}

init();
