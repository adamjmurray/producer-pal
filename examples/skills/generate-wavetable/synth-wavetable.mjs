#!/usr/bin/env node

// synth-wavetable.mjs — generate a multi-frame wavetable .wav using ONLY Node
// built-ins (no npm). Load it into Ableton's Wavetable instrument by dragging
// the file onto an oscillator. See SKILL.md.
//
// Usage:
//   node synth-wavetable.mjs [--out <dir>] [--type saw|square|pwm|fold|formant]
//                            [--frames 16] [--frame-size 2048] [--sr 48000]
//
// A wavetable is a series of equal-length single-cycle waveforms ("frames")
// concatenated into one file. The instrument sweeps through them via the
// "position" control, so the frames should morph smoothly from first to last.
// Writes one .wav and prints a short summary on stderr + the file path on stdout.

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
// All three numbers here size buffers or fill a uint32 WAV header field, so
// each is a bounded whole number: a fractional count is an invalid typed-array
// length, and an absurd one allocates until the script hangs. isInteger also
// rejects NaN/Infinity.
const int = (name, def, min, max) => {
  const raw = opt(name, def);
  const v = Number(raw);
  if (!Number.isInteger(v) || v < min || v > max)
    fail(`${name} must be a whole number from ${min} to ${max}, got "${raw}"`);
  return v;
};

const OUT = resolve(opt("--out", "./wavetables"));
const TYPE = opt("--type", "saw");
const FRAMES = int("--frames", 16, 1, 1024);
const FRAME = int("--frame-size", 2048, 4, 16384); // samples per single cycle
const SR = int("--sr", 48000, 8000, 192000);

mkdirSync(OUT, { recursive: true });

const TWO_PI = 2 * Math.PI;

// ---------- frame generators ----------
// Each returns one FRAME-length cycle for morph position m in [0, 1].

// Sine -> saw: grow the harmonic series, each harmonic at 1/h (saw spectrum).
function saw(m) {
  const out = new Float32Array(FRAME);
  const nH = 1 + Math.round(m * 63);
  for (let n = 0; n < FRAME; n++) {
    let s = 0;
    for (let h = 1; h <= nH; h++) {
      const amp = h === 1 ? 1 : m / h;
      s += amp * Math.sin((TWO_PI * h * n) / FRAME);
    }
    out[n] = s;
  }
  return out;
}

// Sine -> square: odd harmonics only, at 1/h.
function square(m) {
  const out = new Float32Array(FRAME);
  const nH = 1 + Math.round(m * 63);
  for (let n = 0; n < FRAME; n++) {
    let s = 0;
    for (let h = 1; h <= nH; h += 2) {
      const amp = h === 1 ? 1 : m / h;
      s += amp * Math.sin((TWO_PI * h * n) / FRAME);
    }
    out[n] = s;
  }
  return out;
}

// Pulse with duty cycle sweeping 50% -> ~4% across the table.
function pwm(m) {
  const out = new Float32Array(FRAME);
  const duty = 0.5 - m * 0.46;
  for (let n = 0; n < FRAME; n++) out[n] = n / FRAME < duty ? 1 : -1;
  return out;
}

// Wavefolder: sine driven into a sine-fold; drive grows with m.
function fold(m) {
  const out = new Float32Array(FRAME);
  const drive = 1 + m * 5;
  for (let n = 0; n < FRAME; n++) {
    const s = Math.sin((TWO_PI * n) / FRAME);
    out[n] = Math.sin((Math.PI / 2) * drive * s);
  }
  return out;
}

// Formant: three gaussian spectral peaks whose centers glide across the table
// (a vowel-ish morph), summed as harmonics.
function formant(m) {
  const out = new Float32Array(FRAME);
  const centers = [3 + m * 6, 8 + m * 10, 14 + m * 18];
  const widths = [2, 3, 4];
  for (let n = 0; n < FRAME; n++) {
    let s = 0;
    for (let h = 1; h <= 48; h++) {
      let amp = 0;
      for (let p = 0; p < centers.length; p++) {
        const d = (h - centers[p]) / widths[p];
        amp += Math.exp(-0.5 * d * d) / (p + 1);
      }
      s += (amp / h) * Math.sin((TWO_PI * h * n) / FRAME);
    }
    out[n] = s;
  }
  return out;
}

const GENERATORS = { saw, square, pwm, fold, formant };
const gen = GENERATORS[TYPE];
if (!gen) {
  process.stderr.write(
    `Unknown --type "${TYPE}". Options: ${Object.keys(GENERATORS).join(", ")}\n`,
  );
  process.exit(1);
}

// ---------- build + normalize the whole table ----------
const table = new Float32Array(FRAME * FRAMES);
for (let f = 0; f < FRAMES; f++) {
  const m = FRAMES === 1 ? 0 : f / (FRAMES - 1);
  table.set(gen(m), f * FRAME);
}
let peak = 0;
for (const v of table) peak = Math.max(peak, Math.abs(v));
if (peak > 0)
  for (let i = 0; i < table.length; i++) table[i] = (table[i] / peak) * 0.98;

// ---------- WAV (32-bit float mono; preserves waveform detail) ----------
function wavFloat32(mono) {
  const n = mono.length;
  const b = Buffer.alloc(44 + n * 4);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 4, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20); // IEEE float
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(32, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    b.writeFloatLE(mono[i], o);
    o += 4;
  }
  return b;
}

const file = resolve(OUT, `wavetable-${TYPE}.wav`);
writeFileSync(file, wavFloat32(table));
process.stderr.write(
  `Wrote ${TYPE} wavetable: ${FRAMES} frames x ${FRAME} = ${table.length} samples, ` +
    `mono ${SR}Hz float32\n`,
);
process.stdout.write(file + "\n");
