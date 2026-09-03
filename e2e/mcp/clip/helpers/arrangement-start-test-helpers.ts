// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** The `[song position]` an arrangement clip's path ends with. */
const ARRANGEMENT_COORDINATE = /\[([^\]]*)\]$/;

/**
 * Where an arrangement clip starts, read off the path it reports. A result
 * stops spelling that position twice, so the path is the only place it appears.
 * @param clip - A clip result carrying a path
 * @returns The bar|beat position, or undefined when the path carries none
 */
export function arrangementStartOf(
  clip: { path?: string } | undefined | null,
): string | undefined {
  return ARRANGEMENT_COORDINATE.exec(clip?.path ?? "")?.[1];
}
