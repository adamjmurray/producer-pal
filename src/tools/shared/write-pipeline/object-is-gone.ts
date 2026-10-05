// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Whether an object a call is holding has been destroyed since it was
 * resolved. Read the path, never `exists()`: a held object keeps reporting its
 * id after its target dies, and only the path clears
 * (dev/live-api/object-reuse.md). A moved object keeps a rewritten path.
 * @param object - The object the call is holding
 * @returns True when it is gone
 */
export function objectIsGone(object: LiveAPI): boolean {
  return !object.path;
}
