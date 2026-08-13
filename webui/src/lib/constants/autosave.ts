// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Autosave debounce windows. They live here, apart from the hooks that use
// them, so tests can `vi.mock` this module down to ~1ms instead of sleeping out
// the real delay on every autosave assertion.

// Typed `number`, not the inferred literal, so a test mock can supply its own.

/** Voice transcript autosave — debounced so we don't write IDB per token. */
export const VOICE_AUTOSAVE_DEBOUNCE_MS: number = 600;

/** Context editor (system prompt, project context) autosave. */
export const CONTEXT_EDITOR_SAVE_DEBOUNCE_MS: number = 800;

/** Doc collection (memories, skills) autosave. */
export const DOC_COLLECTION_AUTOSAVE_DEBOUNCE_MS: number = 800;
