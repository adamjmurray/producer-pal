#!/usr/bin/env node

// audio-io.mjs — WAV encoding plus the two safety passes every generated sample
// needs. Node 18+ built-ins only, no npm.
//
// This is the part of an audio generator you should NOT write yourself. Wrong
// WAV headers and missing declicks fail *silently*: the file loads, it just
// sounds wrong or drifts out of sync. Everything upstream of this file — the
// oscillators, envelopes, filters, the actual sound — is yours to invent for
// the request in front of you.
//
// Verify the encoder on any machine:  node lib/audio-io.mjs --selftest

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const FMT_PCM = 1;
const FMT_IEEE_FLOAT = 3;

/**
 * Encode channels as a RIFF/WAVE buffer.
 *
 * `int16` writes a classic 44-byte PCM header. `float32` writes 58 bytes: the
 * spec requires non-PCM formats to carry `cbSize` in an 18-byte `fmt ` chunk
 * and to declare their frame count in a `fact` chunk. Ableton tolerates the
 * short form, but other hosts and analyzers are stricter.
 *
 * @param {Float32Array|number[]|Array<Float32Array|number[]>} input mono buffer,
 *   or an array of equal-length channel buffers (2 = stereo, interleaved on write)
 * @param {number} sampleRate whole Hz
 * @param {{format?: "float32"|"int16"}} [options] float32 preserves headroom and
 *   detail; int16 is maximally compatible and is what Simpler/Drum Rack want
 * @returns {Buffer} complete .wav file contents
 */
export function encodeWav(input, sampleRate, { format = "float32" } = {}) {
  const channels = toChannels(input);
  const frames = channels[0].length;

  for (const ch of channels) {
    if (ch.length !== frames) {
      throw new RangeError("every channel must be the same length");
    }
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError(
      `sampleRate must be a positive integer (got ${sampleRate})`,
    );
  }
  if (format !== "float32" && format !== "int16") {
    throw new TypeError(
      `unknown format "${format}" (expected float32 or int16)`,
    );
  }

  const float = format === "float32";
  const bytesPerSample = float ? 4 : 2;
  const blockAlign = channels.length * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const headerBytes = float ? 58 : 44;
  const b = Buffer.alloc(headerBytes + dataBytes);

  b.write("RIFF", 0);
  b.writeUInt32LE(headerBytes - 8 + dataBytes, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(float ? 18 : 16, 16);
  b.writeUInt16LE(float ? FMT_IEEE_FLOAT : FMT_PCM, 20);
  b.writeUInt16LE(channels.length, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * blockAlign, 28);
  b.writeUInt16LE(blockAlign, 32);
  b.writeUInt16LE(bytesPerSample * 8, 34);

  let o = 36;

  if (float) {
    b.writeUInt16LE(0, o); // cbSize: no extra format bytes follow
    o += 2;
    b.write("fact", o);
    b.writeUInt32LE(4, o + 4);
    b.writeUInt32LE(frames, o + 8); // sample frames per channel
    o += 12;
  }

  b.write("data", o);
  b.writeUInt32LE(dataBytes, o + 4);
  o += 8;

  for (let i = 0; i < frames; i++) {
    for (const ch of channels) {
      if (float) {
        b.writeFloatLE(ch[i], o);
        o += 4;
      } else {
        b.writeInt16LE(Math.round(clamp(ch[i]) * 32767), o);
        o += 2;
      }
    }
  }

  return b;
}

/**
 * Encode and write a .wav, creating parent directories as needed.
 * @param {string} filePath absolute path to write
 * @param {Float32Array|number[]|Array<Float32Array|number[]>} input channel data
 * @param {number} sampleRate whole Hz
 * @param {{format?: "float32"|"int16"}} [options] passed to encodeWav
 * @returns {string} the path written, so callers can print or collect it
 */
export function writeWav(filePath, input, sampleRate, options) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, encodeWav(input, sampleRate, options));

  return filePath;
}

/**
 * Scale to a target peak using ONE gain across all channels. Per-channel
 * normalization would flatten the level differences that make a stereo image,
 * so don't do that to an IR or any decorrelated pair. Mutates in place.
 * @param {Float32Array|number[]|Array<Float32Array|number[]>} input channel data
 * @param {number} [peak] target absolute peak, a little under 1 for headroom
 * @returns {*} the same input, mutated
 */
export function normalize(input, peak = 0.98) {
  const channels = toChannels(input);
  let max = 0;

  for (const ch of channels) {
    for (const v of ch) {
      const a = Math.abs(v);

      if (a > max) max = a;
    }
  }

  if (max === 0) return input; // silence stays silence rather than becoming NaN

  const gain = peak / max;

  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) ch[i] *= gain;
  }

  return input;
}

/**
 * Taper the edges so the buffer starts and ends at zero. A one-shot that stops
 * mid-waveform clicks on every trigger, which is easy to mistake for a broken
 * algorithm. Mutates in place.
 *
 * Defaults to fade-OUT only: a fade-in would soften the transient that makes a
 * kick or a rim read as percussive. Pass `fadeIn` for sustained material that
 * starts mid-cycle. Do NOT use this on wavetable frames — they are cyclic and a
 * taper corrupts the waveform.
 *
 * @param {Float32Array|number[]|Array<Float32Array|number[]>} input channel data
 * @param {number} sampleRate whole Hz, to convert the fade times
 * @param {{fadeIn?: number, fadeOut?: number}} [options] fade lengths in seconds
 * @returns {*} the same input, mutated
 */
