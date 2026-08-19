// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Network deadlines. They live here, apart from the transports that use them,
// so tests can `vi.mock` this module down to a few ms instead of waiting out the
// real deadline.

// Typed `number`, not the inferred literal, so a test mock can supply its own.

/**
 * Deadline for one ~/.producer-pal collection request — the list read and every
 * write (save, rename, delete). Long enough that a slow local disk never trips
 * it, short enough that a request the local server accepts and never answers
 * can't wedge whoever is waiting on it: the memory editor holds autosave off
 * across a rename until the write settles, and the collection screens sit on
 * "Loading…" until the list read does.
 */
export const COLLECTION_REQUEST_TIMEOUT_MS: number = 10_000;
