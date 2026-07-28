#!/usr/bin/env node

// synth-drums.mjs — synthesize a kit of one-shot drum .wav files using ONLY
// Node built-ins (no npm). Pair with Producer Pal's ppal-create-device to build
// a playable Drum Rack in Ableton Live. See SKILL.md.
//
// Usage:
//   node synth-drums.mjs [--out <dir>] [--sr 44100] [--track t0]
//
// Writes one .wav per voice into <dir> and prints, on stdout, a ready-to-use
// ppal-create-device arguments object mapping each drum-rack pad to its sample.
// Status messages go to stderr so stdout stays clean JSON you can pipe.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const fail = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
};
// A flag with no value (last token, or followed by another --flag) is a
// malformed invocation, not a request for the default. Say so instead of
// handing back undefined — a NaN --sr writes header-only, silent .wav files.
const opt = (name, def) => {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = argv[i + 1];
  if (v == null || v.startsWith("--")) fail(`Missing value for ${name}`);
  return v;
};
// Range-checked because the sample rate is load-bearing: it's a uint32 WAV
// header field, and it scales every buffer. Too low and voices round down to
// zero samples (silent files); absurdly high and the script allocates until it
// hangs. isInteger also rejects NaN/Infinity.
const int = (name, def, min, max) => {
  const raw = opt(name, def);
  const v = Number(raw);
  if (!Number.isInteger(v) || v < min || v > max)
    fail(`${name} must be a whole number from ${min} to ${max}, got "${raw}"`);
  return v;
};

const OUT = resolve(opt("--out", "./drum-kit"));
const SR = int("--sr", 44100, 8000, 192000);
const TRACK = opt("--track", "t0"); // create-device insertion path (a MIDI track)

mkdirSync(OUT, { recursive: true });

// ---------- tiny DSP toolkit (plain Math) ----------
const clamp = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);
const sec = (s) => Math.floor(SR * s);
const env = (i, n, k) => Math.exp((-k * i) / n); // exponential decay 1 -> ~0
const noise = () => Math.random() * 2 - 1;

// One-pole filters as closures holding their own state.
const lowpass = (coef) => {
  let z = 0;
  return (x) => (z += coef * (x - z));
};
const highpass = (coef) => {
  const lp = lowpass(coef);
  return (x) => x - lp(x);
};

// Normalize to a target peak, then apply a ~5 ms fade-out so the tail never
// clicks. Mutates and returns the buffer.
function finish(buf, peak = 0.9) {
  let mx = 0;
  for (const v of buf) mx = Math.max(mx, Math.abs(v));
  const g = mx > 0 ? peak / mx : 1;
  const fade = Math.min(buf.length, sec(0.005));
  for (let i = 0; i < buf.length; i++) {
    let s = buf[i] * g;
    const tail = buf.length - i;
    if (tail < fade) s *= tail / fade;
    buf[i] = s;
  }
  return buf;
}

// 16-bit PCM mono WAV (maximally compatible; Live analyzes it on load).
function wav16(mono) {
  const n = mono.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    b.writeInt16LE((clamp(mono[i]) * 32767) | 0, o);
    o += 2;
  }
  return b;
}

// ---------- voices ----------
// Kick: sine with a fast downward pitch sweep + a short noise click.
function kick({
  len = 0.4,
  f0 = 130,
  f1 = 45,
  pitchK = 9,
  ampK = 5,
  click = 0.5,
} = {}) {
  const N = sec(len);
  const o = new Float32Array(N);
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const f = f1 + (f0 - f1) * Math.exp((-pitchK * i) / N);
    ph += (2 * Math.PI * f) / SR;
    let s = Math.sin(ph) * env(i, N, ampK);
    if (i < sec(0.004)) s += click * (1 - i / sec(0.004)) * noise();
    o[i] = s;
  }
  return finish(o);
}

