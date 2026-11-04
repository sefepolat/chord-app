import { transposeChord, isChordToken, isChordLine, isIgnorableToken, findFirstChord, keyPrefersFlats } from './chords.js';
import { createMetronome } from './metronome.js';

// Firebase yüklenemezse (dosya eksik, CDN erişilemiyor vb.) uygulama yerel modda çalışmaya devam eder.
let cloud = { enabled: false, pushSong() {}, removeSong() {}, pushSetlist() {}, removeSetlist() {} };
const $ = id => document.getElementById(id);
const KEY = 'chord-songs-v1', SKEY = 'chord-setlists-v1';
let songs = JSON.parse(localStorage.getItem(KEY) || 'null');
let setlists = JSON.parse(localStorage.getItem(SKEY) || '[]');
let current = null, transpose = 0, fontSize = 16, timer = null, signedIn = false;
let tab = 'songs', view = 'listView', activeSet = null, setPos = -1, spell = false;
let twoCol = localStorage.getItem('chord-cols') === '1'; // iki sütun ayarı cihazda hatırlanır

const save = () => localStorage.setItem(KEY, JSON.stringify(songs));
const saveSets = () => localStorage.setItem(SKEY, JSON.stringify(setlists));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const songById = id => songs.find(s => s.id === id);

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
      getLocalSongs: () => songs,
      getLocalSetlists: () => setlists,
      onError: e => { console.error(e); alert('Firebase hatası: ' + (e.code || e.message) + '\nFirestore kurallarını ve yetkili alan adlarını kontrol et.'); },
      onUser: u => { signedIn = !!u; $('authBtn').textContent = u ? 'Çıkış (' + (u.displayName || u.email) + ')' : 'Giriş yap'; },
      onSongs: list => {
        songs = list; save();
        if (view === 'listView') renderList();
        else if (view === 'viewView' && current) {
          const fresh = songById(current.id);
          if (fresh) { current = fresh; draw(); }
        }
      },
      onSetlists: list => {
        setlists = list; saveSets();
        if (view === 'listView') renderList();
        else if (view === 'setView' && activeSet) {
          activeSet = setlists.find(s => s.id === activeSet.id) || null;
          activeSet ? renderSet() : renderList();
        }
      }
    });
    $('authBtn').onclick = () => (signedIn ? cloud.logout() : cloud.login()).catch(e => alert('Giriş hatası: ' + (e.code || e.message)));
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
}

// ---- Render ----
// Bölüm başlığı: "[Nakarat]", "Nakarat", "Nakarat:", "Verse 2" (satırda başka bir şey olmamalı)
const WORDS = 'Verse|Chorus|Bridge|Intro|Outro|Solo|Nakarat|Kıta|Giriş|Köprü';
const SECTION_RE = new RegExp(`^\\s*(?:\\[(?:${WORDS})[^\\]]*\\]|(?:${WORDS})(?:\\s*\\d+)?\\s*:?)\\s*$`, 'i');
const isSection = line => /^\s*\{.*\}\s*$/.test(line) || SECTION_RE.test(line);
const tc = tok => transposeChord(tok, transpose, spell);
const chordSpan = c => `<span class="chord">${esc(c)}</span>`;

// Hizalı (akor satırı üstte, söz altta) düz metin: yerleşimi koruyarak akorları renklendirir/transpoze eder.
// Not: render fonksiyonları "birim" dizisi döndürür. Birim = tek satır ya da akor satırı + altındaki söz satırı.
// Tek sütunda birimler '\n' ile birleştirilir; iki sütunda her birim bölünmez bir blok olur.
function renderRaw(text) {
  const fmt = line => {
    let out = '', len = 0;
    for (const m of line.matchAll(/\S+/g)) {
      let pad = m.index - len;
      if (pad < 1 && len > 0) pad = 1;
      pad = Math.max(pad, 0);
      const chord = isChordToken(m[0]);
      const t = chord ? tc(m[0]) : m[0];
      out += ' '.repeat(pad) + (chord ? chordSpan(t) : esc(t));
      len += pad + t.length;
    }
    return out;
  };
  const lines = text.split('\n'), units = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SECTION_RE.test(line)) { units.push(`<span class="sec">${esc(line)}</span>`); continue; }
    if (!isChordLine(line)) { units.push(esc(line)); continue; }
    const next = lines[i + 1];
    if (next !== undefined && next.trim() !== '' && !isChordLine(next) && !SECTION_RE.test(next)) {
      units.push(fmt(line) + '\n' + esc(next)); i++; // akor satırı ve sözü birlikte kalsın
    } else units.push(fmt(line));
  }
  return units;
}

