// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  decodeFeatureVector,
  euclideanDistance,
} from "../../query/feature-vectors.ts";

/**
 * Build an fe_values BLOB, overriding header fields / total length to model
 * malformed rows. Defaults produce a valid 268-byte vector.
 *
 * @param floats - Feature values to encode
 * @param opts - Header/length overrides
 * @param opts.version - Header version tag (default 18)
 * @param opts.count - Header float count (default 64)
 * @param opts.totalBytes - Total BLOB length (default 268)
 * @returns The encoded BLOB
 */
function blob(
  floats: number[],
  opts: { version?: number; count?: number; totalBytes?: number } = {},
): Uint8Array {
  const { version = 18, count = 64, totalBytes = 268 } = opts;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  view.setUint32(0, version, true);
  view.setUint32(4, count, true);
  view.setUint32(8, 0, true);

  for (let i = 0; i < floats.length && 12 + i * 4 + 4 <= totalBytes; i += 1) {
    view.setFloat32(12 + i * 4, floats[i] ?? 0, true);
  }

  return new Uint8Array(buffer);
}

/** 64 quarter-integer values (exactly representable as float32). */
const sample = Array.from({ length: 64 }, (_, i) => i * 0.25 - 8);

describe("decodeFeatureVector", () => {
  it("decodes a valid 268-byte BLOB into 64 float32s (exact round-trip)", () => {
    const vector = decodeFeatureVector(blob(sample));

    expect(vector?.length).toBe(64);
    expect(Array.from(vector ?? [])).toStrictEqual(sample);
  });

  it("decodes from a non-4-aligned byteOffset (Buffer pooling safety)", () => {
    const src = blob(sample);
    const padded = new Uint8Array(src.length + 3);

    padded.set(src, 3);

    // subarray keeps the same backing buffer at byteOffset 3 (not 4-aligned).
    const vector = decodeFeatureVector(padded.subarray(3));

    expect(Array.from(vector ?? [])).toStrictEqual(sample);
  });

  it("returns null for the wrong byte length", () => {
    expect(decodeFeatureVector(blob(sample, { totalBytes: 200 }))).toBeNull();
  });

  it("returns null for a NULL BLOB (does not throw — one bad row can't collapse the whole call)", () => {
    expect(decodeFeatureVector(null)).toBeNull();
  });

  it("returns null for an unknown version tag", () => {
    expect(decodeFeatureVector(blob(sample, { version: 99 }))).toBeNull();
  });

  it("returns null for an unexpected float count", () => {
    expect(decodeFeatureVector(blob(sample, { count: 32 }))).toBeNull();
  });
});

describe("euclideanDistance", () => {
  it("computes the straight-line distance", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([4, 6]);

    expect(euclideanDistance(a, b)).toBeCloseTo(5, 6);
  });

  it("is 0 for identical vectors", () => {
    const a = new Float32Array([1, 2, 3]);

    expect(euclideanDistance(a, a)).toBe(0);
  });

  it("only compares up to the shorter vector's length", () => {
    // A read past the shorter array would be undefined and turn the sum into NaN.
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0, 999]);

    expect(euclideanDistance(a, b)).toBe(0);
  });
});
