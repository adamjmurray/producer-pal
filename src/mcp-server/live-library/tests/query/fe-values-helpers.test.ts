// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  decodeFeatureVector,
  vectorNorm,
} from "../../query/fe-values-helpers.ts";

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

describe("vectorNorm", () => {
  it("computes the Euclidean norm", () => {
    const v = new Float32Array(64);

    v[0] = 3;
    v[1] = 4;

    expect(vectorNorm(v)).toBeCloseTo(5, 5);
  });

  it("is 0 for the all-zero vector", () => {
    expect(vectorNorm(new Float32Array(64))).toBe(0);
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for parallel vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([2, 4, 6]);

    expect(cosineSimilarity(a, b, vectorNorm(a), vectorNorm(b))).toBeCloseTo(
      1,
      6,
    );
  });

  it("is 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);

    expect(cosineSimilarity(a, b, vectorNorm(a), vectorNorm(b))).toBeCloseTo(
      0,
      6,
    );
  });

  it("is -1 for opposite vectors", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([-1, -2]);

    expect(cosineSimilarity(a, b, vectorNorm(a), vectorNorm(b))).toBeCloseTo(
      -1,
      6,
    );
  });

  it("returns 0 when either norm is 0 (degenerate vector)", () => {
    const a = new Float32Array([1, 1]);

    expect(cosineSimilarity(a, a, 0, vectorNorm(a))).toBe(0);
    expect(cosineSimilarity(a, a, vectorNorm(a), 0)).toBe(0);
  });

  it("bounds the dot product by the shorter vector (no read past the end)", () => {
    // The loop runs to `Math.min(a.length, b.length)`, never the max — a read
    // past the shorter array would be `undefined`, poisoning the dot product to
    // NaN. Feed mismatched lengths (the extra `b` component is ignored, not
    // multiplied by a missing `a` component).
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0, 999]);

    const sim = cosineSimilarity(a, b, vectorNorm(a), vectorNorm(b));

    expect(Number.isNaN(sim)).toBe(false);
    // dot = 1*1 + 0*0 = 1; norms = 1 and sqrt(1+0+999^2).
    expect(sim).toBeCloseTo(1 / Math.sqrt(1 + 999 * 999), 6);
  });
});