// [Am]söz biçimi: üstte akor satırı, altta söz satırı
function renderBracket(text) {
  return text.split('\n').map(line => {
    if (isSection(line)) return `<span class="sec">${esc(line.replace(/[{}]/g, ''))}</span>`;
    if (!/\[[^\]]+\]/.test(line)) return esc(line);
    const parts = line.split(/(\[[^\]]+\])/);
    // Satırda sadece akor + boşluk varsa (söz yok): tek satır olarak, sütunları koruyarak yaz
    if (line.replace(/\[[^\]]+\]/g, '').trim() === '')
      return line.replace(/\[([^\]]+)\]/g, (_, c) => ` ${chordSpan(isChordToken(c) ? tc(c) : c)} `);
    return buildTwoLines(parts);
  });
}
function buildTwoLines(parts) {
  let chordLine = '', plain = 0, lyric = '', chordPlain = 0;
  for (const p of parts) {
    const m = p.match(/^\[([^\]]+)\]$/);
    if (m) {
      const c = isChordToken(m[1]) ? tc(m[1]) : m[1];
      if (chordPlain < plain) { chordLine += ' '.repeat(plain - chordPlain); chordPlain = plain; }
      else if (chordPlain > 0 && chordPlain >= plain) { chordLine += ' '; chordPlain++; }
      chordLine += chordSpan(c);
      chordPlain += c.length;
    } else { lyric += p; plain += p.length; }
  }
  return chordLine + '\n' + esc(lyric);
}
const renderBody = (text, raw) => raw ? renderRaw(text) : renderBracket(text);

// ---- Görünümler ----
let wakeLock = null;
async function setWake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* desteklenmiyorsa sessizce geç */ }
}
document.addEventListener('visibilitychange', () => { if (view === 'viewView' && !document.hidden) setWake(true); });

function show(v) {
  view = v;
  for (const id of ['listView', 'setView', 'viewView', 'editView']) $(id).hidden = id !== v;
  $('backBtn').hidden = v === 'listView';
  if (v !== 'viewView') { stopScroll(); metroStop(); setWake(false); if (stage) exitStage(); }
  else setWake(true);
  window.scrollTo(0, 0);
}

function renderList() {
  activeSet = null; setPos = -1;
  $('songsBar').hidden = tab !== 'songs';
  $('setsBar').hidden = tab !== 'sets';
  $('songList').hidden = tab !== 'songs';
  $('setList').hidden = tab !== 'sets';
  $('tabSongs').classList.toggle('active', tab === 'songs');
  $('tabSets').classList.toggle('active', tab === 'sets');
  if (tab === 'songs') {
    const q = $('search').value.toLowerCase();
    $('songList').innerHTML = '';
    songs.filter(s => ((s.title || '') + (s.artist || '')).toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, 'tr'))
      .forEach(s => {
        const li = document.createElement('li');
        li.innerHTML = `${esc(s.title)}<small>${esc(s.artist || '')}</small>`;
        li.onclick = () => { activeSet = null; setPos = -1; openSong(s.id); };
        $('songList').appendChild(li);
      });
  } else {
    $('setList').innerHTML = '';
    if (!setlists.length) $('setList').innerHTML = '<li style="cursor:default;opacity:.7">Henüz setlist yok.</li>';
    [...setlists].sort((a, b) => a.name.localeCompare(b.name, 'tr')).forEach(sl => {
      const li = document.createElement('li');
      li.innerHTML = `${esc(sl.name)}<small>${sl.songIds.length} şarkı</small>`;
      li.onclick = () => openSet(sl.id);
      $('setList').appendChild(li);
    });
  }
  $('title').textContent = 'Akor Defteri';
  show('listView');
}

