// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";

// Gemini Live streams the conversation as incremental transcript deltas
// (input = user speech, output = model speech) plus separate tool calls — there
// is no ready-made history object like the OpenAI SDK's RealtimeSession. This
// builder accumulates those deltas into the SAME RealtimeItem[] shape the rest
// of voice mode already consumes (persistence, realtimeItemsToUIMessages), so
// the Gemini session reuses the OpenAI transcript UI and saved-record format
// unchanged. toRealtimeItems() returns brand-new objects each call (no shared
// mutable state) so Preact re-renders and autosave snapshots stay correct.

type Turn =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; done: boolean }
  | {
      kind: "tool";
      id: string;
      name: string;
      args: string;
      output: string | null;
    };

/**
 * Accumulates Gemini Live transcript deltas + tool calls into RealtimeItem[].
 * One instance per session; the hook calls the mutators as messages arrive and
 * publishes toRealtimeItems() to React state.
 */
export class GeminiHistoryBuilder {
  private turns: Turn[] = [];

  /**
   * Append a user-speech transcript delta to the current (or a new) user turn.
   * @param text - Transcript delta
   */
  addUserTranscript(text: string): void {
    if (!text) return;
    this.closeAssistant();
    const last = this.turns.at(-1);

    if (last?.kind === "user") {
      last.text += text;

      return;
    }

    this.turns.push({ kind: "user", id: newId(), text });
  }

  /**
   * Append a model-speech transcript delta to the current (or a new) turn.
   * @param text - Transcript delta
   */
  addAssistantTranscript(text: string): void {
    if (!text) return;
    const last = this.turns.at(-1);

    if (last?.kind === "assistant" && !last.done) {
      last.text += text;

      return;
    }

    this.turns.push({ kind: "assistant", id: newId(), text, done: false });
  }

  /**
   * Record a tool call. Closes any open assistant text turn so a follow-up
   * narration renders as a distinct bubble part (text → tool → text), matching
   * how a multi-step assistant turn already renders in chat.
   *
   * @param id - The Gemini functionCall id (matched on output)
   * @param name - Tool name
   * @param args - Tool arguments object
   */
  addToolCall(id: string, name: string, args: Record<string, unknown>): void {
    this.closeAssistant();
    this.turns.push({
      kind: "tool",
      id,
      name,
      args: JSON.stringify(args),
      output: null,
    });
  }

  /**
   * Fill in a tool call's result once it returns.
   *
   * @param id - The functionCall id supplied to addToolCall
   * @param output - The tool's string output
   */
  setToolOutput(id: string, output: string): void {
    const turn = this.turns.find((t) => t.kind === "tool" && t.id === id);

    if (turn?.kind === "tool") turn.output = output;
  }

  /** Mark the current assistant turn complete (Gemini turnComplete / barge-in). */
  completeTurn(): void {
    this.closeAssistant();
  }

  /** Clear all accumulated turns. Mutates in place so closed-over references
   * (e.g. an in-flight tool-call handler) keep writing into the live builder
   * instead of an orphaned instance that publishHistory's identity check would
   * drop. */
  reset(): void {
    this.turns = [];
  }

  /**
   * Snapshot the accumulated turns as fresh RealtimeItem objects.
   * @returns The synthesized history items
   */
  toRealtimeItems(): RealtimeItem[] {
    return this.turns.map((t): RealtimeItem => {
      if (t.kind === "user") {
        return {
          itemId: t.id,
          type: "message",
          role: "user",
          status: "completed",
          content: [{ type: "input_audio", transcript: t.text }],
        };
      }

      if (t.kind === "assistant") {
        return {
          itemId: t.id,
          type: "message",
          role: "assistant",
          status: t.done ? "completed" : "in_progress",
          content: [{ type: "output_audio", transcript: t.text }],
        };
      }

      return {
        itemId: t.id,
        type: "function_call",
        status: t.output == null ? "in_progress" : "completed",
        name: t.name,
        arguments: t.args,
        output: t.output,
      };
    });
  }

  private closeAssistant(): void {
    const last = this.turns.at(-1);

    if (last?.kind === "assistant") last.done = true;
  }
}

/**
 * Unique, stable id for a synthesized history item (dedup keys on itemId).
 * @returns A unique item id
 */
function newId(): string {
  return `gem-${crypto.randomUUID()}`;
}
