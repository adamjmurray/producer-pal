// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Decode and compare Live's `fe_values` audio feature vectors.
 *
 * Each `fe_values.data` BLOB is 268 bytes: a 12-byte header
 * `[uint32 version=18][uint32 floatCount=64][uint32 reserved=0]` followed by
 * `floatCount` little-endian float32s. The vectors are NOT unit-normalized
 * (norms ~3.9–16.4), so similarity is cosine — normalize at compare time.
 *
 * Format reverse-engineered in the AJM-331 spike
 * (scratchpad/Live-DB-Spike-Report.md): 100% uniform across 51,450 rows,
 * 0 bad/NaN/Inf; vectors encode real audio content and the sibling `hash`
 * column is a deterministic fingerprint of the vector.
 */

/** Feature-extractor format version this decoder understands. A future Live
 * could bump it; rows that don't match are skipped (version insurance) rather
 * than silently mis-decoded. */
export const FE_VALUES_VERSION = 18;

/** Float count in a feature vector. */
export const FE_VALUES_FLOAT_COUNT = 64;

const HEADER_BYTES = 12;
const EXPECTED_BYTES = HEADER_BYTES + FE_VALUES_FLOAT_COUNT * 4; // 268

/**
 * Decode a feature-vector BLOB into its 64 float32s, or null when the BLOB
 * isn't the expected length or its header version/float-count don't match.
 * Returning null (rather than throwing) lets callers skip an unknown future
 * format instead of failing the whole request.
 *
 * @param data - Raw `fe_values.data` BLOB (node:sqlite returns BLOBs as Uint8Array)
 * @returns The 64-float vector, or null if undecodable
 */
export function decodeFeatureVector(data: Uint8Array): Float32Array | null {
  if (data.byteLength !== EXPECTED_BYTES) {
    return null;
  }

  // DataView has no alignment constraint, so the header reads are safe even
  // when the BLOB's byteOffset isn't 4-aligned (Node pools Buffer storage).
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getUint32(0, true);
  const floatCount = view.getUint32(4, true);

  if (version !== FE_VALUES_VERSION || floatCount !== FE_VALUES_FLOAT_COUNT) {
    return null;
  }

  // ArrayBuffer.slice copies the 256 payload bytes into a fresh 0-offset
  // (4-aligned) buffer, so the Float32Array view is always valid regardless
  // of the source BLOB's byteOffset.
  const payload = data.buffer.slice(
    data.byteOffset + HEADER_BYTES,
    data.byteOffset + EXPECTED_BYTES,
  );

  return new Float32Array(payload);
}

/**
 * Euclidean (L2) norm of a vector. Precompute once per vector and pass into
 * `cosineSimilarity` so the seed's norm isn't recomputed per comparison.
 *
 * @param v - Vector
 * @returns The vector's magnitude (0 only for the all-zero vector)
 */
export function vectorNorm(v: Float32Array): number {
  let sum = 0;

  for (const x of v) {
    sum += x * x;
  }

  return Math.sqrt(sum);
}

/**
 * Cosine similarity of two equal-length vectors given their precomputed norms.
 * Returns 0 when either norm is 0 (a degenerate all-zero vector has no
 * direction to compare).
 *
 * @param a - First vector
 * @param b - Second vector
 * @param normA - Precomputed norm of `a`
 * @param normB - Precomputed norm of `b`
 * @returns Cosine similarity in [-1, 1] (1 = identical direction)
 */
export function cosineSimilarity(
  a: Float32Array,
  b: Float32Array,
  normA: number,
  normB: number,
): number {
  if (normA === 0 || normB === 0) {
    return 0;
  }

  let dot = 0;
  const n = Math.min(a.length, b.length);

  for (let i = 0; i < n; i += 1) {
    // i < n ≤ both lengths, so both reads are defined. The `as number` casts
    // satisfy noUncheckedIndexedAccess without a runtime guard (which would be
    // an unreachable branch).
    dot += (a[i] as number) * (b[i] as number);
  }

  return dot / (normA * normB);
}
