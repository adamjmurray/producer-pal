// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Check if a request's deadline has passed. The deadline is an absolute
 * timestamp the request must finish by (ToolContext.deadline).
 * @param deadline - Absolute deadline timestamp, or null for none
 * @returns true if the deadline has passed, false if null or not yet reached
 */
export function isDeadlineExceeded(deadline: number | null): boolean {
  if (deadline == null) {
    return false;
  }

  return Date.now() >= deadline;
}
