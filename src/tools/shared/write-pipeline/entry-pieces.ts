// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A target's write can answer with more than one entry: a clip cut in two comes
// back as both halves. The first is the target's own; the rest ride behind it.

const PIECES = Symbol("pieces");

/** A target's own entry, and the extra entries its write made. */
export interface WithPieces<E> {
  readonly [PIECES]: true;
  entry: E;
  pieces: E[];
}

/**
 * Answer a target's write with its own entry and extra ones.
 * @param entry - The target's own entry
 * @param pieces - The extra entries, which come right after it in the result
 * @returns What `write` returns
 */
export function withPieces<E>(entry: E, pieces: E[]): WithPieces<E> {
  return { [PIECES]: true, entry, pieces };
}

/**
 * Read what a write answered with.
 * @param written - A bare entry, or one made by {@link withPieces}
 * @returns The target's own entry and its extra ones
 */
export function entryAndPieces<E>(written: E | WithPieces<E>): {
  entry: E;
  pieces: E[];
} {
  return typeof written === "object" && written != null && PIECES in written
    ? { entry: written.entry, pieces: written.pieces }
    : { entry: written, pieces: [] };
}
