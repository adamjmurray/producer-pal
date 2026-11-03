// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Builds the state Jev reads: the same transcript and check results the
 * LLM judge sees, cut down to fit Jev's input limit.
 */

import {
  formatCheckResults,
  formatTranscript,
  type CheckSummary,
  type TranscriptTurn,
} from "#evals/scenarios/assertions/llm-judge.ts";

/** Jev rejects state past 32k tokens. Stay well under, at ~4 chars/token. */
export const MAX_STATE_CHARS = 80_000;
const MIN_RESULT_CHARS = 200;

export interface JevState {
  transcript: string;
  deterministicChecks: string;
}

export interface BuiltJevState {
  state: JevState;
  /** True when tool results or the transcript had to be cut */
  truncated: boolean;
}

/**
 * Format a run for Jev, truncating the longest tool results first.
 *
 * @param turns - The run's conversation turns
 * @param checks - Deterministic check results
 * @param maxChars - Size budget for transcript plus checks
 * @returns The state and whether anything was cut
 */
export function buildJevState(
  turns: TranscriptTurn[],
  checks: CheckSummary[],
  maxChars: number = MAX_STATE_CHARS,
): BuiltJevState {
  const deterministicChecks =
    formatCheckResults(checks) || "(no deterministic checks)";
  const budget = Math.max(0, maxChars - deterministicChecks.length);
  const full = formatTranscript(turns);

  if (full.length <= budget) {
    return {
      state: { transcript: full, deterministicChecks },
      truncated: false,
    };
  }

  const capped = capResults(turns, budget);
  const transcript =
    capped.length <= budget ? capped : cutMiddle(capped, budget);

  return { state: { transcript, deterministicChecks }, truncated: true };
}

/**
 * Format the transcript with every tool result cut to the largest per-result
 * cap that fits the budget (so only the longest results shrink).
 *
 * @param turns - Conversation turns
 * @param budget - Max transcript characters
 * @returns The formatted transcript (may still exceed budget at the minimum cap)
 */
function capResults(turns: TranscriptTurn[], budget: number): string {
  const longest = Math.max(
    MIN_RESULT_CHARS,
    ...turns.flatMap((t) => t.toolCalls.map((tc) => tc.result?.length ?? 0)),
  );
  let low = MIN_RESULT_CHARS;
  let high = longest;

  while (low < high) {
    const mid = Math.ceil((low + high) / 2);

    if (formatTranscript(withCap(turns, mid)).length <= budget) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return formatTranscript(withCap(turns, low));
}

/**
 * Copy the turns with every tool result cut to `cap` characters.
 *
 * @param turns - Conversation turns
 * @param cap - Max characters per tool result
 * @returns Turns with shortened results
 */
function withCap(turns: TranscriptTurn[], cap: number): TranscriptTurn[] {
  return turns.map((turn) => ({
    ...turn,
    toolCalls: turn.toolCalls.map((tc) =>
      tc.result != null && tc.result.length > cap
        ? {
            ...tc,
            result: `${tc.result.slice(0, cap)}… [truncated ${tc.result.length - cap} chars]`,
          }
        : tc,
    ),
  }));
}

/**
 * Last resort when even short results don't fit: keep the start and end of
 * the transcript.
 *
 * @param text - The transcript
 * @param budget - Max characters
 * @returns The transcript with its middle replaced by a note
 */
function cutMiddle(text: string, budget: number): string {
  const note = "\n\n[... middle of transcript truncated ...]\n\n";
  const keep = Math.max(0, budget - note.length);
  const head = Math.ceil(keep / 2);

  return text.slice(0, head) + note + text.slice(text.length - (keep - head));
}
