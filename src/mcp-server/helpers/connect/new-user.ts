// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { CONTEXT_TOOL_ID } from "#src/shared/tool-groups.ts";
import { readGlobalContext } from "../global-context/global-context-store.ts";
import { listMemoryEntries } from "../memory/memory-store.ts";

// One answer for two readers: the connect result's "New user" marker and the
// Skills' New user paragraph (which keys on that marker). Both ask this
// function, so the marker can't appear without the paragraph, or the reverse.

/** The settings the new-user check depends on. */
export interface NewUserConfig {
  smallModelMode: boolean;
  /**
   * The tools this caller can call — the global whitelist, or one request's
   * narrowed set. Omitted ⇒ no gating.
   */
  tools?: readonly string[];
}

/**
 * Whether this is a user we have learned nothing about yet: no pinned global
 * context and no memories.
 *
 * Always false when nothing can record the outcome — small-model mode, whose
 * tool surface drops scope:memory, and a caller with no ppal-context at all.
 * Either way the assistant could neither save what it learned nor record a
 * decline, so it would re-ask on every connect forever.
 *
 * Project context is deliberately not consulted: it describes the Live Set, not
 * the person, and a user can have a project blob while still being a stranger.
 *
 * @param config - Current device settings
 * @returns True when the onboarding next step should be used
 */
export function isNewUser(config: NewUserConfig): boolean {
  if (config.smallModelMode) {
    return false;
  }

  if (!hasContextTool(config)) {
    return false;
  }

  if (readGlobalContext().trim()) {
    return false;
  }

  return listMemoryEntries().length === 0;
}

/**
 * Whether this caller can call ppal-context at all.
 * @param config - Current device settings
 * @returns True when ppal-context is available, or nothing narrows the toolset
 */
export function hasContextTool(config: Pick<NewUserConfig, "tools">): boolean {
  return config.tools == null || config.tools.includes(CONTEXT_TOOL_ID);
}
