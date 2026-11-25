// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { NEW_USER_MARKER } from "#src/skills/fragments/context.ts";
import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import { readGlobalContext } from "../global-context/global-context-store.ts";
import { listMemoryEntries } from "../memory/memory-store.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect-append.ts";
import { hasContextTool, isNewUser } from "./new-user.ts";

// The ppal-connect "what to do now" instruction. It is appended Node-side so it
// is the LAST thing in the response (compose withNextStep outermost): as a
// field inside V8's connect() result it came BEFORE the enrichment blocks, so
// the model read "wait for their instructions" and then kept reading. It also
// varies with what those blocks contained, which V8 can't see (no filesystem).
//
// It STATES which layers are empty. The injectors skip their block when they
// have nothing, and models reason badly about absence: a Claude Desktop session
// told global context was empty didn't believe it and never called ppal-context
// to check. Say it out loud.
//
// A user with no global context and no memories is a new user. The result only
// states that fact; the context Skill says what to do about it. Models such as
// Haiku ignore imperative instructions in a tool result as untrusted.
//
// The offer is one-shot with no "already asked" flag: sharing fills global
// context and declining writes a memory, and EITHER flips isNewUser, so the next
// connect gets the plain next step. Clearing both brings the offer back.

/** Device settings the next-step block varies on. */
export interface NextStepConfig {
  smallModelMode: boolean;
  /** This Live Set's context blob (held by the Max device, not the fs). */
  projectContext: string;
  /**
   * The tools this caller can call — the global whitelist, or one request's
   * narrowed set. Omitted ⇒ no gating.
   */
  tools?: readonly string[];
}

const BASE_NEXT_STEP =
  "Report the connection status and Live Set overview to the user, then wait for their instructions.";

const ONBOARDING_NEXT_STEP = `${BASE_NEXT_STEP} New user: ${NEW_USER_MARKER}.`;

/**
 * Wrap a callLiveApi so a successful ppal-connect response ends with what is
 * empty and what to do now. Compose this OUTERMOST so the block lands last,
 * after the skills/context/memory blocks it reports on.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getConfig - Reads the current device settings
 * @returns A callLiveApi that appends the next step to ppal-connect results
 */
export function withNextStep(
  inner: CallLiveApiFunction,
  getConfig: () => NextStepConfig,
): WrappedCallLiveApi {
  return withConnectAppend(inner, () => nextStepBlock(getConfig()));
}

// --- Helpers below main export ---

/**
 * The final connect block: which layers are empty, then what to do now. Unlike
 * the other connect blocks this one never returns null — every connect response
 * gets a next step.
 *
 * @param config - Current device settings
 * @returns The next-step text
 */
function nextStepBlock(config: NextStepConfig): string {
  const empty = emptyLayers(config);
  const nextStep = isNewUser(config) ? ONBOARDING_NEXT_STEP : BASE_NEXT_STEP;

  if (empty.length === 0) {
    return nextStep;
  }

  return `Currently empty: ${empty.join(", ")}.\n\n${nextStep}`;
}

/**
 * The layers with nothing in them, named as the user-facing scopes. Stated
 * explicitly because the injectors for those layers emit no block at all when
 * empty, and a missing block is not something a model reliably notices.
 *
 * Memory is omitted in small-model mode, whose ppal-context has no
 * scope:memory — naming a layer it cannot address would only confuse it.
 *
 * @param config - Current device settings
 * @returns Names of the empty layers, in injected order
 */
function emptyLayers(config: NextStepConfig): string[] {
  // A caller without ppal-context can neither read these layers nor fill them,
  // and the toolset gate already drops the context skills fragment — so this
  // would be the only mention of them left, in a response that can do nothing
  // about it.
  if (!hasContextTool(config)) {
    return [];
  }

  const empty: string[] = [];

  if (!config.projectContext.trim()) {
    empty.push("project context");
  }

  if (!readGlobalContext().trim()) {
    empty.push("global context");
  }

  if (!config.smallModelMode && listMemoryEntries().length === 0) {
    empty.push("memory");
  }

  return empty;
}
