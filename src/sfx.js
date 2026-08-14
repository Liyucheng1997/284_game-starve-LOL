// 极简 WebAudio 合成音效(无需音频文件)
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, type = 'sine', vol = .18, slideTo = null, delay = 0) {
  try {
    const a = ac();
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
    o.connect(g).connect(a.destination);
    o.start(t0); o.stop(t0 + dur + .02);
  } catch (e) { /* 音频不可用时静默 */ }
}

function noise(dur, vol = .12, delay = 0) {
  try {
    const a = ac();
    const t0 = a.currentTime + delay;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.001, t0 + dur);
    src.connect(g).connect(a.destination);
    src.start(t0);
  } catch (e) {}
}

export const sfx = {
  swing() { noise(.09, .08); tone(300, .08, 'sawtooth', .05, 140); },
  hit() { tone(160, .09, 'square', .12, 90); noise(.06, .1); },
  crit() { tone(220, .12, 'square', .16, 100); tone(440, .1, 'sawtooth', .1, 220, .03); noise(.1, .14); },
  hurt() { tone(120, .22, 'sawtooth', .16, 60); noise(.12, .1); },
  fireball() { noise(.18, .1); tone(500, .22, 'sawtooth', .07, 120); },
  explode() { noise(.4, .22); tone(90, .35, 'sine', .2, 40); },
  frost() { tone(900, .25, 'sine', .1, 1400); tone(600, .3, 'triangle', .08, 900, .05); },
  blink() { tone(300, .18, 'sine', .12, 900); },
  dash() { noise(.16, .1); tone(200, .16, 'sine', .1, 500); },
  shield() { tone(200, .3, 'triangle', .12, 320); },
  levelup() { [440, 554, 659, 880].forEach((f, i) => tone(f, .22, 'triangle', .14, null, i * .09)); },
  pickup() { tone(700, .08, 'sine', .1, 1000); },
  gold() { tone(1100, .07, 'square', .07); tone(1500, .09, 'square', .06, null, .05); },
  potion() { tone(500, .12, 'sine', .1, 700); tone(700, .14, 'sine', .1, 900, .08); },
  open() { tone(180, .12, 'square', .09, 240); tone(320, .14, 'square', .07, 400, .1); },
  bad() { tone(220, .3, 'sawtooth', .14, 110); tone(160, .35, 'sawtooth', .12, 80, .12); },
  good() { [523, 659, 784].forEach((f, i) => tone(f, .18, 'triangle', .12, null, i * .07)); },
  howl() { tone(300, .6, 'sawtooth', .1, 500); tone(280, .7, 'sawtooth', .08, 460, .1); },
  boss() { tone(80, .8, 'sawtooth', .22, 50); tone(60, 1, 'square', .14, 40, .2); noise(.5, .12); },
  night() { tone(240, 1.2, 'sine', .08, 120); },
  dawn() { [330, 415, 494, 659].forEach((f, i) => tone(f, .4, 'sine', .07, null, i * .15)); },
};
