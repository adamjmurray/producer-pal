#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Renders the suites' bar-aligned audio fixtures, one per entry in TARGETS.
// Each is a plain 4/4 drum pattern at its Set's tempo, so a clip covering the
// whole sample is a whole number of bars and bar-aligned assertions come out as
// round numbers.
//
//   drum-loop-1bar.wav  1 bar  @ 108 BPM  - e2e-test-set
//   drum-loop-8bar.wav  8 bars @ 96 BPM   - arrangement-sections
//
// The sample.aiff fixture beside them is ~1.09 s — under one bar at either
// tempo — so every audio region built from it is shorter than a bar. The 1-bar
// file reaches past that to a single bar line; the 8-bar file reaches past THAT
// to regions that span bars, which is what splitting and cropping an audio clip
// need. It renders at half the sample rate because a warp fixture does not need
// the fidelity and the file is committed.
//
// Regenerating overwrites the committed files. Frame counts are asserted, so
// changing a BPM or sample rate to a combination that doesn't divide evenly
// fails loudly rather than shifting every expectation in the suites by a
// fraction.
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

const BEATS_PER_BAR = 4;
const STEPS_PER_BAR = 16;
const OUT_DIR = dirname(fileURLToPath(import.meta.url));

const TARGETS = [
  { file: "drum-loop-1bar.wav", bars: 1, bpm: 108, sampleRate: 44100 },
  { file: "drum-loop-8bar.wav", bars: 8, bpm: 96, sampleRate: 22050 },
];

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
 * @param sampleRate - Frames per second to render at
 * @returns The rendered voice
 */
function kick(sampleRate) {
  const n = Math.floor(sampleRate * 0.34);
  const out = new Float32Array(n);
  const clickLen = Math.floor(sampleRate * 0.004);
  let phase = 0;

  for (let i = 0; i < n; i++) {
    const f = 48 + (128 - 48) * Math.exp((-9 * i) / n);

    phase += (2 * Math.PI * f) / sampleRate;

    let s = Math.sin(phase) * env(i, n, 5);

    if (i < clickLen) s += 0.5 * (1 - i / clickLen) * noise();

    out[i] = s;
  }

  return normalize(out, 0.95);
}

/**
 * Snare: two detuned sine bodies under a highpassed noise buzz.
 * @param sampleRate - Frames per second to render at
 * @returns The rendered voice
 */
function snare(sampleRate) {
  const n = Math.floor(sampleRate * 0.2);
  const out = new Float32Array(n);
  const hp = highpass(0.7);

  for (let i = 0; i < n; i++) {
    const body =
      (Math.sin((2 * Math.PI * 185 * i) / sampleRate) * 0.6 +
        Math.sin((2 * Math.PI * 292 * i) / sampleRate) * 0.4) *
      env(i, n, 13);

    out[i] = 0.35 * body + 0.65 * (hp(noise()) * env(i, n, 9));
  }

  return normalize(out, 0.8);
}

/**
 * Closed hat: short highpassed noise with an inharmonic metallic ring.
 * @param sampleRate - Frames per second to render at
 * @returns The rendered voice
 */
function hat(sampleRate) {
  const n = Math.floor(sampleRate * 0.045);
  const out = new Float32Array(n);
  const hp = highpass(0.9);
  const partials = [3140, 4230, 5510, 6900];

  for (let i = 0; i < n; i++) {
    let s = hp(noise());
    let metal = 0;

    for (const f of partials) {
      metal += Math.sign(Math.sin((2 * Math.PI * f * i) / sampleRate));
    }

    out[i] = hp(s * 0.6 + (metal / partials.length) * 0.4) * env(i, n, 22);
  }

  return normalize(out, 0.45);
}

/**
 * Render one fixture and write it to disk.
 *
 * The same one-bar backbeat repeats for every bar, so a listener can hear at a
 * glance where in a bar a clip's region starts. Bars are deliberately identical
 * — nothing asserts on the audio content, and a uniform pattern is what Live's
 * auto-warp locks onto most reliably.
 *
 * @param target - The file name, bar count, tempo and sample rate to render
 * @returns The absolute path written and its frame count
 */
function render({ file, bars, bpm, sampleRate }) {
  const frames = (sampleRate * bars * BEATS_PER_BAR * 60) / bpm;

  if (!Number.isInteger(frames)) {
    throw new RangeError(
      `${bars} bar(s) at ${bpm} BPM is ${frames} frames at ${sampleRate} Hz — not a whole number, so the loop would not be a whole number of bars`,
    );
  }

  // Sixteenth-note grid: a plain backbeat.
  const pattern = [
    { voice: kick(sampleRate), steps: [0, 6, 10], gain: 1 },
    { voice: snare(sampleRate), steps: [4, 12], gain: 0.9 },
    { voice: hat(sampleRate), steps: [0, 2, 4, 6, 8, 10, 12, 14], gain: 0.55 },
  ];

  const mix = new Float32Array(frames);
  const framesPerStep =
    (sampleRate * BEATS_PER_BAR * 60) / (bpm * STEPS_PER_BAR);

  for (let bar = 0; bar < bars; bar++) {
    const barOffset = Math.round(bar * STEPS_PER_BAR * framesPerStep);

    for (const { voice, steps, gain } of pattern) {
      for (const step of steps) {
        const offset = barOffset + Math.round(step * framesPerStep);

        // Voices are free to ring past the loop end; the tail is cut rather
        // than wrapped.
        for (let i = 0; i < voice.length && offset + i < frames; i++) {
          mix[offset + i] += voice[i] * gain;
        }
      }
    }
  }

  const out = join(OUT_DIR, file);

  writeWav(out, declick(normalize(mix, 0.89), sampleRate), sampleRate, {
    format: "int16",
  });

  return { out, frames };
}

for (const target of TARGETS) {
  const { out, frames } = render(target);

  console.log(
    `${out}\n${frames} frames @ ${target.sampleRate} Hz = ${target.bars * BEATS_PER_BAR} beats at ${target.bpm} BPM (${(frames / target.sampleRate).toFixed(4)} s)`,
  );
}
