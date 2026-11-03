// Akor ayrıştırıcı: akorları tanır, transpoze eder, ton'a göre diyez/bemol seçer.
// Saf fonksiyonlardan oluşur (DOM'a dokunmaz), bu yüzden ayrıca test edilebilir.

const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const ROOT = '[A-G][#b♯♭]?';
// Kökten sonra gelebilecek parçalar: maj7, m, dim, sus4, add9, 7, b5, #9, (b9), +, °, ø ...
const SUFFIX = '(?:maj|min|mi|dim|aug|sus|add|alt|omit|m|M|\\+|°|ø|-|\\d+|[#b♯♭]\\d+|\\([^)]*\\))*';
const CHORD_RE = new RegExp(`^(${ROOT})(${SUFFIX})(?:/(${ROOT}))?$`);
// Akor satırlarında akor olmayan ama "yok sayılabilir" işaretler: | || x2 (x2) - ...
const IGNORABLE_RE = /^(?:\|{1,2}|\(?x\d+\)?|\(?\d+x\)?|[-–—]|\.{2,}|…|\/|N\.?C\.?)$/i;

const normAcc = s => s.replace('♯', '#').replace('♭', 'b');

// "C#m7/G#" -> { root: 1, suffix: 'm7', bass: 8 } ; akor değilse null
export function parseChord(token) {
  const m = CHORD_RE.exec(token.trim());
  if (!m) return null;
  return { root: noteToIdx(m[1]), suffix: m[2], bass: m[3] ? noteToIdx(m[3]) : null };
}

function noteToIdx(note) {
  const n = normAcc(note);
  let i = NOTE_IDX[n[0]];
  if (n[1] === '#') i++;
  else if (n[1] === 'b') i--;
  return (i + 12) % 12;
}

export const isChordToken = t => CHORD_RE.test(t.trim());
export const isIgnorableToken = t => IGNORABLE_RE.test(t.trim());

// Satırdaki tüm kelimeler akor (ya da yok sayılabilir işaret) ve en az biri gerçek akor ise true
export function isChordLine(line) {
  const toks = line.trim().split(/\s+/);
  if (line.trim() === '') return false;
  let chords = 0;
  for (const t of toks) {
    if (isChordToken(t)) chords++;
    else if (!isIgnorableToken(t)) return false;
  }
  return chords > 0;
}

// Ton'a göre bemol mu diyez mi kullanılacağı (ör. F, Bb, Eb, Dm, Gm -> bemol)
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1]);
const FLAT_MINOR = new Set([2, 7, 0, 5, 10]);
export function keyPrefersFlats(firstChord, n = 0) {
  const p = firstChord && parseChord(firstChord);
  if (!p) return false;
  const key = (p.root + n + 120) % 12;
  const minor = /^(?:m(?!aj)|min|mi|-)/.test(p.suffix);
  return (minor ? FLAT_MINOR : FLAT_MAJOR).has(key);
}

// token'ı n yarım ton kaydırır. flats=true ise bemollü, değilse diyezli yazar.
export function transposeChord(token, n, flats = false) {
  const p = parseChord(token);
  if (!p || n % 12 === 0) return token;
  const names = flats ? FLAT : SHARP;
  const name = i => names[((i + n) % 12 + 12) % 12];
  return name(p.root) + p.suffix + (p.bass === null ? '' : '/' + name(p.bass));
}

// Metindeki ilk akoru bulur: önce [Am] biçimine, yoksa akor satırlarına bakar.
export function findFirstChord(text) {
  for (const line of text.split('\n')) {
    for (const m of line.matchAll(/\[([^\]]+)\]/g)) if (isChordToken(m[1])) return m[1];
    if (isChordLine(line)) return line.trim().split(/\s+/).find(isChordToken);
  }
  return null;
}
