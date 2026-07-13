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
// It also STATES which layers are empty. The other injectors skip their block
// when they have nothing, so an empty layer used to be signalled by the absence
// of a block — and models reason badly about absence. Observed in the wild: a
// Claude Desktop session was told global context was empty, didn't believe it,
// never called ppal-context to check, and admitted afterwards it was "just
// speculating". Absence is not a message; say it out loud.
//
// The variance buys onboarding. A user with no global context and no memories
// is one we know nothing about, and these layers are invisible unless the
// assistant raises them — so for exactly that case the next step also asks them
// about themselves. It ASKS, as a yes/no question, rather than saying "tell me
// anytime": a statement gives the user nothing to decline, so a brush-off like
// "let's just make some music" doesn't read as an answer and the decline never
// gets recorded — which means asking again every session, forever.
//
// What they say lands in GLOBAL context, not memory: style, preferences, and
// high-level goals should always apply, and always-on is what context is for
// (the skills teach the same split). It needs no confirmation because an empty
// document has nothing to destroy — the write-REPLACES-everything hazard that
// makes context the user's call simply isn't there yet. That license covers
// what the USER says here and nothing else; the skills separately forbid
// importing facts the assistant knows from its own memory without asking.
//
// Either way the offer is one-shot, with no dedicated "already asked" flag:
// sharing fills global context and declining writes a memory, and EITHER one
// flips the check below, so the next connect gets the plain instruction.
// Clearing both in the context editor brings the offer back, which is the right
// semantics and costs no code.

/** Device settings the next-step block varies on. */
export interface NextStepConfig {
  smallModelMode: boolean;
  /** This Live Set's context blob (held by the Max device, not the fs). */
  projectContext: string;
}

const BASE_NEXT_STEP =
  "Report the connection status and Live Set overview to the user, then wait for their instructions.";

const ONBOARDING_NEXT_STEP =
  "Report the connection status and Live Set overview to the user. Nothing is " +
  "stored about this user yet, so in that same reply ASK them — as a real " +
  "question they can answer yes or no — whether they'd like to tell you about " +
  "their musical style, preferences, and goals so you can remember it across " +
  "sessions. One or two sentences; don't interrogate them. If they answer, save " +
  'it to GLOBAL context (ppal-context action:"write", scope:"global") — that ' +
  "document is empty, so write it without asking. If they say no, or just get " +
  "on with making music without answering, write a memory recording that they " +
  "don't want to be asked, so you never raise it again. Then wait for their " +
  "instructions.";

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

  if (empty.length === 0) return nextStep;

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
  const empty: string[] = [];

  if (!config.projectContext.trim()) empty.push("project context");

  if (!readGlobalContext().trim()) empty.push("global context");

  if (!config.smallModelMode && listMemoryEntries().length === 0) {
    empty.push("memory");
  }

  return empty;
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
 * @param config - Current device settings
 * @returns True when the onboarding next step should be used
 */
function isNewUser(config: NextStepConfig): boolean {
  if (config.smallModelMode) return false;

  if (readGlobalContext().trim()) return false;

  return listMemoryEntries().length === 0;
}