export function declick(
  input,
  sampleRate,
  { fadeIn = 0, fadeOut = 0.005 } = {},
) {
  const channels = toChannels(input);
  const frames = channels[0].length;
  const half = Math.floor(frames / 2); // keep the two ramps from overlapping
  const nIn = Math.min(half, Math.round(fadeIn * sampleRate));
  const nOut = Math.min(half, Math.round(fadeOut * sampleRate));

  for (const ch of channels) {
    for (let i = 0; i < nIn; i++) ch[i] *= i / nIn;
    for (let i = 0; i < nOut; i++) ch[frames - 1 - i] *= i / nOut;
  }

  return input;
}

const clamp = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);

/**
 * Accept a bare mono buffer or an array of channel buffers, always return an
 * array of channels, so callers can write `writeWav(f, mono, SR)`.
 * @param {*} input mono buffer or array of channel buffers
 * @returns {Array<Float32Array|number[]>} channel list
 */
function toChannels(input) {
  if (ArrayBuffer.isView(input)) return [input];
  if (!Array.isArray(input) || input.length === 0) {
    throw new TypeError(
      "expected a channel buffer or a non-empty array of them",
    );
  }
  if (typeof input[0] === "number") return [input];

  return input;
}

/**
 * Walk the chunks of an encoded buffer. Used by the self-test; also handy if
 * you want to prove to yourself that what you just wrote is well-formed.
 * @param {Buffer} b a complete .wav buffer
 * @returns {{chunks: Array<{id: string, size: number, offset: number}>, format: number, channels: number, sampleRate: number, bits: number, factFrames: number|null, dataBytes: number, endsAtEof: boolean}} parsed structure
 */
function parseWav(b) {
  const chunks = [];
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let factFrames = null;
  let dataBytes = 0;
  let o = 12;

  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4);
    const size = b.readUInt32LE(o + 4);

    chunks.push({ id, size, offset: o });

    if (id === "fmt ") {
      format = b.readUInt16LE(o + 8);
      channels = b.readUInt16LE(o + 10);
      sampleRate = b.readUInt32LE(o + 12);
      bits = b.readUInt16LE(o + 22);
    }
    if (id === "fact") factFrames = b.readUInt32LE(o + 8);
    if (id === "data") dataBytes = size;

    o += 8 + size + (size % 2);
  }

  return {
    chunks,
    format,
    channels,
    sampleRate,
    bits,
    factFrames,
    dataBytes,
    endsAtEof: o === b.length,
  };
}

/**
 * Round-trip the encoder and assert the structural invariants that fail
 * silently in real hosts. Exits non-zero on the first failure.
 * @returns {void}
 */
function selfTest() {
  const checks = [];
  const check = (label, ok) => checks.push({ label, ok });

  const mono = Float32Array.from(
    { length: 100 },
    (_, i) => Math.sin(i / 5) * 0.5,
  );
  const stereo = [mono, Float32Array.from(mono, (v) => -v)];

  const f32 = parseWav(encodeWav(mono, 48000));

  check("float32 declares IEEE float", f32.format === FMT_IEEE_FLOAT);
  check(
    "float32 has a fact chunk",
    f32.chunks.some((c) => c.id === "fact"),
  );
  check("float32 fact frames match", f32.factFrames === 100);
  check("float32 fmt carries cbSize", f32.chunks[0].size === 18);
  check("float32 chunks end at EOF", f32.endsAtEof);

  const i16 = parseWav(encodeWav(stereo, 44100, { format: "int16" }));

  check("int16 declares PCM", i16.format === FMT_PCM);
  check("int16 omits fact", !i16.chunks.some((c) => c.id === "fact"));
  check(
    "int16 is stereo interleaved",
    i16.channels === 2 && i16.dataBytes === 400,
  );
  check("int16 chunks end at EOF", i16.endsAtEof);

  // Rounding, not truncation: 0.5 * 32767 = 16383.5 must land on 16384.
  const rounded = encodeWav(Float32Array.of(0.5), 44100, { format: "int16" });

  check("int16 rounds to nearest", rounded.readInt16LE(44) === 16384);

  // Clipping is clamped rather than wrapping to the opposite polarity.
  const hot = encodeWav(Float32Array.of(2), 44100, { format: "int16" });

  check("int16 clamps overs", hot.readInt16LE(44) === 32767);

  const peaked = normalize(Float32Array.of(0.1, -0.2), 0.98);

  check("normalize hits the target peak", Math.abs(peaked[1] + 0.98) < 1e-6);
  check(
    "normalize keeps silence silent",
    normalize(Float32Array.of(0, 0))[0] === 0,
  );

  const faded = declick(
    Float32Array.from({ length: 100 }, () => 1),
    1000,
    {
      fadeOut: 0.01,
    },
  );

  check("declick ends at zero", faded[99] === 0);
  check("declick leaves the attack alone", faded[0] === 1);

  const failures = checks.filter((c) => !c.ok);

  for (const c of checks)
    process.stdout.write(`${c.ok ? "ok  " : "FAIL"} ${c.label}\n`);
  process.stdout.write(
    `\n${checks.length - failures.length}/${checks.length} passed\n`,
  );

  if (failures.length > 0) process.exit(1);
}

if (process.argv.includes("--selftest")) selfTest();
