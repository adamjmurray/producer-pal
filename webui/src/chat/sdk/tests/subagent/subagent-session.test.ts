// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { SPAWN_SUBAGENT_TOOL_NAME } from "#webui/chat/sdk/subagent/spawn-subagent-tool";
import {
  type SubagentRun,
  type SubagentTranscriptStash,
  attachStashedTranscripts,
  collectSubagentTranscript,
  highestSubagentIndex,
  isSpawnToolResult,
} from "#webui/chat/sdk/subagent/subagent-session";
import { type ChatMessage } from "#webui/chat/sdk/types";

const transcript = (text: string): ChatMessage[] => [
  { role: "user", content: "do it" },
  { role: "assistant", content: text },
];

const run = (text: string, index = 1): SubagentRun => ({
  index,
  transcript: transcript(text),
});

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

/**
 * A recorded spawn result: one assistant message carrying a worker's stored
 * transcript under its index, as the persisted conversation holds it.
 * @param index - The worker's 1-based index
 * @param messages - The transcript stored on this run's entry
 * @returns The assistant message
 */
function recordedRun(index: number, messages: ChatMessage[]): ChatMessage {
  return {
    role: "assistant",
    content: "",
    toolCalls: [
      { id: `tc${index}`, name: SPAWN_SUBAGENT_TOOL_NAME, args: { task: "x" } },
    ],
    toolResults: [
      {
        id: `tc${index}`,
        name: SPAWN_SUBAGENT_TOOL_NAME,
        args: { task: "x" },
        result: "done",
        subagentIndex: index,
        subagentTranscript: messages,
      },
    ],
  };
}

describe("attachStashedTranscripts", () => {
  it("hangs a stashed run off its own spawn tool-result, index and all", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "go" },
      spawnMessage("tc1"),
    ];
    const stash: SubagentTranscriptStash = new Map([
      ["tc1", run("worker one", 4)],
    ]);

    attachStashedTranscripts(history, 0, stash);

    const entry = history[1]?.toolResults?.[0];

    expect(entry?.subagentTranscript?.at(-1)?.content).toBe("worker one");
    // The index is the worker's durable identity, so it has to be persisted
    // alongside the transcript — resumeFrom addresses workers by it.
    expect(entry?.subagentIndex).toBe(4);
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
      ["tc1", run("worker one", 1)],
      ["tc2", run("worker two", 2)],
    ]);

    attachStashedTranscripts([both], 0, stash);

    expect(both.toolResults?.[0]?.subagentTranscript?.at(-1)?.content).toBe(
      "worker one",
    );
    expect(both.toolResults?.[1]?.subagentTranscript?.at(-1)?.content).toBe(
      "worker two",
    );
    expect(both.toolResults?.map((tr) => tr.subagentIndex)).toStrictEqual([
      1, 2,
    ]);
  });

  it("is idempotent — a second pass does not overwrite", () => {
    // The mid-stream pass and the stream's finally both run over one turn, so
    // re-attaching must not replace what the first pass already resolved.
    const history = [spawnMessage("tc1")];
    const first = run("first");

    attachStashedTranscripts(history, 0, new Map([["tc1", first]]));
    attachStashedTranscripts(history, 0, new Map([["tc1", run("second")]]));

    expect(history[0]?.toolResults?.[0]?.subagentTranscript).toBe(
      first.transcript,
    );
  });

  it("consumes the stash entry it attached", () => {
    // The transcript lives on the history entry from here on. Keeping the
    // stash's copy makes the Map the sole owner of every worker log once a
    // compaction reassigns chatHistory.
    const history = [spawnMessage("tc1")];
    const stash: SubagentTranscriptStash = new Map([
      ["tc1", run("worker one")],
    ]);

    attachStashedTranscripts(history, 0, stash);

    expect(stash.size).toBe(0);
  });

  it("skips messages before fromIndex", () => {
    const history: ChatMessage[] = [spawnMessage("tc1"), spawnMessage("tc2")];
    const stash: SubagentTranscriptStash = new Map([
      ["tc1", run("old turn")],
      ["tc2", run("this turn")],
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

    attachStashedTranscripts(history, 0, new Map([["tc1", run("no")]]));

    expect(history[0]?.toolResults?.[0]?.subagentTranscript).toBeUndefined();
    expect(history[1]?.toolResults?.[0]?.subagentTranscript).toBeUndefined();
  });

  it("no-ops for a spawn call that has no result entry yet", () => {
    // Mid-stream, between the tool-call part and the tool-result part.
    const history = [spawnMessage("tc1", false)];

    attachStashedTranscripts(history, 0, new Map([["tc1", run("x")]]));

    expect(history[0]?.toolResults).toBeUndefined();
  });
});

