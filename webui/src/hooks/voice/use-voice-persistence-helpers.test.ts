// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type RealtimeItem } from "@openai/agents/realtime";
import { describe, expect, it } from "vitest";
import { mergeVoiceHistory } from "#webui/hooks/voice/use-voice-persistence-helpers";

const item = (
  itemId: string,
  type: RealtimeItem["type"] = "message",
): RealtimeItem => ({ itemId, type }) as unknown as RealtimeItem;

describe("mergeVoiceHistory", () => {
  it("returns live as-is when prior is empty (fresh session)", () => {
    const live = [item("a"), item("b")];

    expect(mergeVoiceHistory([], live)).toStrictEqual(live);
  });

  it("returns prior as-is when live is empty (just loaded a saved record)", () => {
    const prior = [item("a"), item("b", "function_call")];

    expect(mergeVoiceHistory(prior, [])).toStrictEqual(prior);
  });

  it("preserves prior function_call items that live doesn't contain (post-prime save)", () => {
    const prior: RealtimeItem[] = [
      item("u1"),
      item("fc1", "function_call"),
      item("a1"),
    ];
    // After priming, only message items round-trip; function_call dropped.
    const live: RealtimeItem[] = [item("u1"), item("a1")];

    const merged = mergeVoiceHistory(prior, live);

    expect(merged).toStrictEqual([
      item("u1"),
      item("fc1", "function_call"),
      item("a1"),
    ]);
  });

  it("appends new live items at the end (continued conversation)", () => {
    const prior: RealtimeItem[] = [
      item("u1"),
      item("fc1", "function_call"),
      item("a1"),
    ];
    const live: RealtimeItem[] = [
      item("u1"),
      item("a1"),
      item("u2"),
      item("fc2", "function_call"),
      item("a2"),
    ];

    const merged = mergeVoiceHistory(prior, live);

    expect(merged.map((m) => m.itemId)).toStrictEqual([
      "u1",
      "fc1",
      "a1",
      "u2",
      "fc2",
      "a2",
    ]);
  });

  it("deduplicates live items that share an id with prior items", () => {
    const prior: RealtimeItem[] = [item("u1"), item("a1")];
    const live: RealtimeItem[] = [item("u1"), item("a1")];

    const merged = mergeVoiceHistory(prior, live);

    expect(merged.map((m) => m.itemId)).toStrictEqual(["u1", "a1"]);
  });
});
