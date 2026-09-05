// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Gemini voice resume limits. They live here, apart from the session helpers
// that use them, so tests can `vi.mock` this module down to a few ms instead of
// waiting out the real backoff.

// Typed `number`, not the inferred literal, so a test mock can supply its own.

/** Max consecutive failed resume attempts before we give up. */
export const MAX_RESUME_ATTEMPTS: number = 3;

/** Linear backoff base between resume attempts (attempt N waits N * this). */
export const RESUME_BACKOFF_MS: number = 1000;
