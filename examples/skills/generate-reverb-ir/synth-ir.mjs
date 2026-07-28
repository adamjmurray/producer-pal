#!/usr/bin/env node

// synth-ir.mjs — generate a stereo reverb impulse response (.wav) using ONLY
// Node built-ins (no npm). Load it into Ableton's Hybrid Reverb by dragging the
// file onto the device's IR display (it appears under the "User" IR category).
// See SKILL.md.
//
// Usage:
//   node synth-ir.mjs [--out <dir>] [--decay 1.8] [--predelay 20] [--size 1]
//                     [--tone 0.5] [--er 1] [--sr 48000]
//
//   --decay     RT60-ish tail length in seconds
//   --predelay  gap before the tail, in milliseconds
//   --size      stretches early-reflection spacing (bigger = larger room)
//   --tone      0..1 lowpass on the tail (0 = dark, 1 = bright)
//   --er        1 = include discrete early reflections, 0 = smooth tail only
//
// Writes one stereo .wav and prints a summary on stderr + the file path on stdout.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const fail = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
};
// A flag with no value (last token, or followed by another --flag) is a
// malformed invocation, not a request for the default. Say so instead of
// handing back undefined — a NaN --sr writes a header-only, silent .wav file.
const opt = (name, def) => {
  const i = argv.indexOf(name);
  if (i < 0) return def;
  const v = argv[i + 1];
  if (v == null || v.startsWith("--")) fail(`Missing value for ${name}`);
  return v;
};
// Every number here scales a buffer or a filter coefficient, so each carries
// its documented range: out-of-range values yield silence, noise, or (at the
// top end) allocate until the script hangs. isFinite also rejects NaN.
const num = (name, def, min, max) => {
  const raw = opt(name, def);
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min || v > max)
    fail(`${name} must be a number from ${min} to ${max}, got "${raw}"`);
  return v;
};
// The sample rate additionally fills a uint32 WAV header field, so it must be
// whole — a fractional rate is silently truncated in the header while the DSP
// runs at the untruncated value.
const int = (name, def, min, max) => {
  const v = num(name, def, min, max);
  if (!Number.isInteger(v)) fail(`${name} must be a whole number, got "${v}"`);
  return v;
};

const OUT = resolve(opt("--out", "./reverb-irs"));
const DECAY = num("--decay", 1.8, 0.01, 60);
const PREDELAY_MS = num("--predelay", 20, 0, 5000);
const SIZE = num("--size", 1, 0.01, 10);
const TONE = num("--tone", 0.5, 0, 1);
const ER = num("--er", 1, 0, 1);
const SR = int("--sr", 48000, 8000, 192000);

mkdirSync(OUT, { recursive: true });

const sec = (s) => Math.floor(SR * s);
const noise = () => Math.random() * 2 - 1;

// One-pole lowpass closure; coef derived from the --tone control.
const lpCoef = 0.02 + TONE * 0.5;
const makeLP = () => {
  let z = 0;
  return (x) => (z += lpCoef * (x - z));
};

// ---------- build the two channels ----------
const tailLen = sec(DECAY);
const preLen = sec(PREDELAY_MS / 1000);
const N = preLen + tailLen;
const L = new Float32Array(N);
const R = new Float32Array(N);

// Exponentially-decaying decorrelated noise (the diffuse tail). Independent
// noise per channel + independent lowpasses gives a wide stereo image.
const decayK = 6.9; // ~ -60 dB over the tail
const lpL = makeLP();
const lpR = makeLP();
for (let i = 0; i < tailLen; i++) {
  const env = Math.exp((-decayK * i) / tailLen);
  L[preLen + i] = lpL(noise()) * env;
  R[preLen + i] = lpR(noise()) * env;
}

// Discrete early reflections: a handful of decaying taps, spaced by --size,
// slightly offset between channels for width. Layered on top of the tail.
if (ER) {
  const taps = [0.011, 0.019, 0.027, 0.038, 0.052, 0.071];
  for (const [k, t] of taps.entries()) {
    const g = 0.7 * Math.pow(0.72, k);
    const iL = preLen + sec(t * SIZE);
    const iR = preLen + sec(t * SIZE * 1.08); // small inter-channel offset
    if (iL < N) L[iL] += g;
    if (iR < N) R[iR] += g;
  }
}

// Normalize to a safe peak and fade the very tail so it ends cleanly.
function finish(a, b) {
  let mx = 0;
  for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(a[i]), Math.abs(b[i]));
  const g = mx > 0 ? 0.95 / mx : 1;
  const fade = Math.min(N, sec(0.02));
  for (let i = 0; i < N; i++) {
    let f = 1;
    const tail = N - i;
    if (tail < fade) f = tail / fade;
    a[i] *= g * f;
    b[i] *= g * f;
  }
}
finish(L, R);

// ---------- WAV (32-bit float stereo, interleaved) ----------
function wavFloat32Stereo(l, r) {
  const n = l.length;
  const bytes = n * 2 * 4;
  const b = Buffer.alloc(44 + bytes);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + bytes, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20); // IEEE float
  b.writeUInt16LE(2, 22); // stereo
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2 * 4, 28);
  b.writeUInt16LE(2 * 4, 32);
  b.writeUInt16LE(32, 34);
  b.write("data", 36);
  b.writeUInt32LE(bytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    b.writeFloatLE(l[i], o);
    b.writeFloatLE(r[i], o + 4);
    o += 8;
  }
  return b;
}

const name = `ir-decay${DECAY}s-size${SIZE}-tone${TONE}`.replaceAll(".", "_");
const file = resolve(OUT, `${name}.wav`);
writeFileSync(file, wavFloat32Stereo(L, R));
process.stderr.write(
  `Wrote IR: ${(N / SR).toFixed(2)}s stereo ${SR}Hz float32 ` +
    `(decay ${DECAY}s, predelay ${PREDELAY_MS}ms, size ${SIZE}, tone ${TONE})\n`,
);
process.stdout.write(file + "\n");
