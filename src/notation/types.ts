// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Shared type definitions for notation modules.
 */

/** Note event produced by the interpreter */
export interface NoteEvent {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  probability?: number;
  velocity_deviation?: number;
}

/** Note with bar copy metadata for copy/paste operations */
export interface BarCopyNote extends NoteEvent {
  relativeTime: number;
  originalBar: number;
}
