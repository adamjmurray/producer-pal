// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type CallLiveApiFunction } from "../../create-mcp-server.ts";
import { readGlobalContext } from "../global-context/global-context-store.ts";
import { listMemoryEntries } from "../memory/global-memory-store.ts";
import {
  withConnectAppend,
  type WrappedCallLiveApi,
} from "./connect-append.ts";

// The ppal-connect "what to do now" instruction. It used to be a static
// `nextStep` field inside V8's connect() result, which put it BEFORE the four
// enrichment blocks the Node side appends (skills, project, global, memory) —
// so the model read "wait for their instructions" and then kept reading. Moving
// it here makes it the LAST thing in the response (compose withNextStep
// outermost) and lets it vary with what those blocks contained, which V8 can't
// do: it has no filesystem, so it cannot see whether the user has any global
// context or memories.
//
// The variance buys onboarding. A user with no global context and no memories
// is one we know nothing about, and the memory system is invisible unless the
// assistant raises it — so for exactly that case the next step also asks them
// about themselves. Anything they share becomes memory; a decline becomes a
// memory too, which is what makes the offer one-shot: writing any memory flips
// this check, so the next connect gets the plain instruction. Deleting that
// entry in the Memory tab brings the offer back, which is the right semantics
// and costs no code.

const BASE_NEXT_STEP =
  "Report the connection status and Live Set overview to the user, then wait for their instructions.";

const ONBOARDING_NEXT_STEP =
  "Report the connection status and Live Set overview to the user. " +
  "You have no context or memories about this user yet, so in that same reply, " +
  "briefly invite them to tell you about their musical style, preferences, and goals — " +
  "mention you'll remember it across sessions. Keep it to a sentence or two and " +
  "don't interrogate them. Save what they share to memory (ppal-context " +
  'action:"write", scope:"memory"). If they decline or just get on with the ' +
  "music, write a memory recording that they don't want to be asked, so you " +
  "never raise it again. Then wait for their instructions.";

/**
 * Wrap a callLiveApi so a successful ppal-connect response ends with the next-
 * step instruction. Compose this OUTERMOST so the block lands last, after the
 * skills/context/memory blocks it reacts to.
 *
 * @param inner - The underlying callLiveApi to wrap
 * @param getSmallModelMode - Reads the current small-model-mode setting
 * @returns A callLiveApi that appends the next step to ppal-connect results
 */
export function withNextStep(
  inner: CallLiveApiFunction,
  getSmallModelMode: () => boolean,
): WrappedCallLiveApi {
  return withConnectAppend(inner, () => nextStepBlock(getSmallModelMode()));
}

// --- Helpers below main export ---

/**
 * The next-step block, onboarding variant for a user we know nothing about.
 * Unlike the other connect blocks this one never returns null — every connect
 * response gets a next step.
 *
 * @param smallModelMode - Whether small-model mode is active
 * @returns The next-step text
 */
function nextStepBlock(smallModelMode: boolean): string {
  return isNewUser(smallModelMode) ? ONBOARDING_NEXT_STEP : BASE_NEXT_STEP;
}

/**
 * Whether this is a user we have learned nothing about yet: no pinned global
 * context and no memories. Always false in small-model mode — that tool surface
 * drops scope:memory entirely, so a small model could neither save what it
 * learned nor record a decline, and would re-ask on every connect forever.
 *
 * Project context is deliberately not consulted: it describes the Live Set, not
 * the person, and a user can have a project blob while still being a stranger.
 *
 * @param smallModelMode - Whether small-model mode is active
 * @returns True when the onboarding next step should be used
 */
function isNewUser(smallModelMode: boolean): boolean {
  if (smallModelMode) return false;

  if (readGlobalContext().trim()) return false;

  return listMemoryEntries().length === 0;
}