function openSong(id) {
  const s = songById(id);
  if (!s) return renderList();
  current = s; transpose = 0;
  draw(); show('viewView');
  $('title').textContent = current.title;
  $('bpmInput').value = metro.setBpm(current.bpm || 100);
  updateSetNav();
}

function draw() {
  const first = findFirstChord(current.body);
  spell = transpose && first ? keyPrefersFlats(first, transpose) : false;
  const units = renderBody(current.body, current.raw);
  $('songBody').innerHTML = twoCol
    ? units.map(u => `<div class="u">${u || ' '}</div>`).join('')
    : units.join('\n');
  $('songBody').classList.toggle('cols', twoCol);
  document.body.classList.toggle('twocol', twoCol);
  $('colBtn').classList.toggle('on', twoCol);
  $('songBody').style.fontSize = (stage ? fontSize + 8 : fontSize) + 'px';
  $('trLabel').textContent = (transpose > 0 ? '+' : '') + transpose;
}

function stopScroll() { clearInterval(timer); timer = null; $('scrollBtn').textContent = '▶ Kaydır'; }

$('search').oninput = renderList;
$('tabSongs').onclick = () => { tab = 'songs'; renderList(); };
$('tabSets').onclick = () => { tab = 'sets'; renderList(); };
$('backBtn').onclick = () => {
  if (view === 'viewView') return activeSet ? openSet(activeSet.id) : renderList();
  if (view === 'editView') return current ? openSong(current.id) : renderList();
  renderList();
};
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
$('colBtn').onclick = () => {
  twoCol = !twoCol; localStorage.setItem('chord-cols', twoCol ? '1' : '0');
  draw();
};
$('editBtn').onclick = () => edit(current);
$('newBtn').onclick = () => edit(null);

// ---- Şarkı düzenleme ----
function edit(s) {
  current = s;
  $('eTitle').value = s ? s.title : '';
  $('eArtist').value = s ? s.artist : '';
  $('eBpm').value = s && s.bpm ? s.bpm : '';
  $('eBody').value = s ? s.body : '';
  $('eRaw').checked = s ? !!s.raw : true;
  $('deleteBtn').hidden = !s;
  show('editView');
}
$('saveBtn').onclick = () => {
  const title = $('eTitle').value.trim() || 'Adsız';
  const bpm = parseInt($('eBpm').value, 10);
  const data = { title, artist: $('eArtist').value.trim(), body: $('eBody').value, raw: $('eRaw').checked };
  if (current) current = songById(current.id) || current; // bulut eşitlemesi nesneyi yenilemiş olabilir
  if (bpm) data.bpm = bpm; else if (current) delete current.bpm;
  if (current) { Object.assign(current, data); if (!songById(current.id)) songs.push(current); }
  else { current = { id: uid(), ...data }; songs.push(current); }
  save(); cloud.pushSong(current); openSong(current.id);
};
$('deleteBtn').onclick = () => {
  if (!confirm('Silinsin mi?')) return;
  const id = current.id;
  songs = songs.filter(s => s.id !== id); save(); cloud.removeSong(id);
  // setlistlerden de çıkar
  setlists.forEach(sl => {
    if (sl.songIds.includes(id)) { sl.songIds = sl.songIds.filter(x => x !== id); cloud.pushSetlist(sl); }
  });
  saveSets(); current = null; renderList();
};

