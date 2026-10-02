// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * How a shared arrangement step says what happened to one clip.
 *
 * Anything about a target belongs on that target's result entry, not in a
 * warning — but these steps run under whichever tool called them and don't own
 * the entries. So they report through here and the caller files it. Keyed by
 * the id the call found the clip at.
 */
export interface ClipReporter {
  /** Something landed on the clip, but not as the call asked. */
  note: (clipId: string, reason: string) => void;
  /** Nothing the call asked of this clip happened. */
  refuse: (clipId: string, reason: string) => void;
}
