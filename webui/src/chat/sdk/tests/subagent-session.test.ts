// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/chat/sdk/spawn-subagent-tool";
import {
  type SubagentTranscriptStash,
  attachStashedTranscripts,
  isSpawnToolResult,
} from "#webui/chat/sdk/subagent-session";
import { type ChatMessage } from "#webui/chat/sdk/types";

const transcript = (text: string): ChatMessage[] => [
  { role: "user", content: "do it" },
  { role: "assistant", content: text },
];

/**
 * An assistant message holding one spawn call and, optionally, its result.
 * @param id - Tool-call id
 * @param withResult - Whether to include the matching tool-result entry
 * @returns The assistant message
 */
function spawnMessage(id: string, withResult = true): ChatMessage {
  return {
    role: "assistant",
    content: "",
    toolCalls: [{ id, name: SPAWN_SUBAGENT_TOOL_NAME, args: { task: "x" } }],
    ...(withResult && {
      toolResults: [
        {
          id,
          name: SPAWN_SUBAGENT_TOOL_NAME,
          args: { task: "x" },
          result: "done",
        },
      ],
    }),
  };
}

describe("attachStashedTranscripts", () => {
  it("hangs a stashed transcript off its own spawn tool-result", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "go" },
      spawnMessage("tc1"),
    ];
    const stash: SubagentTranscriptStash = new Map([
      ["tc1", transcript("worker one")],
    ]);

    attachStashedTranscripts(history, 0, stash);

    expect(
      history[1]?.toolResults?.[0]?.subagentTranscript?.at(-1)?.content,
    ).toBe("worker one");
  });

  it("matches each parallel worker to its own result", () => {
    const both = spawnMessage("tc1");

    both.toolCalls?.push({
      id: "tc2",
      name: SPAWN_SUBAGENT_TOOL_NAME,
      args: { task: "y" },
    });
    both.toolResults?.push({
      id: "tc2",
      name: SPAWN_SUBAGENT_TOOL_NAME,
      args: { task: "y" },
      result: "done",
    });

    const stash: SubagentTranscriptStash = new Map([
      ["tc1", transcript("worker one")],
      ["tc2", transcript("worker two")],
    ]);

    attachStashedTranscripts([both], 0, stash);

    expect(both.toolResults?.[0]?.subagentTranscript?.at(-1)?.content).toBe(
      "worker one",
    );
    expect(both.toolResults?.[1]?.subagentTranscript?.at(-1)?.content).toBe(
      "worker two",
    );
  });

  it("is idempotent — a second pass does not overwrite", () => {
    // The mid-stream pass and the stream's finally both run over one turn, so
    // re-attaching must not replace what the first pass already resolved.
    const history = [spawnMessage("tc1")];
    const first = transcript("first");

    attachStashedTranscripts(history, 0, new Map([["tc1", first]]));
    attachStashedTranscripts(
      history,
      0,
      new Map([["tc1", transcript("second")]]),
    );

    expect(history[0]?.toolResults?.[0]?.subagentTranscript).toBe(first);
  });

  it("skips messages before fromIndex", () => {
    const history: ChatMessage[] = [spawnMessage("tc1"), spawnMessage("tc2")];
    const stash: SubagentTranscriptStash = new Map([
      ["tc1", transcript("old turn")],
      ["tc2", transcript("this turn")],
    ]);

    attachStashedTranscripts(history, 1, stash);

    expect(history[0]?.toolResults?.[0]?.subagentTranscript).toBeUndefined();
    expect(history[1]?.toolResults?.[0]?.subagentTranscript).toBeDefined();
  });

  it("leaves ordinary tool results and unstashed spawns alone", () => {
    const history: ChatMessage[] = [
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc1", name: "ppal-read-live-set", args: {} }],
        toolResults: [
          { id: "tc1", name: "ppal-read-live-set", args: {}, result: "{}" },
        ],
      },
      spawnMessage("tc-unknown"),
      { role: "user", content: "unrelated" },
    ];

    attachStashedTranscripts(history, 0, new Map([["tc1", transcript("no")]]));

    expect(history[0]?.toolResults?.[0]?.subagentTranscript).toBeUndefined();
    expect(history[1]?.toolResults?.[0]?.subagentTranscript).toBeUndefined();
  });

  it("no-ops for a spawn call that has no result entry yet", () => {
    // Mid-stream, between the tool-call part and the tool-result part.
    const history = [spawnMessage("tc1", false)];

    attachStashedTranscripts(history, 0, new Map([["tc1", transcript("x")]]));

    expect(history[0]?.toolResults).toBeUndefined();
  });
});

describe("isSpawnToolResult", () => {
  it("accepts only a spawn_subagent tool-result part", () => {
    expect(
      isSpawnToolResult({
        type: "tool-result",
        toolName: SPAWN_SUBAGENT_TOOL_NAME,
      }),
    ).toBe(true);
    expect(
      isSpawnToolResult({
        type: "tool-result",
        toolName: "ppal-read-live-set",
      }),
    ).toBe(false);
    expect(
      isSpawnToolResult({
        type: "tool-call",
        toolName: SPAWN_SUBAGENT_TOOL_NAME,
      }),
    ).toBe(false);
    expect(isSpawnToolResult({ type: "text-delta" })).toBe(false);
  });
});
