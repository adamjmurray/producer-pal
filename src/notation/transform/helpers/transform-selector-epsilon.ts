// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Float tolerance shared by every transform selection mechanism — the time/
// pitch range selectors (noteInTimeRange) and where() predicate comparisons
// (compareValues). Note positions and durations produced by note-ops
// (ratchet/split via `start + k*duration`) and the literals they are compared
// against (bar|beat bounds via barBeatToMusicalBeats, note values via the
// note-value evaluator) reach the same musical beat through different float
// arithmetic, so equal values can differ by a few ULPs (~1e-15). Without
// tolerance an exact comparison drops a note that names the boundary, and a
// note on the shared boundary of two adjacent half-open buckets lands in the
// wrong one. 1e-9 swamps the ULP error yet sits far below any musical distance
// — the same magnitude note-ops uses for grid cuts (GRID_EPSILON).
export const SELECTOR_EPSILON = 1e-9;
