// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Decode and compare Live's `fe_values` audio feature vectors.
 *
 * Each `fe_values.data` BLOB is 268 bytes: a 12-byte header
 * `[uint32 version=18][uint32 floatCount=64][uint32 reserved=0]` followed by
 * `floatCount` little-endian float32s. The vectors are NOT unit-normalized
 * (norms ~3.9–16.4), and the length carries meaning: Euclidean distance
 * reproduces Live's Show Similar Files order, cosine doesn't.
 *
 * Format reverse-engineered in the spike
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
 * Decode a feature-vector BLOB into its 64 float32s, or null when the BLOB is
 * NULL/absent, isn't the expected length, or its header version/float-count
 * don't match. Returning null (rather than throwing) lets callers skip an
 * unknown or empty row instead of failing the whole request — a single NULL
 * `fe_values.data` row must not collapse the entire findSimilar/findDuplicates
 * call into `dbAvailable:false`.
 *
 * @param data - Raw `fe_values.data` BLOB (node:sqlite returns BLOBs as Uint8Array; NULL → null)
 * @returns The 64-float vector, or null if absent/undecodable
 */
export function decodeFeatureVector(
  data: Uint8Array | null,
): Float32Array | null {
  if (data?.byteLength !== EXPECTED_BYTES) {
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
  // Float32Array reads in the platform's native byte order; the BLOB stores the
  // floats little-endian (the header above is decoded LE). Every platform Live
  // and Node run on is little-endian, so this matches. On a big-endian host the
  // payload would need a per-float DataView.getFloat32(.., true) read instead.
  const payload = data.buffer.slice(
    data.byteOffset + HEADER_BYTES,
    data.byteOffset + EXPECTED_BYTES,
  );

  return new Float32Array(payload);
}

/**
 * Euclidean (L2) distance between two equal-length vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns The distance (0 = identical)
 */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const n = Math.min(a.length, b.length);

  for (let i = 0; i < n; i += 1) {
    // i < n ≤ both lengths, so both reads are defined.
    const d = (a[i] as number) - (b[i] as number);

    sum += d * d;
  }

  return Math.sqrt(sum);
}
