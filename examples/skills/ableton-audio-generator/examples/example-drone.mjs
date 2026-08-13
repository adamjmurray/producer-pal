#!/usr/bin/env node

// example-drone.mjs — REFERENCE, NOT A DEFAULT.
//
// The open-ended case: sustained stereo material with no format contract beyond
// "a valid .wav". Shows where the interest actually comes from — slow
// independent modulation per partial, per-channel decorrelation, and fades long
// enough to be musical. Swap the partial set and the modulation for whatever
// the request calls for.
//
// Usage:
//   node examples/example-drone.mjs [--out <dir>] [--len 20] [--root 55]
//                                   [--partials 8] [--drift 0.4]

import { resolve } from "node:path";
import { declick, normalize, writeWav } from "../lib/audio-io.mjs";
import { parseArgs } from "../lib/cli.mjs";

const { opt, num, int } = parseArgs();
const OUT = resolve(opt("--out", "./drones"));
const LEN = num("--len", 20, 0.5, 600); // seconds
const ROOT = num("--root", 55, 20, 2000); // Hz; 55 = A1
const PARTIALS = int("--partials", 8, 1, 64);
const DRIFT = num("--drift", 0.4, 0, 1); // depth of the slow amplitude motion
const SR = int("--sr", 48000, 8000, 192000);

const N = Math.floor(LEN * SR);
const TWO_PI = 2 * Math.PI;

/**
 * Build one partial's parameters. Rates are deliberately irrational multiples
 * of each other so no two partials ever line up — that non-repetition is what
 * separates a living drone from a static chord.
 * @param {number} h harmonic number, 1-based
 * @param {number} channel 0 or 1; shifts the modulation phases for width
 * @returns {{freq: number, amp: number, rate: number, phase: number}} partial
 */
function partial(h, channel) {
  // A few cents of detune per partial, alternating direction, so neighbours
  // beat against each other instead of summing into one rigid tone.
  const cents = ((h % 3) - 1) * 4;

  return {
    freq: ROOT * h * Math.pow(2, cents / 1200),
    amp: 1 / (h * h ** 0.3), // steeper than 1/h: keeps the top from glaring
    rate: 0.017 * h * Math.SQRT2 + 0.011 * (h % 5),
    phase: channel * 1.7 + h * 0.31 * Math.PI,
  };
}

/**
 * Render one channel by summing modulated partials.
 * @param {number} channel 0 or 1
 * @returns {Float32Array} the channel buffer
 */
function renderChannel(channel) {
  const out = new Float32Array(N);
  const parts = Array.from({ length: PARTIALS }, (_, i) =>
    partial(i + 1, channel),
  );

  for (const p of parts) {
    const step = (TWO_PI * p.freq) / SR;
    const lfoStep = (TWO_PI * p.rate) / SR;

    for (let i = 0; i < N; i++) {
      // Amplitude breathes between (1 - DRIFT) and 1 at its own slow rate.
      const lfo = 1 - DRIFT * 0.5 * (1 - Math.cos(lfoStep * i + p.phase));

      out[i] += Math.sin(step * i) * p.amp * lfo;
    }
  }

  return out;
}

const stereo = [renderChannel(0), renderChannel(1)];

normalize(stereo, 0.9);
// Sustained material starts and ends mid-cycle, so unlike a one-shot this wants
// a fade at BOTH ends — and long enough here to be part of the sound.
declick(stereo, SR, {
  fadeIn: Math.min(2, LEN / 4),
  fadeOut: Math.min(4, LEN / 3),
});

const file = writeWav(
  resolve(OUT, `drone-${Math.round(ROOT)}hz-${LEN}s.wav`),
  stereo,
  SR,
);

process.stderr.write(
  `Wrote drone: ${LEN}s stereo ${SR}Hz float32 ` +
    `(root ${ROOT}Hz, ${PARTIALS} partials, drift ${DRIFT})\n`,
);
process.stdout.write(`${file}\n`);
