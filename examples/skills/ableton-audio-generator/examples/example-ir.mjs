#!/usr/bin/env node

// example-ir.mjs — REFERENCE, NOT A DEFAULT.
//
// Shows the three-part anatomy of an impulse response — predelay, discrete
// early reflections, diffuse decaying tail — with genuinely decorrelated
// channels. The room it models is generic. Model the space you were asked for.
//
// Usage:
//   node examples/example-ir.mjs [--out <dir>] [--decay 1.8] [--predelay 20]
//                                [--size 1] [--tone 0.5] [--er 1]

import { resolve } from "node:path";
import { declick, normalize, writeWav } from "../lib/audio-io.mjs";
import { parseArgs } from "../lib/cli.mjs";

const { opt, num, int } = parseArgs();
const OUT = resolve(opt("--out", "./reverb-irs"));
const DECAY = num("--decay", 1.8, 0.01, 60); // tail length in seconds (RT60-ish)
const PREDELAY_MS = num("--predelay", 20, 0, 5000);
const SIZE = num("--size", 1, 0.01, 10); // stretches early-reflection spacing
const TONE = num("--tone", 0.5, 0, 1); // 0 = dark tail, 1 = bright
const ER = int("--er", 1, 0, 1); // include discrete early reflections
const SR = int("--sr", 48000, 8000, 192000);

const sec = (s) => Math.floor(SR * s);
const noise = () => Math.random() * 2 - 1;

// One-pole lowpass; coefficient from --tone. Each channel gets its own so the
// two tails filter independently — that independence is the stereo image.
const makeLP = () => {
  const coef = 0.02 + TONE * 0.9;
  let z = 0;

  return (x) => (z += coef * (x - z));
};

const tailLen = sec(DECAY);
const preLen = sec(PREDELAY_MS / 1000);
const N = preLen + tailLen;
const L = new Float32Array(N);
const R = new Float32Array(N);

// Diffuse tail: exponentially-decaying decorrelated noise. Independent noise
// per channel plus independent lowpasses gives a wide image that survives a
// mono fold-down.
const decayK = 6.9; // ~ -60 dB over the tail
const lpL = makeLP();
const lpR = makeLP();

for (let i = 0; i < tailLen; i++) {
  const amp = Math.exp((-decayK * i) / tailLen);

  L[preLen + i] = lpL(noise()) * amp;
  R[preLen + i] = lpR(noise()) * amp;
}

// Early reflections: a handful of decaying taps spaced by --size, offset
// slightly between channels for width. Layered on top of the tail.
if (ER) {
  const taps = [0.011, 0.019, 0.027, 0.038, 0.052, 0.071];

  for (const [k, t] of taps.entries()) {
    const g = 0.7 * Math.pow(0.72, k);
    const iL = preLen + sec(t * SIZE);
    const iR = preLen + sec(t * SIZE * 1.08);

    if (iL < N) L[iL] += g;
    if (iR < N) R[iR] += g;
  }
}

// One shared gain across both channels, then a generous tail fade so the IR
// never convolves a discontinuity into the signal.
const stereo = [L, R];

normalize(stereo, 0.95);
declick(stereo, SR, { fadeOut: 0.02 });

const name = `ir-decay${DECAY}s-size${SIZE}-tone${TONE}`.replaceAll(".", "_");
const file = writeWav(resolve(OUT, `${name}.wav`), stereo, SR);

process.stderr.write(
  `Wrote IR: ${(N / SR).toFixed(2)}s stereo ${SR}Hz float32 ` +
    `(decay ${DECAY}s, predelay ${PREDELAY_MS}ms, size ${SIZE}, tone ${TONE})\n`,
);
process.stdout.write(`${file}\n`);
