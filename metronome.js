// Metronom: Web Audio ile, zamanlayıcıdan bağımsız hassas vuruş planlaması yapar.
export function createMetronome() {
  let ctx = null, timer = null, nextTime = 0, beat = 0;
  let bpm = 100, beatsPerBar = 4, running = false;
  let taps = [];
  const api = { onBeat: null };

  function click(time, accent) {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.6, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time); osc.stop(time + 0.06);
  }

  // 100 ms ilerisini planlar, 25 ms'de bir kontrol eder
  function schedule() {
    while (nextTime < ctx.currentTime + 0.1) {
      const idx = beat % beatsPerBar;
      click(nextTime, idx === 0);
      const delay = Math.max(0, (nextTime - ctx.currentTime) * 1000);
      setTimeout(() => running && api.onBeat && api.onBeat(idx), delay);
      nextTime += 60 / bpm;
      beat++;
    }
    timer = setTimeout(schedule, 25);
  }

  api.start = () => {
    if (running) return;
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    running = true; beat = 0; nextTime = ctx.currentTime + 0.05;
    schedule();
  };
  api.stop = () => { running = false; clearTimeout(timer); };
  api.toggle = () => { running ? api.stop() : api.start(); return running; };
  api.isRunning = () => running;
  api.setBpm = v => { bpm = Math.min(300, Math.max(30, Math.round(v) || bpm)); return bpm; };
  api.getBpm = () => bpm;
  api.setBeats = v => { beatsPerBar = v; beat = 0; };
  // Tempoyu vuruşlara dokunarak bul: son 6 vuruşun ortalaması, 2 sn ara verilirse sıfırlanır
  api.tap = () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-6);
    if (taps.length >= 2) {
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      return api.setBpm(60000 / avg);
    }
    return null;
  };
  return api;
}