describe("collectSubagentTranscript", () => {
  it("stitches a worker's first run and its resume deltas in order", () => {
    const history: ChatMessage[] = [
      recordedRun(1, [
        { role: "user", content: "write a bassline" },
        { role: "assistant", content: "Added the bassline." },
      ]),
      recordedRun(2, [{ role: "assistant", content: "other worker" }]),
      {
        ...recordedRun(1, [
          { role: "user", content: "now make it swing" },
          { role: "assistant", content: "Swung it." },
        ]),
      },
    ];

    const session = collectSubagentTranscript(history, 1);

    expect(session?.map((m) => m.content)).toStrictEqual([
      "write a bassline",
      "Added the bassline.",
      "now make it swing",
      "Swung it.",
    ]);
  });

  it("returns a deep copy so the worker cannot write through to history", () => {
    // The seeded array becomes the worker's live chatHistory, which a run
    // appends to and mutates in place. Sharing it would corrupt the record.
    const stored: ChatMessage[] = [{ role: "assistant", content: "original" }];
    const history = [recordedRun(1, stored)];

    const session = collectSubagentTranscript(history, 1) as ChatMessage[];

    session.push({ role: "user", content: "more" });
    (session[0] as ChatMessage).content = "mutated";
    session.length = 0;

    expect(stored).toHaveLength(1);
    expect(stored[0]?.content).toBe("original");
  });

  it("returns undefined for a worker the conversation never had", () => {
    const history = [recordedRun(1, [{ role: "assistant", content: "x" }])];

    expect(collectSubagentTranscript(history, 7)).toBeUndefined();
    expect(collectSubagentTranscript([], 1)).toBeUndefined();
  });

  it("ignores entries with an index but no stored transcript", () => {
    const history = [recordedRun(1, [])];

    expect(collectSubagentTranscript(history, 1)).toBeUndefined();
  });
});

describe("highestSubagentIndex", () => {
  it("returns the highest index recorded in the conversation", () => {
    const history = [
      recordedRun(1, [{ role: "assistant", content: "a" }]),
      recordedRun(3, [{ role: "assistant", content: "b" }]),
      recordedRun(2, [{ role: "assistant", content: "c" }]),
    ];

    expect(highestSubagentIndex(history)).toBe(3);
  });

  it("returns 0 for a conversation with no subagents", () => {
    expect(highestSubagentIndex([])).toBe(0);
    expect(highestSubagentIndex([{ role: "user", content: "hi" }])).toBe(0);
    // A spawn from before workers were numbered carries no index.
    expect(highestSubagentIndex([spawnMessage("tc1")])).toBe(0);
  });
});

describe("isSpawnToolResult", () => {
  it("accepts a spawn_subagent tool-result or tool-error part", () => {
    expect(
      isSpawnToolResult({
        type: "tool-result",
        toolName: SPAWN_SUBAGENT_TOOL_NAME,
      }),
    ).toBe(true);
    // A spawn that threw (retry budget spent, MAX_SPAWNS, bad resumeFrom) still
    // has a transcript worth showing — usually the most worth showing.
    expect(
      isSpawnToolResult({
        type: "tool-error",
        toolName: SPAWN_SUBAGENT_TOOL_NAME,
      }),
    ).toBe(true);
    expect(
      isSpawnToolResult({
        type: "tool-error",
        toolName: "ppal-read-live-set",
      }),
    ).toBe(false);
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