// ---- Setlist ----
function openSet(id) {
  activeSet = setlists.find(s => s.id === id);
  if (!activeSet) return renderList();
  setPos = -1;
  $('picker').hidden = true;
  renderSet(); show('setView');
}
function renderSet() {
  $('title').textContent = activeSet.name;
  // silinmiş şarkıları listeden temizle
  const ids = activeSet.songIds.filter(songById);
  if (ids.length !== activeSet.songIds.length) { activeSet.songIds = ids; commitSet(); }
  const ul = $('setSongs'); ul.innerHTML = '';
  if (!ids.length) ul.innerHTML = '<li style="cursor:default;opacity:.7">Bu setlist boş. "+ Şarkı ekle" ile şarkı ekle.</li>';
  ids.forEach((sid, i) => {
    const s = songById(sid);
    const li = document.createElement('li'); li.className = 'setitem';
    li.innerHTML = `<span class="num">${i + 1}.</span><span class="name">${esc(s.title)}<small>${esc(s.artist || '')}</small></span>`;
    const mk = (label, fn, dis) => {
      const b = document.createElement('button'); b.textContent = label; b.disabled = !!dis;
      b.onclick = e => { e.stopPropagation(); fn(); }; li.appendChild(b);
    };
    mk('▲', () => moveInSet(i, -1), i === 0);
    mk('▼', () => moveInSet(i, 1), i === ids.length - 1);
    mk('✕', () => { activeSet.songIds.splice(i, 1); commitSet(); renderSet(); });
    li.onclick = () => { setPos = i; openSong(sid); };
    ul.appendChild(li);
  });
  if (!$('picker').hidden) renderPicker();
}
function commitSet() { saveSets(); cloud.pushSetlist(activeSet); }
function moveInSet(i, d) {
  const a = activeSet.songIds; [a[i], a[i + d]] = [a[i + d], a[i]];
  commitSet(); renderSet();
}
function renderPicker() {
  const q = $('pickSearch').value.toLowerCase();
  const ul = $('pickList'); ul.innerHTML = '';
  songs.filter(s => !activeSet.songIds.includes(s.id) && ((s.title || '') + (s.artist || '')).toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title, 'tr'))
    .forEach(s => {
      const li = document.createElement('li');
      li.innerHTML = `+ ${esc(s.title)}<small>${esc(s.artist || '')}</small>`;
      li.onclick = () => { activeSet.songIds.push(s.id); commitSet(); renderSet(); };
      ul.appendChild(li);
    });
}
$('newSetBtn').onclick = () => {
  const name = (prompt('Setlist adı:') || '').trim();
  if (!name) return;
  const sl = { id: uid(), name, songIds: [] };
  setlists.push(sl); saveSets(); cloud.pushSetlist(sl); openSet(sl.id);
};
$('setAdd').onclick = () => { $('picker').hidden = !$('picker').hidden; if (!$('picker').hidden) { $('pickSearch').value = ''; renderPicker(); } };
$('pickSearch').oninput = renderPicker;
$('setRename').onclick = () => {
  const name = (prompt('Yeni ad:', activeSet.name) || '').trim();
  if (name) { activeSet.name = name; commitSet(); renderSet(); }
};
$('setDelete').onclick = () => {
  if (!confirm('Setlist silinsin mi? (Şarkılar silinmez)')) return;
  const id = activeSet.id;
  setlists = setlists.filter(s => s.id !== id); saveSets(); cloud.removeSetlist(id); renderList();
};
$('setStart').onclick = () => {
  if (activeSet.songIds.length) { setPos = 0; openSong(activeSet.songIds[0]); }
};
function updateSetNav() {
  const on = activeSet && setPos >= 0;
  $('setNav').hidden = !on;
  if (!on) return;
  $('setPos').textContent = `${setPos + 1} / ${activeSet.songIds.length}`;
  $('setPrev').disabled = setPos <= 0;
  $('setNext').disabled = setPos >= activeSet.songIds.length - 1;
}
function gotoSet(d) {
  if (!activeSet || setPos < 0) return;
  const p = setPos + d;
  if (p < 0 || p >= activeSet.songIds.length) return;
  setPos = p; openSong(activeSet.songIds[p]);
}
$('setPrev').onclick = () => gotoSet(-1);
$('setNext').onclick = () => gotoSet(1);
document.addEventListener('keydown', e => {
  if (view !== 'viewView' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight') gotoSet(1);
  if (e.key === 'ArrowLeft') gotoSet(-1);
});

// ---- Sahne modu ----
let stage = false;
function enterStage() {
  stage = true; document.body.classList.add('stage');
  $('stageBtn').textContent = 'Çık'; $('stageExit').hidden = false;
  if (fontSize < 20) fontSize = 20; // sahnede daha büyük başla
  draw(); window.scrollTo(0, 0);
  try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch { /* yok say */ }
}
function exitStage() {
  stage = false; document.body.classList.remove('stage');
  $('stageBtn').textContent = 'Sahne'; $('stageExit').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (current && view === 'viewView') draw();
}
$('stageBtn').onclick = () => (stage ? exitStage() : enterStage());
$('stageExit').onclick = exitStage;
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && stage) exitStage(); });
// Sahnede sağa/sola kaydırarak setlistte şarkı değiştir
let touchX = 0, touchY = 0;
document.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; }, { passive: true });
document.addEventListener('touchend', e => {
  if (!stage || view !== 'viewView') return;
  const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) > 90 && Math.abs(dy) < 60) gotoSet(dx < 0 ? 1 : -1);
}, { passive: true });

