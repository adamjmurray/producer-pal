// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Worker-session state that has to outlive a single spawn: the stash a worker's
 * transcript lands in, how it gets from there onto the orchestrator's tool-result
 * entries, and how those entries are read back to resume a worker later.
 *
 * A worker runs entirely inside the spawn tool's execute(), so its transcript
 * can't ride the tool's return value (that string is what the orchestrator MODEL
 * sees, and the full log would blow up its context). It goes into this stash
 * instead, keyed by tool-call id, and is hung off the matching tool-result entry
 * out-of-band — persisted with the conversation, rendered by the card, never sent
 * to the model.
 *
 * That persisted transcript is also the whole of a worker's resumable state. A
 * resume needs no live client and no saved ChatClientConfig: it seeds a fresh
 * worker with the recorded history and runs one more turn under the CURRENT
 * settings, matching how a restored conversation already spawns workers under
 * whatever preset is selected now (see SubagentConfigOverride).
 */

import { SPAWN_SUBAGENT_TOOL_NAME } from "./spawn-subagent-tool";
import { type ChatMessage } from "./types";

/** One worker run: the transcript it produced and the worker's own index. */
export interface SubagentRun {
  /** 1-based worker identity, shared by every run of the same worker. */
  index: number;
  /** What this run added to the session (the whole thing for a first run). */
  transcript: ChatMessage[];
}

/** Worker runs awaiting attachment, keyed by their spawn tool-call id. */
export type SubagentTranscriptStash = Map<string, SubagentRun>;

/**
 * Hang every stashed worker run off its own spawn tool-result entry, scanning
 * the messages recorded from `fromIndex` on (this turn's).
 *
 * Two callers, because a run can reach history two ways. On a clean run the
 * tool-result part arrives mid-stream and this runs right then, so the card gets
 * its transcript as soon as the worker finishes. On a Stop mid-worker no
 * tool-result part ever arrives — reconcileDanglingToolCalls synthesizes a
 * "canceled" one in the stream's finally — and this runs after it to attach
 * whatever partial work the worker had done. Without that second pass a stopped
 * worker's log (which may describe edits already made to the Live Set) would be
 * discarded entirely, and there would be nothing to resume it from.
 *
 * Idempotent: an entry that already carries a transcript is left alone, so the
 * mid-stream pass and the finally pass can both run over the same turn.
 * @param history - The orchestrator's chat history
 * @param fromIndex - First history index to scan (the turn's starting length)
 * @param stash - Runs recorded by this client's workers
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

      const run = stash.get(entry.id);

      if (!run) continue;

      entry.subagentTranscript = run.transcript;
      entry.subagentIndex = run.index;
    }
  }
}

/**
 * Reassemble a worker's full session from every run recorded under `index`, in
 * conversation order: the first run's whole transcript plus each later resume's
 * delta. The result is a deep copy, so the worker it seeds can append to (and
 * the retry path can truncate) its own history without writing through to the
 * transcripts persisted on the conversation.
 *
 * That copy is not optional. The seeded array IS the worker's live chatHistory,
 * and the rate-limit restart path truncates it in place — pointing that at a
 * persisted transcript would erase the record of a run that already happened.
 * @param history - The orchestrator's chat history
 * @param index - The 1-based worker index to reassemble
 * @returns The worker's session so far, or undefined when no such worker exists
 */
export function collectSubagentTranscript(
  history: ChatMessage[],
  index: number,
): ChatMessage[] | undefined {
  const session: ChatMessage[] = [];

  for (const msg of history) {
    for (const entry of msg.toolResults ?? []) {
      if (entry.subagentIndex === index && entry.subagentTranscript) {
        session.push(...entry.subagentTranscript);
      }
    }
  }

  return session.length > 0 ? structuredClone(session) : undefined;
}

/**
 * Highest worker index already recorded in `history`, or 0 for none.
 *
 * Seeds the orchestrator's index allocator so a restored conversation keeps
 * numbering where it left off. Without it the counter would restart at 1 and a
 * new worker would collide with a persisted one, making `resumeFrom` address two
 * different sessions at once.
 * @param history - The orchestrator's chat history
 * @returns The highest index in use, or 0 when the conversation has no subagents
 */
export function highestSubagentIndex(history: ChatMessage[]): number {
  let highest = 0;

  for (const msg of history) {
    for (const entry of msg.toolResults ?? []) {
      if (entry.subagentIndex != null && entry.subagentIndex > highest) {
        highest = entry.subagentIndex;
      }
    }
  }

  return highest;
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
