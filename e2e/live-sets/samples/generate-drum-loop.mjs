#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Renders drum-loop-1bar.wav, the e2e suites' long audio fixture: one bar of
// 4/4 at the test Set's tempo, so a clip covering the whole sample is exactly
// one bar and bar-aligned assertions come out as round numbers.
//
// The sample.aiff fixture beside it is ~1.09 s — under one bar at 108 BPM — so
// every audio region an e2e test can build from it is shorter than a bar. This
// one exists to reach past that: multi-bar regions, arrangement tiling, and
// anything that has to cross a bar line.
//
// Regenerating overwrites the committed file. The frame count is asserted, so
// changing BPM or sample rate to a combination that doesn't divide evenly fails
// loudly rather than shifting every expectation in the suites by a fraction.
//
// The DSP follows the ableton-audio-generator example skill
// (examples/skills/ableton-audio-generator), whose lib writes the WAV.
//
// Usage: node e2e/live-sets/samples/generate-drum-loop.mjs

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  declick,
  normalize,
  writeWav,
} from "../../../examples/skills/ableton-audio-generator/lib/audio-io.mjs";

const SR = 44100;
const BPM = 108; // the e2e-test-set tempo
const BEATS_PER_BAR = 4;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "drum-loop-1bar.wav");

const secondsPerBeat = 60 / BPM;
const frames = (SR * BEATS_PER_BAR * 60) / BPM;

if (!Number.isInteger(frames)) {
  throw new RangeError(
    `${BEATS_PER_BAR} beats at ${BPM} BPM is ${frames} frames at ${SR} Hz — not a whole number, so the loop would not be exactly one bar`,
  );
}

const sec = (s) => Math.floor(SR * s);
const env = (i, n, k) => Math.exp((-k * i) / n);
const noise = () => Math.random() * 2 - 1;

/**
 * One-pole lowpass holding its own state.
 * @param coef - Smoothing coefficient, 0-1
 * @returns A function filtering one sample at a time
 */
function lowpass(coef) {
  let z = 0;

  return (x) => (z += coef * (x - z));
}

/**
 * One-pole highpass holding its own state.
 * @param coef - Smoothing coefficient, 0-1
 * @returns A function filtering one sample at a time
 */
function highpass(coef) {
  const lp = lowpass(coef);

  return (x) => x - lp(x);
}

/**
 * Kick: a sine with a fast downward pitch sweep, plus a short noise click.
 * @returns The rendered voice
 */
function kick() {
  const n = sec(0.34);
  const out = new Float32Array(n);
  const clickLen = sec(0.004);
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const f = 48 + (128 - 48) * Math.exp((-9 * i) / n);

    phase += (2 * Math.PI * f) / SR;

    let s = Math.sin(phase) * env(i, n, 5);

    if (i < clickLen) s += 0.5 * (1 - i / clickLen) * noise();

    out[i] = s;
  }

  return normalize(out, 0.95);
}

/**
 * Snare: two detuned sine bodies under a highpassed noise buzz.
 * @returns The rendered voice
 */
function snare() {
  const n = sec(0.2);
  const out = new Float32Array(n);
  const hp = highpass(0.7);

  for (let i = 0; i < n; i++) {
    const body =
      (Math.sin((2 * Math.PI * 185 * i) / SR) * 0.6 +
        Math.sin((2 * Math.PI * 292 * i) / SR) * 0.4) *
      env(i, n, 13);

    out[i] = 0.35 * body + 0.65 * (hp(noise()) * env(i, n, 9));
  }

  return normalize(out, 0.8);
}

/**
 * Closed hat: short highpassed noise with an inharmonic metallic ring.
 * @returns The rendered voice
 */
function hat() {
  const n = sec(0.045);
  const out = new Float32Array(n);
  const hp = highpass(0.9);
  const partials = [3140, 4230, 5510, 6900];

  for (let i = 0; i < n; i++) {
    let s = hp(noise());
    let metal = 0;

    for (const f of partials) {
      metal += Math.sign(Math.sin((2 * Math.PI * f * i) / SR));
    }

    out[i] = hp(s * 0.6 + (metal / partials.length) * 0.4) * env(i, n, 22);
  }

  return normalize(out, 0.45);
}

// Sixteenth-note grid: a plain backbeat, so a listener can hear at a glance
// where in the bar a clip's region starts.
const STEPS_PER_BAR = 16;
const PATTERN = [
  { voice: kick(), steps: [0, 6, 10], gain: 1 },
  { voice: snare(), steps: [4, 12], gain: 0.9 },
  { voice: hat(), steps: [0, 2, 4, 6, 8, 10, 12, 14], gain: 0.55 },
];

const mix = new Float32Array(frames);
const framesPerStep = (SR * secondsPerBeat * BEATS_PER_BAR) / STEPS_PER_BAR;

for (const { voice, steps, gain } of PATTERN) {
  for (const step of steps) {
    const offset = Math.round(step * framesPerStep);

    // Voices are free to ring past the bar line; the loop is one bar, so the
    // tail is cut rather than wrapped.
    for (let i = 0; i < voice.length && offset + i < frames; i++) {
      mix[offset + i] += voice[i] * gain;
    }
  }
}

writeWav(OUT, declick(normalize(mix, 0.89), SR), SR, { format: "int16" });

console.log(
  `${OUT}\n${frames} frames @ ${SR} Hz = ${BEATS_PER_BAR} beats at ${BPM} BPM (${(frames / SR).toFixed(4)} s)`,
);