// ---- Metronom ----
const metro = createMetronome();
let bpmSaveTimer = null;
function renderDots() {
  const n = parseInt($('beatsSel').value, 10);
  $('beatDots').innerHTML = Array.from({ length: n }, (_, i) => `<span class="dot${i === 0 ? ' accent' : ''}"></span>`).join('');
}
function metroStop() {
  if (!metro.isRunning()) return;
  metro.stop(); $('metroPlay').textContent = '▶';
  $('beatDots').querySelectorAll('.dot').forEach(d => d.classList.remove('on'));
}
metro.onBeat = i => {
  const dots = $('beatDots').children;
  [...dots].forEach((d, k) => d.classList.toggle('on', k === i));
};
function setBpm(v) {
  const b = metro.setBpm(v); $('bpmInput').value = b;
  if (current) { // şarkıya kaydet (kısa gecikmeyle)
    current.bpm = b; clearTimeout(bpmSaveTimer);
    bpmSaveTimer = setTimeout(() => { save(); cloud.pushSong(current); }, 800);
  }
}
$('metroBtn').onclick = () => {
  $('metroPanel').hidden = !$('metroPanel').hidden;
  if ($('metroPanel').hidden) metroStop(); else renderDots();
};
$('metroPlay').onclick = () => { $('metroPlay').textContent = metro.toggle() ? '■' : '▶'; if (!metro.isRunning()) metroStop(); };
$('bpmDown').onclick = () => setBpm(metro.getBpm() - 1);
$('bpmUp').onclick = () => setBpm(metro.getBpm() + 1);
$('bpmInput').onchange = () => setBpm(parseInt($('bpmInput').value, 10));
$('tapBtn').onclick = () => { const b = metro.tap(); if (b) setBpm(b); };
$('beatsSel').onchange = () => { metro.setBeats(parseInt($('beatsSel').value, 10)); renderDots(); };
renderDots();

// ---- Yedek: dışa/içe aktarma ----
$('exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, songs, setlists }, null, 2)], { type: 'application/json' }));
  a.download = 'akor-defteri-yedek.json'; a.click();
};
$('importFile').onchange = async e => {
  const files = [...e.target.files]; if (!files.length) return;
  let added = 0;
  try {
    for (const f of files) {
      const text = await f.text();
      if (/\.json$/i.test(f.name)) { // yedek dosyası (eski biçim: sadece şarkı dizisi)
        const data = JSON.parse(text);
        const list = Array.isArray(data) ? data : (data.songs || []);
        list.forEach(s => { addSong({ ...s, id: s.id || uid() }); added++; });
        (data.setlists || []).forEach(sl => {
          const i = setlists.findIndex(x => x.id === sl.id);
          if (i >= 0) setlists[i] = sl; else setlists.push(sl);
          cloud.pushSetlist(sl);
        });
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
    save(); saveSets(); renderList();
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
