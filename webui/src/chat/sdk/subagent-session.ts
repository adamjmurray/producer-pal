// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Worker-session state that has to outlive a single spawn: the stash a worker's
 * transcript lands in, and how it gets from there onto the orchestrator's
 * tool-result entries.
 *
 * A worker runs entirely inside the spawn tool's execute(), so its transcript
 * can't ride the tool's return value (that string is what the orchestrator MODEL
 * sees, and the full log would blow up its context). It goes into this stash
 * instead, keyed by tool-call id, and is hung off the matching tool-result entry
 * out-of-band — persisted with the conversation, rendered by the card, never
 * sent to the model.
 */

import { SPAWN_SUBAGENT_TOOL_NAME } from "./spawn-subagent-tool";
import { type ChatMessage } from "./types";

/** Worker transcripts awaiting attachment, keyed by their spawn tool-call id. */
export type SubagentTranscriptStash = Map<string, ChatMessage[]>;

/**
 * Hang every stashed worker transcript off its own spawn tool-result entry,
 * scanning the messages recorded from `fromIndex` on (this turn's).
 *
 * Two callers, because a transcript can reach history two ways. On a clean run
 * the tool-result part arrives mid-stream and this runs right then, so the card
 * gets its transcript as soon as the worker finishes. On a Stop mid-worker no
 * tool-result part ever arrives — reconcileDanglingToolCalls synthesizes a
 * "canceled" one in the stream's finally — and this runs after it to attach
 * whatever partial work the worker had done. Without that second pass a stopped
 * worker's log (which may describe edits already made to the Live Set) would be
 * discarded entirely.
 *
 * Idempotent: an entry that already carries a transcript is left alone, so the
 * mid-stream pass and the finally pass can both run over the same turn.
 * @param history - The orchestrator's chat history
 * @param fromIndex - First history index to scan (the turn's starting length)
 * @param stash - Transcripts recorded by this client's workers
 */
export function attachStashedTranscripts(
  history: ChatMessage[],
  fromIndex: number,
  stash: SubagentTranscriptStash,
): void {
  for (let i = fromIndex; i < history.length; i++) {
    const msg = history[i] as ChatMessage;

    if (msg.role !== "assistant") continue;

    for (const entry of msg.toolResults ?? []) {
      if (
        entry.name !== SPAWN_SUBAGENT_TOOL_NAME ||
        entry.subagentTranscript != null
      ) {
        continue;
      }

      const transcript = stash.get(entry.id);

      if (transcript) entry.subagentTranscript = transcript;
    }
  }
}

/**
 * Whether a stream part is a spawn_subagent tool-result — the mid-stream moment
 * a worker's transcript becomes attachable.
 * @param part - The stream part just handled
 * @returns True for a spawn_subagent tool-result part
 */
export function isSpawnToolResult(part: Record<string, unknown>): boolean {
  return (
    part.type === "tool-result" && part.toolName === SPAWN_SUBAGENT_TOOL_NAME
  );
}
