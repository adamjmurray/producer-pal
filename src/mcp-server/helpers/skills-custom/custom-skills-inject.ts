// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "../connect/connect-append.ts";
import {
  listCustomSkills,
  renderEnabledSkillsIndex,
} from "./custom-skills-store.ts";

/**
 * Wrap a callLiveApi so a successful ppal-connect response carries the user's
 * custom-skills INDEX (~/.producer-pal/skills-custom/) as a distinct content
 * block. Injection is index-only (v1): every enabled skill contributes just its
 * `name — description` hook, never its body — the body loads on demand via
 * `ppal-context read`. Disabled skills are omitted entirely. When nothing is
 * enabled the block is skipped. V8 has no filesystem, so this is assembled
 * Node-side, the only path reaching external MCP clients.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @returns A callLiveApi that appends the custom-skills index to connect results
 */
export function withCustomSkills(
  inner: CallLiveApiFunction,
): WrappedCallLiveApi {
  return withConnectAppend(inner, customSkillsBlock);
}

// --- Helpers below main export ---

/**
 * The custom-skills index block to append, or null when nothing is enabled.
 * Only enabled skills' hooks are injected; bodies load on demand.
 *
 * @returns The labeled custom-skills index text, or null to skip
 */
function customSkillsBlock(): string | null {
  const index = renderEnabledSkillsIndex(listCustomSkills());

  if (!index) return null;

  return (
    "Producer Pal custom skills — user-authored instruction packs for this " +
    "user's workflow. This is the index; when a skill's description fits the " +
    "task, load its full instructions with ppal-context " +
    '(action:"read", scope:"skills", name:"<name>") before proceeding.\n\n' +
    index
  );
}
