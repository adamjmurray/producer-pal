#!/usr/bin/env node

// example-wavetable.mjs — REFERENCE, NOT A DEFAULT.
//
// Shows the wavetable format contract in working form: frames of exactly
// FRAME samples, concatenated with no padding, normalized once across the whole
// table, and never declicked. The five morphs here are demonstrations of
// technique — write a morph for the sound you were asked for instead.
//
// Usage:
//   node examples/example-wavetable.mjs [--out <dir>] [--type saw]
//                                       [--frames 16] [--frame-size 1024]

import { resolve } from "node:path";
import { normalize, writeWav } from "../lib/audio-io.mjs";
import { parseArgs } from "../lib/cli.mjs";

const { opt, int, fail } = parseArgs();
const OUT = resolve(opt("--out", "./wavetables"));
const TYPE = opt("--type", "saw");
const FRAMES = int("--frames", 16, 1, 1024);
const FRAME = int("--frame-size", 1024, 4, 16384); // what Wavetable slices at
const SR = int("--sr", 48000, 8000, 192000);

const TWO_PI = 2 * Math.PI;

// ---------- frame generators ----------
// Each returns one FRAME-length cycle for morph position m in [0, 1].
// Harmonic counts are capped: an unbounded harmonic series aliases on playback.

// Sine -> saw: grow the harmonic series, each harmonic at 1/h.
function saw(m) {
  const out = new Float32Array(FRAME);
  const nH = 1 + Math.round(m * 63);

  for (let n = 0; n < FRAME; n++) {
    let s = 0;

    for (let h = 1; h <= nH; h++) {
      s += (h === 1 ? 1 : m / h) * Math.sin((TWO_PI * h * n) / FRAME);
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
      s += (h === 1 ? 1 : m / h) * Math.sin((TWO_PI * h * n) / FRAME);
    }

    out[n] = s;
  }

  return out;
}

// Pulse with duty cycle sweeping 50% -> ~4% across the table. Not band-limited:
// a naive hard edge, included to show what the additive builders avoid.
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
    out[n] = Math.sin((Math.PI / 2) * drive * Math.sin((TWO_PI * n) / FRAME));
  }

  return out;
}

// Formant: three gaussian spectral peaks gliding across the table (a vowel-ish
// morph), summed as harmonics.
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

if (!gen)
  fail(
    `Unknown --type "${TYPE}". Options: ${Object.keys(GENERATORS).join(", ")}`,
  );

// Build every frame into one contiguous table, then normalize ONCE across the
// whole thing so the amplitude contour of the sweep survives. No declick.
const table = new Float32Array(FRAME * FRAMES);

for (let f = 0; f < FRAMES; f++) {
  table.set(gen(FRAMES === 1 ? 0 : f / (FRAMES - 1)), f * FRAME);
}

normalize(table, 0.98);

const file = writeWav(resolve(OUT, `wavetable-${TYPE}.wav`), table, SR);

process.stderr.write(
  `Wrote ${TYPE} wavetable: ${FRAMES} frames x ${FRAME} = ${table.length} samples, ` +
    `mono ${SR}Hz float32. Drop on a Wavetable oscillator and turn Raw on.\n`,
);
process.stdout.write(`${file}\n`);
