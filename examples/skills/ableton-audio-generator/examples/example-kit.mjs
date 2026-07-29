#!/usr/bin/env node

// example-kit.mjs — REFERENCE, NOT A DEFAULT.
//
// A complete drum-kit generator, here to show the shape of one: voice
// functions, a pad map, and the stdout contract that pipes straight into
// ppal-create-device. Read it for idiom, then write voices for the kit you were
// actually asked for. Running this unmodified produces a generic kit that
// sounds like nobody's request.
//
// Usage:
//   node examples/example-kit.mjs [--out <dir>] [--sr 44100] [--track t0]
//
// Writes one .wav per voice and prints a ppal-create-device arguments object on
// stdout. Status goes to stderr so stdout stays pipeable JSON.

import { resolve } from "node:path";
import { declick, normalize, writeWav } from "../lib/audio-io.mjs";
import { parseArgs } from "../lib/cli.mjs";

const { opt, int } = parseArgs();
const OUT = resolve(opt("--out", "./drum-kit"));
const SR = int("--sr", 44100, 8000, 192000);
const TRACK = opt("--track", "t0"); // insertion path; must be a MIDI track

// ---------- the DSP you'd replace ----------
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

// Normalize to a per-voice ceiling, then taper the tail. No fade-in: the attack
// transient is the character of a percussive sound.
const finish = (buf, peak = 0.9) => declick(normalize(buf, peak), SR);

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
  const out = new Float32Array(N);
  const clickLen = sec(0.004);
  let ph = 0;

  for (let i = 0; i < N; i++) {
    const f = f1 + (f0 - f1) * Math.exp((-pitchK * i) / N);

    ph += (2 * Math.PI * f) / SR;

    let s = Math.sin(ph) * env(i, N, ampK);

    if (i < clickLen) s += click * (1 - i / clickLen) * noise();

    out[i] = s;
  }

  return finish(out);
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
  const out = new Float32Array(N);
  const hp = highpass(0.7);

  for (let i = 0; i < N; i++) {
    const body =
      (Math.sin((2 * Math.PI * tone * i) / SR) * 0.6 +
        Math.sin((2 * Math.PI * tone * 1.58 * i) / SR) * 0.4) *
      env(i, N, ampK);

    out[i] = (1 - mix) * body + mix * (hp(noise()) * env(i, N, noiseK));
  }

  return finish(out);
}

// Hat: highpassed noise, optionally with inharmonic squares for a metallic
// ring. Short len = closed; long len + low ampK = open.
function hat({ len = 0.05, ampK = 22, hpCoef = 0.9, metallic = true } = {}) {
  const N = sec(len);
  const out = new Float32Array(N);
  const hp = highpass(hpCoef);
  const partials = [3140, 4230, 5510, 6900];

  for (let i = 0; i < N; i++) {
    let s = hp(noise());

    if (metallic) {
      let m = 0;

      for (const f of partials)
        m += Math.sign(Math.sin((2 * Math.PI * f * i) / SR));

      s = hp(s * 0.6 + (m / partials.length) * 0.4);
    }

    out[i] = s * env(i, N, ampK);
  }

  return finish(out);
}

// Clap: a few tightly-spaced noise bursts + a short diffuse tail.
function clap({ len = 0.2, bursts = [0, 0.01, 0.02, 0.03] } = {}) {
  const N = sec(len);
  const out = new Float32Array(N);
  const hp = highpass(0.75);

  for (let i = 0; i < N; i++) {
    let s = 0;

    for (const b of bursts) {
      const bi = i - sec(b);

      if (bi >= 0) s += hp(noise()) * Math.exp((-40 * bi) / SR);
    }

    out[i] = s + hp(noise()) * env(i, N, 7) * 0.35;
  }

  return finish(out);
}

// Tom: like a kick but higher, gentler sweep, no click.
function tom({ len = 0.32, f0 = 180, f1 = 90, pitchK = 6, ampK = 6 } = {}) {
  const N = sec(len);
  const out = new Float32Array(N);
  let ph = 0;

  for (let i = 0; i < N; i++) {
    const f = f1 + (f0 - f1) * Math.exp((-pitchK * i) / N);

    ph += (2 * Math.PI * f) / SR;
    out[i] = Math.sin(ph) * env(i, N, ampK);
  }

  return finish(out);
}

// Rim / side-stick: a very short tone + noise transient.
function rim({ len = 0.04, tone = 440, ampK = 30 } = {}) {
  const N = sec(len);
  const out = new Float32Array(N);
  const hp = highpass(0.6);

  for (let i = 0; i < N; i++) {
    out[i] =
      (Math.sin((2 * Math.PI * tone * i) / SR) * 0.5 + hp(noise()) * 0.5) *
      env(i, N, ampK);
  }

  return finish(out);
}

// ---------- kit layout (Ableton note names; C1 = MIDI 36) ----------
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

const params = KIT.map(([note, name, buf]) => ({
  name: `p${note}/d0/sample`,
  value: writeWav(resolve(OUT, `${name}.wav`), buf, SR, { format: "int16" }),
}));

process.stderr.write(`Wrote ${KIT.length} samples to ${OUT}\n`);
process.stdout.write(
  `${JSON.stringify({ deviceName: "Drum Rack", path: TRACK, params }, null, 2)}\n`,
);