// Snare: two detuned sine bodies + a highpassed noise "wire" buzz.
function snare({
  len = 0.22,
  tone = 185,
  ampK = 13,
  noiseK = 9,
  mix = 0.65,
} = {}) {
  const N = sec(len);
  const o = new Float32Array(N);
  const hp = highpass(0.7);
  for (let i = 0; i < N; i++) {
    const body =
      (Math.sin((2 * Math.PI * tone * i) / SR) * 0.6 +
        Math.sin((2 * Math.PI * tone * 1.58 * i) / SR) * 0.4) *
      env(i, N, ampK);
    const n = hp(noise()) * env(i, N, noiseK);
    o[i] = (1 - mix) * body + mix * n;
  }
  return finish(o);
}

// Hat: highpassed noise, optionally mixed with inharmonic square oscillators
// for a metallic ring. Short len = closed, long len + low ampK = open.
function hat({ len = 0.05, ampK = 22, hpCoef = 0.9, metallic = true } = {}) {
  const N = sec(len);
  const o = new Float32Array(N);
  const h = highpass(hpCoef);
  const fs = [3140, 4230, 5510, 6900];
  for (let i = 0; i < N; i++) {
    let s = h(noise());
    if (metallic) {
      let m = 0;
      for (const f of fs) m += Math.sign(Math.sin((2 * Math.PI * f * i) / SR));
      s = h(s * 0.6 + (m / fs.length) * 0.4);
    }
    o[i] = s * env(i, N, ampK);
  }
  return finish(o);
}

// Clap: a few tightly-spaced noise bursts + a short diffuse tail.
function clap({ len = 0.2 } = {}) {
  const N = sec(len);
  const o = new Float32Array(N);
  const hp = highpass(0.75);
  const bursts = [0, 0.01, 0.02, 0.03];
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (const b of bursts) {
      const bi = i - sec(b);
      if (bi >= 0) s += hp(noise()) * Math.exp((-40 * bi) / SR);
    }
    s += hp(noise()) * env(i, N, 7) * 0.35;
    o[i] = s;
  }
  return finish(o);
}

// Tom: like a kick but higher, gentler sweep, no click.
function tom({ len = 0.32, f0 = 180, f1 = 90, pitchK = 6, ampK = 6 } = {}) {
  const N = sec(len);
  const o = new Float32Array(N);
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const f = f1 + (f0 - f1) * Math.exp((-pitchK * i) / N);
    ph += (2 * Math.PI * f) / SR;
    o[i] = Math.sin(ph) * env(i, N, ampK);
  }
  return finish(o);
}

// Rim / side-stick: a very short tone + noise transient.
function rim({ len = 0.04, tone = 440, ampK = 30 } = {}) {
  const N = sec(len);
  const o = new Float32Array(N);
  const hp = highpass(0.6);
  for (let i = 0; i < N; i++) {
    o[i] =
      (Math.sin((2 * Math.PI * tone * i) / SR) * 0.5 + hp(noise()) * 0.5) *
      env(i, N, ampK);
  }
  return finish(o);
}

// ---------- kit layout (General MIDI note names; C1 = MIDI 36) ----------
// Each pad addresses its own auto-created Simpler at device slot d0.
const KIT = [
  ["C1", "kick", kick()],
  ["C#1", "rim", rim()],
  ["D1", "snare", snare()],
  ["D#1", "clap", clap()],
  ["F1", "tom-low", tom({ f0: 150, f1: 75 })],
  ["F#1", "hat-closed", hat({ len: 0.05 })],
  ["A1", "tom-high", tom({ f0: 240, f1: 130, len: 0.26 })],
  ["A#1", "hat-open", hat({ len: 0.4, ampK: 5 })],
];

const params = [];
for (const [note, name, buf] of KIT) {
  const file = resolve(OUT, `${name}.wav`);
  writeFileSync(file, wav16(buf));
  params.push({ name: `p${note}/d0/sample`, value: file });
}

process.stderr.write(`Wrote ${KIT.length} samples to ${OUT}\n`);
process.stdout.write(
  JSON.stringify({ deviceName: "Drum Rack", path: TRACK, params }, null, 2) +
    "\n",
);
